const $ = (selector) => document.querySelector(selector);
const MODE_LABELS = { general: "一般分析", fast: "快閃交易", overnight: "隔日沖", "low-entry": "低接掛價" };
const CHART_IMAGE_BUCKET = "chart-analysis-images";
const SHOW_IMAGE_QUALITY_NOTE = false;
let preparedImage = "";
let selectedFileName = "";
let busy = false;
let activeUserId = null;
let historyGeneration = 0;
let transferGeneration = 0;
let transferAttemptUserId = null;
let analysisProgressTimer = null;
let analysisProgressStartedAt = 0;
let resultImageData = "";
let currentAnalysisResult = null;
let currentAnalysisMeta = null;
let transferredAssetName = "";
let assetNames = new Map();
let exportBusy = false;
let viewerZoom = 1;
let viewerFitScale = 1;
let viewerDrag = null;
const historyImageCache = new Map();

const PROGRESS_STAGES = [
  { after: 0, label: "上傳與讀圖", message: "正在安全傳送圖片並確認線圖可讀性…" },
  { after: 4, label: "辨識價格趨勢", message: "正在辨識 K 線結構、均線排列與量價關係…" },
  { after: 12, label: "判讀技術指標", message: "正在交叉檢查 KD、MACD、RSI 與支撐壓力…" },
  { after: 24, label: "整理分析結論", message: "正在彙整風險、關鍵價位與交易計畫…" },
];

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const TECHNICAL_TONE_LEGEND = [
  ["bullish", "偏多"],
  ["bearish", "偏空"],
  ["neutral", "中性"],
  ["warning", "注意"],
];

const MARKET_STATE_EXPLANATIONS = {
  "強勢多頭": "高點與低點持續墊高，價格站在主要均線之上，且量價與動能大致配合。",
  "多頭拉回": "原有上升結構尚未破壞，目前屬短線回檔，重要均線或支撐仍有守。",
  "高檔震盪": "價格位於相對高檔，但短線方向不明，量價或技術指標開始出現分歧。",
  "區間整理": "價格在明確範圍內來回，尚未有效突破壓力或跌破支撐。",
  "弱勢反彈": "價格雖有反彈，但量能、均線或動能確認不足，反彈延續性仍待觀察。",
  "空頭反彈": "整體下降趨勢仍成立，目前上漲較像空頭結構中的反彈，尚未確認反轉。",
  "弱勢下跌": "高低點逐漸下移，價格位於主要均線下方，反彈力道偏弱但尚未加速急跌。",
  "加速下殺": "價格跌破重要支撐且跌勢擴大，可能伴隨放量、長綠 K 或連續下跌。",
  "資訊不足": "截圖內容不完整、數據模糊或可用訊號不足，因此無法可靠判定市場狀態。",
};

function buildToneLegend() {
  const legend = node("div", "ai-tone-legend");
  legend.setAttribute("aria-label", "技術判讀顏色圖例");
  TECHNICAL_TONE_LEGEND.forEach(([tone, label]) => {
    const item = node("span", tone);
    item.append(node("i"), document.createTextNode(label));
    legend.append(item);
  });
  return legend;
}

function buildMarketStateLabel(stateValue) {
  const state = stateValue || "資訊不足";
  const explanation = MARKET_STATE_EXPLANATIONS[state] || MARKET_STATE_EXPLANATIONS["資訊不足"];
  const row = node("div", "ai-market-state-row");
  row.append(node("span", "ai-market-state", state));
  const info = node("button", "ai-market-info", "i");
  info.type = "button";
  info.setAttribute("aria-label", `${state}：${explanation}`);
  info.append(node("span", "ai-market-tooltip", explanation));
  row.append(info);
  return row;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function localIsoDate() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function taipeiIsoDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(value));
}

function timingCategory(value) {
  const text = String(value || "");
  if (text.includes("盤後")) return "盤後";
  if (text.includes("盤前")) return "盤前";
  return "盤中";
}

function safeFilePart(value) {
  return String(value || "chart").replace(/[^0-9A-Za-z_-]+/g, "-").replace(/^-+|-+$/g, "") || "chart";
}

async function loadAssetNames() {
  try {
    const response = await fetch("trade_assets.json", { cache: "force-cache" });
    const payload = await response.json();
    (payload.assets || []).forEach((asset) => {
      const symbol = String(asset.symbol || "").toUpperCase();
      if (symbol && !assetNames.has(symbol)) assetNames.set(symbol, asset.name || symbol);
    });
  } catch (_) { /* 找不到名稱時以代號顯示 */ }
}

function resultSubject(meta = currentAnalysisMeta) {
  if (!meta) return "";
  return `${meta.symbol || "未填標的"} ${meta.assetName || meta.symbol || "未填名稱"} ${meta.date} ${meta.timing} 技術分析指引`;
}

function setExportTools(visible) {
  $("#resultExportTools").hidden = !visible;
}

function quotaText(access) {
  return access ? `${access.remaining ?? 0} / ${access.dailyLimit ?? 0}` : "—";
}

function setInputPanelCollapsed(collapsed) {
  const workspace = $("#aiWorkspace");
  const button = $("#toggleInputPanel");
  workspace.classList.toggle("input-collapsed", collapsed);
  button.setAttribute("aria-expanded", String(!collapsed));
  button.querySelector("span").textContent = collapsed ? "›" : "‹";
  button.querySelector("b").textContent = collapsed ? "展開設定" : "收合設定";
}

function setResultThumbnail(src = "") {
  resultImageData = src;
  const button = $("#resultChartThumb");
  if (!src) {
    button.hidden = true;
    $("#resultChartThumbImage").removeAttribute("src");
    return;
  }
  $("#resultChartThumbImage").src = src;
  button.hidden = false;
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("線圖格式無法保存");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] });
}

async function saveAnalysisImage(sb, userId, requestId, imageData, assetName) {
  if (!requestId) throw new Error("分析紀錄缺少識別碼");
  const blob = dataUrlToBlob(imageData);
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${requestId}.${extension}`;
  const { error: uploadError } = await sb.storage.from(CHART_IMAGE_BUCKET).upload(path, blob, {
    contentType: blob.type, cacheControl: "300", upsert: false
  });
  if (uploadError) throw new Error(uploadError.message || "線圖保存失敗");
  const { error: attachError } = await sb.rpc("attach_chart_analysis_image", {
    p_request_id: requestId, p_chart_path: path, p_asset_name: assetName || null
  });
  if (attachError) {
    await sb.storage.from(CHART_IMAGE_BUCKET).remove([path]);
    throw new Error(attachError.message || "線圖紀錄保存失敗");
  }
  historyImageCache.set(path, imageData);
}

function historyMeta(row) {
  const symbol = String(row.symbol || "").trim().toUpperCase();
  return {
    symbol,
    assetName: row.asset_name || assetNames.get(symbol) || symbol || "未填名稱",
    date: taipeiIsoDate(row.created_at),
    timing: timingCategory(row.screenshot_timing),
    modeLabel: MODE_LABELS[row.mode] || row.mode,
  };
}

function historyImageState(row) {
  if (!row.chart_path || !row.chart_expires_at) return "legacy";
  return new Date(row.chart_expires_at).getTime() <= Date.now() ? "expired" : "available";
}

async function loadHistoryImage(sb, row) {
  if (historyImageCache.has(row.chart_path)) return historyImageCache.get(row.chart_path);
  const { data, error } = await sb.storage.from(CHART_IMAGE_BUCKET).download(row.chart_path);
  if (error || !data) throw new Error("線圖已無法讀取，可能已超過 5 天保存期限");
  const dataUrl = await fileToDataUrl(data);
  historyImageCache.set(row.chart_path, dataUrl);
  return dataUrl;
}

async function cleanupExpiredHistoryImages(sb) {
  const { data } = await sb.from("chart_analysis_requests")
    .select("chart_path")
    .not("chart_path", "is", null)
    .lte("chart_expires_at", new Date().toISOString())
    .limit(100);
  const paths = [...new Set((data || []).map((row) => row.chart_path).filter(Boolean))];
  if (paths.length) await sb.storage.from(CHART_IMAGE_BUCKET).remove(paths);
}

async function activateHistoryResult(sb, row, notice) {
  const meta = historyMeta(row);
  currentAnalysisResult = null;
  currentAnalysisMeta = null;
  setExportTools(false);
  setResultThumbnail();
  $("#resultEmpty").hidden = true;
  $("#resultContent").hidden = false;
  renderAnalysis($("#resultContent"), row.result);
  const state = historyImageState(row);
  if (state !== "available") {
    const message = state === "expired"
      ? "此線圖已超過 5 天保存期限；文字分析仍可查看，但無法匯出 PDF 或寄送 Email。"
      : "此紀錄建立於線圖保存功能啟用前；僅保留文字分析，無法匯出 PDF 或寄送 Email。";
    notice.textContent = message;
    notice.hidden = false;
    $("#resultMeta").textContent = `${row.symbol || "未填標的"} · ${meta.modeLabel} · 線圖不可用`;
    $("#analysisStatus").className = "ai-status warning";
    $("#analysisStatus").textContent = message;
    $("#resultContent").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  notice.hidden = false;
  notice.textContent = "正在載入 5 天保存期內的原始線圖…";
  try {
    const imageData = await loadHistoryImage(sb, row);
    currentAnalysisResult = row.result;
    currentAnalysisMeta = meta;
    setResultThumbnail(imageData);
    setExportTools(true);
    notice.textContent = `線圖可使用至 ${new Date(row.chart_expires_at).toLocaleString("zh-TW")}，可匯出 PDF 或寄送 Email。`;
    $("#resultMeta").textContent = `${row.symbol || "未填標的"} · ${meta.modeLabel} · 歷史分析`;
    $("#analysisStatus").className = "ai-status success";
    $("#analysisStatus").textContent = "歷史分析與線圖已載入。";
  } catch (error) {
    notice.textContent = error.message;
    $("#resultMeta").textContent = `${row.symbol || "未填標的"} · 線圖不可用`;
    $("#analysisStatus").className = "ai-status warning";
    $("#analysisStatus").textContent = error.message;
  }
  $("#resultContent").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderViewerZoom(center = false) {
  const image = $("#imageLightboxImage");
  const viewport = $("#imageLightboxViewport");
  if (!image.naturalWidth || !image.naturalHeight) return;
  const oldWidth = image.offsetWidth || 1;
  const oldHeight = image.offsetHeight || 1;
  const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / oldWidth;
  const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / oldHeight;
  image.style.width = `${Math.round(image.naturalWidth * viewerFitScale * viewerZoom)}px`;
  image.style.height = "auto";
  $("#imageZoomValue").textContent = `${Math.round(viewerZoom * 100)}%`;
  window.requestAnimationFrame(() => {
    if (center) {
      viewport.scrollLeft = Math.max(0, (image.offsetWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = Math.max(0, (image.offsetHeight - viewport.clientHeight) / 2);
    } else {
      viewport.scrollLeft = Math.max(0, centerX * image.offsetWidth - viewport.clientWidth / 2);
      viewport.scrollTop = Math.max(0, centerY * image.offsetHeight - viewport.clientHeight / 2);
    }
  });
}

function fitViewerImage() {
  const image = $("#imageLightboxImage");
  const viewport = $("#imageLightboxViewport");
  if (!image.naturalWidth || !image.naturalHeight) return;
  viewerFitScale = Math.min((viewport.clientWidth - 24) / image.naturalWidth, (viewport.clientHeight - 24) / image.naturalHeight, 1);
  viewerZoom = 1;
  renderViewerZoom(true);
}

function changeViewerZoom(multiplier) {
  viewerZoom = Math.max(.5, Math.min(4, viewerZoom * multiplier));
  renderViewerZoom();
}

function openImageViewer(src, title = "線圖放大檢視") {
  if (!src) return;
  const modal = $("#imageLightbox");
  const image = $("#imageLightboxImage");
  $("#imageLightboxTitle").textContent = title;
  modal.hidden = false;
  document.body.classList.add("ai-lightbox-open");
  image.onload = fitViewerImage;
  image.src = src;
  if (image.complete) fitViewerImage();
  $("#imageLightboxViewport").focus({ preventScroll: true });
}

function closeImageViewer() {
  $("#imageLightbox").hidden = true;
  document.body.classList.remove("ai-lightbox-open");
  viewerDrag = null;
}

function clearAnalysisProgressTimer() {
  if (analysisProgressTimer) window.clearInterval(analysisProgressTimer);
  analysisProgressTimer = null;
}

function setAnalysisProgress(value, stage, message) {
  const progress = Math.max(0, Math.min(100, Math.round(value)));
  $("#analysisProgress").setAttribute("aria-valuenow", String(progress));
  $("#analysisProgressBar").style.width = `${progress}%`;
  $("#progressPercent").textContent = `${progress}%`;
  if (stage) $("#progressStage").textContent = stage;
  if (message) $("#progressMessage").textContent = message;
}

function updateAnalysisProgress() {
  const elapsed = (Date.now() - analysisProgressStartedAt) / 1000;
  const stage = [...PROGRESS_STAGES].reverse().find((item) => elapsed >= item.after) || PROGRESS_STAGES[0];
  const progress = Math.min(92, 6 + 86 * (1 - Math.exp(-elapsed / 18)));
  setAnalysisProgress(progress, stage.label, stage.message);
}

function startAnalysisProgress(meta) {
  clearAnalysisProgressTimer();
  analysisProgressStartedAt = Date.now();
  const panel = $("#resultLoading");
  panel.classList.remove("complete", "error");
  panel.querySelector(".ai-progress-orbit span").textContent = "✦";
  $("#progressTitle").textContent = "AI 正在分析線圖";
  $("#resultEmpty").hidden = true;
  $("#resultContent").hidden = true;
  setResultThumbnail();
  panel.hidden = false;
  $("#resultMeta").textContent = `${meta} · 分析中`;
  setAnalysisProgress(6, PROGRESS_STAGES[0].label, PROGRESS_STAGES[0].message);
  analysisProgressTimer = window.setInterval(updateAnalysisProgress, 500);
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function completeAnalysisProgress() {
  clearAnalysisProgressTimer();
  $("#resultLoading").classList.add("complete");
  $("#resultLoading .ai-progress-orbit span").textContent = "✓";
  $("#progressTitle").textContent = "分析完成";
  setAnalysisProgress(100, "完成", "結果已產生，正在整理版面…");
  await new Promise((resolve) => window.setTimeout(resolve, 280));
  $("#resultLoading").hidden = true;
}

function failAnalysisProgress(message) {
  clearAnalysisProgressTimer();
  const panel = $("#resultLoading");
  panel.classList.add("error");
  panel.querySelector(".ai-progress-orbit span").textContent = "!";
  $("#progressTitle").textContent = "分析未完成";
  const progress = Number($("#analysisProgress").getAttribute("aria-valuenow")) || 0;
  setAnalysisProgress(progress, "處理中斷", message || "分析服務暫時無法完成，請稍後再試。");
  $("#resultMeta").textContent = "本次分析未完成";
}

function setGate(title, description, actionLabel = "", action = null) {
  const gate = $("#aiGate");
  gate.replaceChildren();
  const icon = node("div", "ai-gate-icon", "✦");
  const copy = node("div");
  copy.append(node("h2", "", title), node("p", "", description));
  if (actionLabel && action) {
    const button = node("button", "ai-gate-button", actionLabel);
    button.type = "button";
    button.addEventListener("click", action);
    copy.append(button);
  }
  gate.append(icon, copy);
  gate.hidden = false;
  $("#aiWorkspace").hidden = true;
  $("#analysisHistoryPanel").hidden = true;
  $("#quotaBadge").hidden = true;
}

async function syncAccess() {
  if (!window.ETFAuth?.isConfigured()) {
    setGate("會員服務尚未設定", "目前無法連線至會員系統，請稍後再試。");
    return;
  }
  const user = window.ETFAuth.user();
  const nextUserId = user?.id || null;
  if (nextUserId !== activeUserId) {
    resetSensitiveState();
    activeUserId = nextUserId;
  }
  if (!user) {
    setGate("登入後即可使用", "這是限定會員功能；登入後系統會自動確認使用權限。", "登入 / 註冊", () => window.ETFAuth.openLogin());
    return;
  }
  let access = window.ETFAuth.chartAnalysisAccess();
  if (!access) access = await window.ETFAuth.refreshChartAnalysisAccess();
  if (!access?.enabled) {
    setGate("此帳號尚未開通", "你的會員登入正常，但尚未取得 AI 線圖分析權限。請由管理員在權限表中開通。");
    return;
  }
  $("#aiGate").hidden = true;
  $("#aiWorkspace").hidden = false;
  $("#analysisHistoryPanel").hidden = false;
  $("#quotaBadge").hidden = false;
  $("#quotaBadge strong").textContent = quotaText(access);
  const exhausted = Number(access.remaining) <= 0;
  $("#analyzeChart").disabled = exhausted;
  if (exhausted) $("#analysisStatus").textContent = "今日分析額度已用完，將於台北時間午夜重置。";
  await loadTransferredChart(user);
  await loadHistory();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("圖片讀取失敗"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("圖片格式無法讀取"));
    image.src = dataUrl;
  });
}

function approximateBytes(dataUrl) {
  return Math.floor(((dataUrl.split(",")[1] || "").length * 3) / 4);
}

async function prepareImage(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("只接受 JPG、PNG 或 WebP 圖片");
  if (file.size > 18 * 1024 * 1024) throw new Error("原始圖片請小於 18 MB");
  const original = await fileToDataUrl(file);
  const image = await loadImage(original);
  if (file.size <= 3.2 * 1024 * 1024 && Math.max(image.naturalWidth, image.naturalHeight) <= 2400) return original;
  const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = .9;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (approximateBytes(dataUrl) > 3.2 * 1024 * 1024 && quality > .58) {
    quality -= .08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (approximateBytes(dataUrl) > 3.5 * 1024 * 1024) throw new Error("圖片內容太大，請先裁切不必要的畫面再上傳");
  return dataUrl;
}

async function selectImage(file) {
  const requestUserId = activeUserId;
  const status = $("#analysisStatus");
  status.className = "ai-status";
  status.textContent = "正在整理圖片…";
  try {
    preparedImage = await prepareImage(file);
    if (activeUserId !== requestUserId) return;
    selectedFileName = file.name;
    $("#chartPreview").src = preparedImage;
    $("#chartPreview").hidden = false;
    $("#chartDropzone").classList.add("has-image");
    $("#imageActions").hidden = false;
    $("#imageMeta").textContent = `${file.name} · ${(approximateBytes(preparedImage) / 1024 / 1024).toFixed(2)} MB`;
    status.textContent = "圖片已就緒。";
  } catch (error) {
    if (activeUserId !== requestUserId) return;
    clearImage();
    status.className = "ai-status error";
    status.textContent = error.message;
  }
}

function clearImage() {
  preparedImage = "";
  selectedFileName = "";
  $("#chartImage").value = "";
  $("#chartPreview").removeAttribute("src");
  $("#chartPreview").hidden = true;
  $("#chartDropzone").classList.remove("has-image");
  $("#imageActions").hidden = true;
  $("#imageMeta").textContent = "";
}

function resetSensitiveState() {
  historyGeneration += 1;
  transferGeneration += 1;
  transferAttemptUserId = null;
  clearImage();
  $("#analysisSymbol").value = "";
  $("#proposedPrice").value = "";
  $("#screenshotTiming").value = "";
  $("#resultContent").replaceChildren();
  $("#resultContent").hidden = true;
  $("#resultEmpty").hidden = false;
  clearAnalysisProgressTimer();
  $("#resultLoading").hidden = true;
  $("#resultLoading").classList.remove("complete", "error");
  $("#resultMeta").textContent = "";
  $("#analysisHistory").replaceChildren();
  $("#analysisStatus").textContent = "";
  currentAnalysisResult = null;
  currentAnalysisMeta = null;
  transferredAssetName = "";
  setExportTools(false);
  $("#emailAnalysisModal").hidden = true;
  document.body.classList.remove("ai-email-open");
  setResultThumbnail();
  closeImageViewer();
  setInputPanelCollapsed(false);
}

async function loadTransferredChart(user) {
  if (!window.ChartAnalysisTransfer?.take || !user?.id) return;
  if (transferAttemptUserId === user.id) return;
  transferAttemptUserId = user.id;
  const generation = ++transferGeneration;
  try {
    const transfer = await window.ChartAnalysisTransfer.take(user.id);
    if (!transfer || generation !== transferGeneration || activeUserId !== user.id) return;
    const file = new File([transfer.blob], transfer.name || "technical-chart.jpg", { type: transfer.blob.type || "image/jpeg" });
    await selectImage(file);
    if (generation !== transferGeneration || activeUserId !== user.id) return;
    if (transfer.symbol) $("#analysisSymbol").value = transfer.symbol;
    transferredAssetName = transfer.assetName || "";
    $("#analysisStatus").className = "ai-status success";
    $("#analysisStatus").textContent = "已自動帶入技術分析頁的線圖，請選擇分析模式。";
  } catch (error) {
    if (generation !== transferGeneration || activeUserId !== user.id) return;
    $("#analysisStatus").className = "ai-status error";
    $("#analysisStatus").textContent = error.message || "無法載入剛才擷取的線圖";
  }
}

function addListCard(parent, title, items, className = "") {
  const card = node("section", `ai-result-card ${className}`.trim());
  card.append(node("h3", "", title));
  const list = node("ul");
  (items?.length ? items : ["截圖資訊不足，無法判斷"]).forEach((item) => list.append(node("li", "", item)));
  card.append(list);
  parent.append(card);
}

function renderAnalysis(target, result, compact = false) {
  target.replaceChildren();
  const hero = node("section", "ai-result-hero");
  const heading = node("div");
  heading.append(buildMarketStateLabel(result.marketState), node("h3", "", result.conclusion || "尚無結論"));
  hero.append(heading);
  if (result.thesis) hero.append(node("p", "", result.thesis));
  target.append(hero);
  if (compact) return;

  if (SHOW_IMAGE_QUALITY_NOTE && result.imageQualityNote) {
    const quality = node("div", `ai-quality-note${result.readable ? "" : " warning"}`, result.imageQualityNote);
    target.append(quality);
  }
  const points = node("section", "ai-result-card ai-technical-card");
  const pointHeading = node("div", "ai-card-title-row");
  pointHeading.append(node("h3", "", "技術判讀"), buildToneLegend());
  points.append(pointHeading);
  const pointGrid = node("div", "ai-point-grid");
  (result.technicalPoints || []).forEach((point) => {
    const item = node("article", `ai-point ${point.tone || "neutral"}`);
    item.append(node("b", "", point.label), node("p", "", point.analysis));
    pointGrid.append(item);
  });
  points.append(pointGrid);
  target.append(points);

  const zones = node("div", "ai-zone-grid");
  addListCard(zones, "支撐區", result.supportZones, "support");
  addListCard(zones, "壓力區", result.resistanceZones, "resistance");
  target.append(zones);

  const plan = result.tradePlan || {};
  const planCard = node("section", "ai-result-card ai-plan-card");
  planCard.append(node("h3", "", "交易計畫"));
  const planGrid = node("div", "ai-plan-grid");
  [["進場條件", plan.entry], ["防守／停損", plan.defense], ["第一目標", plan.firstTarget], ["第二目標", plan.secondTarget], ["強壓位置", plan.strongResistance], ["部位建議", plan.positionSizing]].forEach(([label, value]) => {
    const item = node("div"); item.append(node("span", "", label), node("strong", "", value || "—")); planGrid.append(item);
  });
  planCard.append(planGrid);
  target.append(planCard);
  addListCard(target, "風險提醒", result.riskNotes, "risk");
  if (result.invalidation) {
    const invalidation = node("div", "ai-invalidation");
    invalidation.append(node("b", "", "判斷失效條件"), node("span", "", result.invalidation));
    target.append(invalidation);
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function listHtml(items) {
  return `<ul>${(items?.length ? items : ["資訊不足，無法判斷"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function buildPdfExportFrame() {
  if (!currentAnalysisResult || !currentAnalysisMeta) throw new Error("目前沒有可匯出的分析結果");
  const result = currentAnalysisResult, plan = result.tradePlan || {};
  const technical = (result.technicalPoints || []).map((point) => {
    const tone = ["bullish", "bearish", "neutral", "warning"].includes(point.tone) ? point.tone : "neutral";
    return `<article class="${tone}"><b>${escapeHtml(point.label)}</b><p>${escapeHtml(point.analysis)}</p></article>`;
  }).join("");
  const toneLegend = TECHNICAL_TONE_LEGEND.map(([tone, label]) => `<span class="${tone}"><i></i>${label}</span>`).join("");
  const planRows = [["進場條件", plan.entry], ["防守／停損", plan.defense], ["第一目標", plan.firstTarget], ["第二目標", plan.secondTarget], ["強壓位置", plan.strongResistance], ["部位建議", plan.positionSizing]]
    .map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value || "—")}</strong></div>`).join("");
  const iframe = document.createElement("iframe");
  iframe.title = "PDF 匯出版面";
  iframe.style.cssText = "position:absolute;left:-12000px;top:0;width:1060px;height:100px;border:0;background:#fff";
  iframe.srcdoc = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;background:#fff;color:#1c2430;font-family:-apple-system,'PingFang TC','Microsoft JhengHei',sans-serif}body{width:1060px;padding:38px;font-size:15px;line-height:1.6}
    header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:18px;border-bottom:3px solid #3b5bdb}header em{display:block;color:#3b5bdb;font-size:12px;font-style:normal;font-weight:800;letter-spacing:.12em}h1{margin:5px 0 0;font-size:29px}header small{color:#6b7684;font-size:13px}.chart{display:block;width:100%;max-height:640px;margin:22px 0;border-radius:14px;background:#111827;object-fit:contain}
    .hero{padding:20px;border:1px solid #c7d2fe;border-radius:14px;background:#eef2ff}.hero label{color:#3b5bdb;font-size:12px;font-weight:800}.hero h2{margin:5px 0 0;font-size:24px}.hero p{margin:3px 0 0;color:#596579}.quality{margin:12px 0;padding:11px 13px;border-radius:9px;background:#f1f5f9;color:#596579}.card{margin-top:14px;padding:17px;border:1px solid #e3e7ec;border-radius:13px;background:#f8fafc}.card h3{margin:0;font-size:17px}.title-row{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:12px}.tone-legend{display:flex;align-items:center;gap:14px;font-size:12px;color:#596579}.tone-legend span{display:flex;align-items:center;gap:5px}.tone-legend i{width:20px;height:3px;border-radius:2px;background:#7b8491}.tone-legend .bullish i{background:#d64545}.tone-legend .bearish i{background:#16884c}.tone-legend .warning i{background:#d69e2e}.points,.zones,.plan{display:grid;grid-template-columns:1fr 1fr;gap:11px}.points article,.plan div{padding:12px;border-radius:9px;background:#fff}.points article{border-left:4px solid #7b8491}.points article.bullish{border-color:#d64545}.points article.bearish{border-color:#16884c}.points article.warning{border-color:#d69e2e}.points p{margin:4px 0 0;color:#596579}.zones section{margin-top:14px;border-top:4px solid #1f9d55}.zones section:last-child{border-color:#d64545}.plan span,.plan strong{display:block}.plan span{color:#6b7684;font-size:12px}.plan strong{margin-top:4px}ul{margin:0;padding-left:22px;color:#596579}.invalid{margin-top:14px;padding:13px;border-radius:10px;background:#fff0f0}.invalid b{color:#d64545;margin-right:12px}footer{margin-top:20px;padding-top:14px;border-top:1px solid #e3e7ec;color:#6b7684;font-size:12px}
  </style></head><body><header><div><em>AI TECHNICAL ANALYSIS</em><h1>${escapeHtml(currentAnalysisMeta.symbol)} ${escapeHtml(currentAnalysisMeta.assetName)}</h1></div><small>${escapeHtml(currentAnalysisMeta.date)} · ${escapeHtml(currentAnalysisMeta.timing)} · ${escapeHtml(currentAnalysisMeta.modeLabel)}</small></header>
  ${resultImageData ? `<img class="chart" src="${resultImageData}" alt="技術線圖">` : ""}<section class="hero"><div><label>${escapeHtml(result.marketState || "資訊不足")}</label><h2>${escapeHtml(result.conclusion || "尚無結論")}</h2></div><p>${escapeHtml(result.thesis || "")}</p></section>
  ${SHOW_IMAGE_QUALITY_NOTE && result.imageQualityNote ? `<div class="quality">${escapeHtml(result.imageQualityNote)}</div>` : ""}<section class="card"><div class="title-row"><h3>技術判讀</h3><div class="tone-legend">${toneLegend}</div></div><div class="points">${technical}</div></section>
  <div class="zones"><section class="card"><h3>支撐區</h3>${listHtml(result.supportZones)}</section><section class="card"><h3>壓力區</h3>${listHtml(result.resistanceZones)}</section></div>
  <section class="card"><h3>交易計畫</h3><div class="plan">${planRows}</div></section><section class="card"><h3>風險提醒</h3>${listHtml(result.riskNotes)}</section>
  ${result.invalidation ? `<div class="invalid"><b>判斷失效條件</b>${escapeHtml(result.invalidation)}</div>` : ""}<footer>產生時間：${escapeHtml(new Date().toLocaleString("zh-TW"))}。AI 分析僅供技術研究與交易計畫整理，不構成投資建議或獲利保證。</footer></body></html>`;
  return new Promise((resolve) => {
    iframe.onload = () => {
      const body = iframe.contentDocument.body;
      iframe.style.height = `${Math.ceil(body.scrollHeight)}px`;
      resolve({ node: body, frame: iframe });
    };
    document.body.append(iframe);
  });
}

async function waitForImages(element) {
  await Promise.all([...element.querySelectorAll("img")].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
    image.onload = resolve; image.onerror = resolve;
  })));
}

async function createAnalysisPdf({ download = false } = {}) {
  if (exportBusy) throw new Error("PDF 正在產生中，請稍候");
  if (typeof window.html2canvas !== "function" || !window.jspdf?.jsPDF) throw new Error("PDF 元件尚未載入，請重新整理後再試");
  exportBusy = true;
  const buttons = [$("#exportAnalysisPdf"), $("#emailAnalysisPdf")];
  buttons.forEach((button) => { button.disabled = true; });
  let exportNode;
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const exportFrame = await buildPdfExportFrame();
    exportNode = exportFrame.frame;
    await waitForImages(exportFrame.node);
    const canvas = await window.html2canvas(exportFrame.node, { backgroundColor: "#ffffff", scale: 1.25, logging: false, useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth(), pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24, drawWidth = pageWidth - margin * 2, drawHeight = pageHeight - margin * 2;
    const pixelsPerPage = Math.max(1, Math.floor(canvas.width * drawHeight / drawWidth));
    let offset = 0, page = 0;
    while (offset < canvas.height) {
      const sliceHeight = Math.min(pixelsPerPage, canvas.height - offset);
      const slice = document.createElement("canvas");
      slice.width = canvas.width; slice.height = sliceHeight;
      slice.getContext("2d", { alpha: false }).drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", .78), "JPEG", margin, margin, drawWidth, drawWidth * sliceHeight / canvas.width, undefined, "FAST");
      offset += sliceHeight; page += 1;
    }
    const blob = pdf.output("blob");
    if (download) {
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilePart(currentAnalysisMeta.symbol)}_${currentAnalysisMeta.date}_${currentAnalysisMeta.timing}_技術分析.pdf`;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    return blob;
  } finally {
    exportNode?.remove();
    exportBusy = false;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("PDF 附件讀取失敗"));
    reader.readAsDataURL(blob);
  });
}

function openEmailModal() {
  if (!currentAnalysisMeta?.symbol) {
    $("#analysisStatus").className = "ai-status error";
    $("#analysisStatus").textContent = "寄送 Email 前請先填入標的代號。";
    return;
  }
  $("#analysisEmailSubject").textContent = resultSubject();
  $("#analysisEmailStatus").textContent = "";
  $("#emailAnalysisModal").hidden = false;
  document.body.classList.add("ai-email-open");
  $("#analysisEmailAddress").focus({ preventScroll: true });
}

function closeEmailModal() {
  if ($("#emailAnalysisSend").disabled) return;
  $("#emailAnalysisModal").hidden = true;
  document.body.classList.remove("ai-email-open");
}

async function sendAnalysisEmail() {
  const emailInput = $("#analysisEmailAddress"), status = $("#analysisEmailStatus"), sendButton = $("#emailAnalysisSend");
  const email = emailInput.value.trim();
  status.className = "ai-email-status";
  if (!emailInput.checkValidity() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    status.className = "ai-email-status error";
    status.textContent = "請輸入有效的 Email address。";
    emailInput.focus();
    return;
  }
  const client = window.ETFAuth?.client();
  const { data: { session } } = await client.auth.getSession();
  if (!session || !window.ETFAuth?.canUseChartAnalysis()) {
    closeEmailModal();
    return syncAccess();
  }
  sendButton.disabled = true;
  $("#emailAnalysisCancel").disabled = true;
  status.textContent = "正在產生 PDF 附件…";
  try {
    const pdf = await createAnalysisPdf();
    if (pdf.size > 3_500_000) throw new Error("PDF 超過寄送大小限制，請改用匯出 PDF 下載");
    status.textContent = "正在透過 Gmail 寄送…";
    const response = await fetch("/api/chart-analysis-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email, symbol: currentAnalysisMeta.symbol, assetName: currentAnalysisMeta.assetName,
        date: currentAnalysisMeta.date, timing: currentAnalysisMeta.timing, pdfBase64: await blobToBase64(pdf) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "Email 暫時無法寄出");
    status.className = "ai-email-status success";
    status.textContent = `已寄送至 ${email}`;
    window.setTimeout(() => { sendButton.disabled = false; $("#emailAnalysisCancel").disabled = false; closeEmailModal(); }, 1100);
  } catch (error) {
    status.className = "ai-email-status error";
    status.textContent = error.message;
    sendButton.disabled = false;
    $("#emailAnalysisCancel").disabled = false;
  }
}

async function analyze() {
  if (busy) return;
  if (!preparedImage) {
    $("#analysisStatus").className = "ai-status error";
    $("#analysisStatus").textContent = "請先選擇一張線圖。";
    return;
  }
  const sb = window.ETFAuth?.client();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return syncAccess();
  const requestUserId = session.user.id;
  const mode = document.querySelector('input[name="analysisMode"]:checked')?.value || "general";
  const payload = {
    imageData: preparedImage,
    mode,
    symbol: $("#analysisSymbol").value.trim(),
    screenshotTiming: $("#screenshotTiming").value,
    proposedPrice: $("#proposedPrice").value || null,
  };
  busy = true;
  $("#analyzeChart").disabled = true;
  $("#analyzeChart").classList.add("loading");
  $("#analysisStatus").className = "ai-status";
  $("#analysisStatus").textContent = "正在讀取 K 線、均線與技術指標，通常需要 20–60 秒…";
  const resultLabel = `${payload.symbol || selectedFileName || "線圖"} · ${MODE_LABELS[mode]}`;
  startAnalysisProgress(resultLabel);
  try {
    const response = await fetch("/api/chart-analysis", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "分析服務暫時無法完成");
    if (window.ETFAuth.user()?.id !== requestUserId) return;
    await completeAnalysisProgress();
    $("#resultEmpty").hidden = true;
    $("#resultContent").hidden = false;
    $("#resultMeta").textContent = resultLabel;
    renderAnalysis($("#resultContent"), data.analysis);
    setResultThumbnail(payload.imageData);
    const symbol = payload.symbol.trim().toUpperCase();
    const assetName = transferredAssetName || assetNames.get(symbol) || symbol || "未填名稱";
    currentAnalysisResult = data.analysis;
    currentAnalysisMeta = {
      symbol,
      assetName,
      date: localIsoDate(),
      timing: timingCategory(payload.screenshotTiming),
      modeLabel: MODE_LABELS[mode] || mode,
    };
    setExportTools(true);
    $("#analysisStatus").className = "ai-status success";
    $("#analysisStatus").textContent = "分析完成，正在保存線圖（保存 5 天）…";
    try {
      await saveAnalysisImage(sb, requestUserId, data.requestId, payload.imageData, assetName);
      $("#analysisStatus").textContent = "分析完成；線圖已保存 5 天，可由歷史紀錄重新匯出或寄送。";
    } catch (storageError) {
      $("#analysisStatus").className = "ai-status warning";
      $("#analysisStatus").textContent = `分析完成，但${storageError.message}；本頁仍可匯出，歷史紀錄將只保留文字。`;
    }
    $("#quotaBadge strong").textContent = `${data.quota.remaining} / ${data.quota.dailyLimit}`;
    await window.ETFAuth.refreshChartAnalysisAccess();
    await loadHistory();
    $("#resultContent").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (window.ETFAuth.user()?.id === requestUserId) failAnalysisProgress(error.message);
    $("#analysisStatus").className = "ai-status error";
    $("#analysisStatus").textContent = error.message;
  } finally {
    busy = false;
    $("#analyzeChart").classList.remove("loading");
    const access = window.ETFAuth.chartAnalysisAccess();
    $("#analyzeChart").disabled = Number(access?.remaining) <= 0;
  }
}

async function loadHistory() {
  const sb = window.ETFAuth?.client();
  if (!sb || !window.ETFAuth.user()) return;
  const requestUserId = window.ETFAuth.user().id;
  const generation = ++historyGeneration;
  cleanupExpiredHistoryImages(sb).catch(() => {});
  const { data, error } = await sb.from("chart_analysis_requests")
    .select("id,created_at,mode,symbol,screenshot_timing,status,result,asset_name,chart_path,chart_expires_at")
    .order("created_at", { ascending: false }).limit(6);
  if (error || generation !== historyGeneration || window.ETFAuth.user()?.id !== requestUserId) return;
  const target = $("#analysisHistory");
  target.replaceChildren();
  if (!data?.length) {
    target.append(node("p", "ai-history-empty", "還沒有分析紀錄。完成第一張線圖後，摘要會出現在這裡。"));
    return;
  }
  data.forEach((row) => {
    const card = node("article", "ai-history-card");
    const head = node("button", "ai-history-toggle");
    head.type = "button";
    const copy = node("span");
    copy.append(node("b", "", row.symbol || "未填標的"), node("small", "", `${MODE_LABELS[row.mode] || row.mode} · ${formatDate(row.created_at)}`));
    head.append(copy, node("i", "", row.status === "completed" ? "查看" : "未完成"));
    const detail = node("div", "ai-history-detail");
    detail.hidden = true;
    const notice = node("p", "ai-history-retention");
    notice.hidden = true;
    if (row.result) {
      renderAnalysis(detail, row.result);
      detail.prepend(notice);
      const state = historyImageState(row);
      if (state === "expired") {
        notice.hidden = false;
        notice.textContent = "線圖已超過 5 天保存期限；仍可查看文字分析，但無法匯出或寄送。";
      } else if (state === "legacy") {
        notice.hidden = false;
        notice.textContent = "此舊紀錄未保存線圖；仍可查看文字分析，但無法匯出或寄送。";
      }
    } else detail.append(node("p", "ai-history-empty", "這次分析未完成。"));
    head.addEventListener("click", async () => {
      detail.hidden = !detail.hidden;
      head.classList.toggle("open", !detail.hidden);
      if (!detail.hidden && row.result) await activateHistoryResult(sb, row, notice);
    });
    card.append(head, detail);
    target.append(card);
  });
}

function bind() {
  loadAssetNames();
  $("#chartImage").addEventListener("change", (event) => selectImage(event.target.files?.[0]));
  $("#removeImage").addEventListener("click", clearImage);
  const preview = $("#chartPreview");
  const openPreview = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openImageViewer(preparedImage, selectedFileName || "待分析線圖");
  };
  preview.addEventListener("click", openPreview);
  preview.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") openPreview(event);
  });
  $("#resultChartThumb").addEventListener("click", () => openImageViewer(resultImageData, "本次分析線圖"));
  $("#exportAnalysisPdf").addEventListener("click", async () => {
    const status = $("#analysisStatus");
    status.className = "ai-status";
    status.textContent = "正在產生 PDF…";
    try {
      await createAnalysisPdf({ download: true });
      status.className = "ai-status success";
      status.textContent = "PDF 已匯出。";
    } catch (error) {
      status.className = "ai-status error";
      status.textContent = error.message;
    }
  });
  $("#emailAnalysisPdf").addEventListener("click", openEmailModal);
  $("#emailAnalysisClose").addEventListener("click", closeEmailModal);
  $("#emailAnalysisCancel").addEventListener("click", closeEmailModal);
  $("#emailAnalysisSend").addEventListener("click", sendAnalysisEmail);
  $("#analysisEmailAddress").addEventListener("keydown", (event) => { if (event.key === "Enter") sendAnalysisEmail(); });
  $("#emailAnalysisModal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeEmailModal(); });
  $("#toggleInputPanel").addEventListener("click", () => setInputPanelCollapsed(!$("#aiWorkspace").classList.contains("input-collapsed")));
  $("#imageLightboxClose").addEventListener("click", closeImageViewer);
  $("#imageZoomIn").addEventListener("click", () => changeViewerZoom(1.25));
  $("#imageZoomOut").addEventListener("click", () => changeViewerZoom(.8));
  $("#imageZoomReset").addEventListener("click", fitViewerImage);
  $("#imageLightbox").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeImageViewer();
  });
  const viewer = $("#imageLightboxViewport");
  viewer.addEventListener("wheel", (event) => {
    event.preventDefault();
    changeViewerZoom(event.deltaY < 0 ? 1.12 : .89);
  }, { passive: false });
  viewer.addEventListener("pointerdown", (event) => {
    viewerDrag = { x: event.clientX, y: event.clientY, left: viewer.scrollLeft, top: viewer.scrollTop };
    viewer.classList.add("dragging");
    viewer.setPointerCapture(event.pointerId);
  });
  viewer.addEventListener("pointermove", (event) => {
    if (!viewerDrag) return;
    viewer.scrollLeft = viewerDrag.left - (event.clientX - viewerDrag.x);
    viewer.scrollTop = viewerDrag.top - (event.clientY - viewerDrag.y);
  });
  const stopViewerDrag = () => { viewerDrag = null; viewer.classList.remove("dragging"); };
  viewer.addEventListener("pointerup", stopViewerDrag);
  viewer.addEventListener("pointercancel", stopViewerDrag);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#imageLightbox").hidden) closeImageViewer();
    else if (event.key === "Escape" && !$("#emailAnalysisModal").hidden) closeEmailModal();
  });
  window.addEventListener("resize", () => {
    if (!$("#imageLightbox").hidden) fitViewerImage();
  });
  const dropzone = $("#chartDropzone");
  ["dragenter", "dragover"].forEach((type) => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((type) => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.remove("dragging"); }));
  dropzone.addEventListener("drop", (event) => selectImage(event.dataTransfer.files?.[0]));
  document.querySelectorAll('input[name="analysisMode"]').forEach((input) => input.addEventListener("change", () => {
    $("#priceField").hidden = input.checked && input.value === "general";
  }));
  $("#analyzeChart").addEventListener("click", analyze);
  document.addEventListener("etfauth:change", syncAccess);
  syncAccess();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
else bind();
