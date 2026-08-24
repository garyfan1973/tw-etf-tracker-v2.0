const $ = (selector) => document.querySelector(selector);
const MODE_LABELS = { general: "一般分析", fast: "快閃交易", overnight: "隔日沖", "low-entry": "低接掛價" };
let preparedImage = "";
let selectedFileName = "";
let busy = false;
let activeUserId = null;
let historyGeneration = 0;
let transferGeneration = 0;
let transferAttemptUserId = null;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function quotaText(access) {
  return access ? `${access.remaining ?? 0} / ${access.dailyLimit ?? 0}` : "—";
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
  $("#resultMeta").textContent = "";
  $("#analysisHistory").replaceChildren();
  $("#analysisStatus").textContent = "";
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
  heading.append(node("span", "ai-market-state", result.marketState || "資訊不足"), node("h3", "", result.conclusion || "尚無結論"));
  hero.append(heading, node("strong", "ai-rating", result.rating || "—"));
  if (result.thesis) hero.append(node("p", "", result.thesis));
  target.append(hero);
  if (compact) return;

  if (result.imageQualityNote) {
    const quality = node("div", `ai-quality-note${result.readable ? "" : " warning"}`, result.imageQualityNote);
    target.append(quality);
  }
  const points = node("section", "ai-result-card ai-technical-card");
  points.append(node("h3", "", "技術判讀"));
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
  try {
    const response = await fetch("/api/chart-analysis", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "分析服務暫時無法完成");
    if (window.ETFAuth.user()?.id !== requestUserId) return;
    $("#resultEmpty").hidden = true;
    $("#resultContent").hidden = false;
    $("#resultMeta").textContent = `${payload.symbol || selectedFileName || "線圖"} · ${MODE_LABELS[mode]}`;
    renderAnalysis($("#resultContent"), data.analysis);
    $("#analysisStatus").className = "ai-status success";
    $("#analysisStatus").textContent = "分析完成。";
    $("#quotaBadge strong").textContent = `${data.quota.remaining} / ${data.quota.dailyLimit}`;
    await window.ETFAuth.refreshChartAnalysisAccess();
    await loadHistory();
    $("#resultContent").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
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
  const { data, error } = await sb.from("chart_analysis_requests").select("id,created_at,mode,symbol,status,result").order("created_at", { ascending: false }).limit(6);
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
    if (row.result) renderAnalysis(detail, row.result);
    else detail.append(node("p", "ai-history-empty", "這次分析未完成。"));
    head.addEventListener("click", () => { detail.hidden = !detail.hidden; head.classList.toggle("open", !detail.hidden); });
    card.append(head, detail);
    target.append(card);
  });
}

function bind() {
  $("#chartImage").addEventListener("change", (event) => selectImage(event.target.files?.[0]));
  $("#removeImage").addEventListener("click", clearImage);
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
