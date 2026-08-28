const MAX_SYMBOLS = 20;
const state = { assets: [], draft: [], selected: null, loadedUserId: null, busy: false };
const $ = selector => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
}

function typeLabel(asset) {
  return asset.assetType === "etf" ? (asset.market === "TW" ? "台灣 ETF" : "美國 ETF") : (asset.market === "TW" ? "台股" : "美股");
}

function matches(term) {
  const query = term.trim().toLowerCase();
  if (!query) return [];
  return state.assets.map(asset => {
    const symbol = asset.symbol.toLowerCase(), name = asset.assetName.toLowerCase();
    const score = symbol === query ? 0 : symbol.startsWith(query) ? 1 : name.startsWith(query) ? 2 : `${symbol} ${name}`.includes(query) ? 3 : 99;
    return { asset, score };
  }).filter(item => item.score < 99).sort((a,b) => a.score - b.score || a.asset.symbol.localeCompare(b.asset.symbol)).slice(0, 30).map(item => item.asset);
}

function renderResults() {
  const results = matches($("#morningAssetSearch").value), box = $("#morningAssetResults");
  state.selected = null; $("#addMorningAsset").disabled = true;
  box.innerHTML = results.length ? results.map((asset, index) => `<button type="button" class="asset-result" role="option" data-index="${index}"><strong>${escapeHtml(asset.symbol)}</strong><span>${escapeHtml(asset.assetName)}</span><small>${escapeHtml(typeLabel(asset))}</small></button>`).join("") : '<div class="empty-list">找不到符合條件的標的。</div>';
  box.classList.add("open");
  box.querySelectorAll(".asset-result").forEach(button => button.addEventListener("click", () => {
    state.selected = results[Number(button.dataset.index)];
    $("#morningAssetSearch").value = `${state.selected.symbol} ${state.selected.assetName}`;
    $("#addMorningAsset").disabled = false;
    box.classList.remove("open");
  }));
}

function renderList() {
  $("#morningCount").textContent = `${state.draft.length} / ${MAX_SYMBOLS}`;
  const list = $("#morningSymbolList");
  list.innerHTML = state.draft.length ? state.draft.map((asset, index) => `<div class="symbol-row"><span class="market-tag">${escapeHtml(asset.market)}</span><strong>${escapeHtml(asset.symbol)}</strong><span class="name">${escapeHtml(asset.assetName)}</span><button type="button" class="trash" data-index="${index}" aria-label="刪除 ${escapeHtml(asset.symbol)}" title="刪除">🗑</button></div>`).join("") : '<div class="empty-list">尚未加入晨報標的，請由上方搜尋並新增。</div>';
  list.querySelectorAll(".trash").forEach(button => button.addEventListener("click", () => {
    state.draft.splice(Number(button.dataset.index), 1); renderList(); setStatus("尚未儲存變更。");
  }));
}

function setStatus(message, type = "") {
  const box = $("#morningStatus"); box.className = `status ${type}`.trim(); box.textContent = message;
}

function addSelected() {
  const asset = state.selected;
  if (!asset) return;
  if (state.draft.some(item => item.market === asset.market && item.symbol === asset.symbol)) return setStatus("此標的已在晨報清單中。", "error");
  if (state.draft.length >= MAX_SYMBOLS) return setStatus("晨報最多設定 20 檔標的。", "error");
  state.draft.push({ ...asset }); state.selected = null; $("#morningAssetSearch").value = ""; $("#addMorningAsset").disabled = true;
  renderList(); setStatus("已加入候選清單，按「完成設定」後才會生效。");
}

async function loadAssets() {
  const response = await fetch("trade_assets.json", { cache:"force-cache" });
  if (!response.ok) throw new Error("標的清單暫時無法載入");
  const payload = await response.json();
  state.assets = (payload.assets || []).map(asset => ({ market:String(asset.market || "").toUpperCase(), assetType:String(asset.asset_type || "").toLowerCase(), symbol:String(asset.symbol || "").toUpperCase(), assetName:String(asset.name || asset.symbol || "") }))
    .filter(asset => ["TW","US"].includes(asset.market) && ["stock","etf"].includes(asset.assetType) && asset.symbol && asset.assetName);
}

async function loadSettings(user) {
  if (!user || state.loadedUserId === user.id) return;
  const client = window.ETFAuth.client();
  const { data, error } = await client.rpc("get_morning_report_settings");
  if (error) throw error;
  state.loadedUserId = user.id; state.draft = Array.isArray(data?.symbols) ? data.symbols : [];
  $("#morningEnabled").checked = !!data?.enabled; renderList();
}

async function saveSettings() {
  if (state.busy) return;
  const enabled = $("#morningEnabled").checked;
  if (enabled && !state.draft.length) return setStatus("啟用晨報前請至少加入一檔標的。", "error");
  state.busy = true; $("#saveMorningSettings").disabled = true; setStatus("正在儲存設定…");
  try {
    const client = window.ETFAuth.client();
    const { data, error } = await client.rpc("save_morning_report_settings", { p_symbols:state.draft, p_enabled:enabled });
    if (error) throw error;
    setStatus(data.enabled ? `設定完成，已啟用 ${data.count} 檔標的的盤後晨報。` : "設定完成，晨報目前已暫停。", "success");
  } catch (error) {
    const message = String(error?.message || "設定儲存失敗");
    setStatus(message.includes("FEATURE_NOT_ENABLED") ? "目前帳號沒有 AI 線圖分析權限。" : message.includes("LIMIT") ? "晨報最多設定 20 檔標的。" : "設定儲存失敗，請稍後再試。", "error");
  } finally { state.busy = false; $("#saveMorningSettings").disabled = false; }
}

async function syncAccess() {
  const auth = window.ETFAuth, user = auth?.user?.(), allowed = auth?.canUseChartAnalysis?.();
  const access = $("#accessState"), content = $("#settingsContent");
  if (!user) { state.loadedUserId = null; content.hidden = true; access.hidden = false; access.innerHTML = '請先登入會員後設定晨報。<br><button id="morningLogin" class="primary-btn" type="button" style="margin-top:14px">登入會員</button>'; $("#morningLogin").onclick = () => auth?.openLogin?.(); return; }
  if (!allowed) { content.hidden = true; access.hidden = false; access.textContent = "此功能限具 AI 線圖分析權限的會員使用。"; return; }
  access.hidden = true; content.hidden = false;
  try { await loadSettings(user); } catch (error) { setStatus("晨報設定暫時無法載入，請稍後重試。", "error"); }
}

async function boot() {
  $("#morningAssetSearch").addEventListener("input", renderResults);
  $("#morningAssetSearch").addEventListener("keydown", event => { if (event.key === "Escape") $("#morningAssetResults").classList.remove("open"); if (event.key === "Enter") { event.preventDefault(); const first = matches(event.currentTarget.value)[0]; if (first) { state.selected = first; addSelected(); } } });
  document.addEventListener("pointerdown", event => { if (!event.target.closest?.(".asset-picker")) $("#morningAssetResults").classList.remove("open"); });
  $("#addMorningAsset").addEventListener("click", addSelected); $("#saveMorningSettings").addEventListener("click", saveSettings);
  try { await loadAssets(); } catch (error) { setStatus(error.message, "error"); }
  document.addEventListener("etfauth:change", syncAccess); window.setTimeout(syncAccess, 0);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
