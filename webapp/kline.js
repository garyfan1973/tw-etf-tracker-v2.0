(function () {
  const $ = id => document.getElementById(id);
  const W = 1120, H = 900, left = 62, right = 18, top = 18, priceBottom = 300, volumeTop = 325, volumeBottom = 405, kdTop = 440, kdBottom = 590;
  const data = window.DATA || { etfs: {} };
  const universalPicker = Boolean($("assetSearch"));
  let catalogAssets = [], directAsset = null;
  let currentRows = [], candlePoints = [], chartType = localStorage.getItem("etf-chart-type") === "line" ? "line" : "candle";
  let renderRequestKey = "", viewport = { key:"", start:0, end:0 }, dragState = null, pinchState = null;
  let personalTrades = { key:"", markers:[], openShares:0, averageCost:null, currency:"" };
  let financialRequestKey = "";
  let financialChartMode = ["both", "bar", "line"].includes(localStorage.getItem("financial-chart-mode")) ? localStorage.getItem("financial-chart-mode") : "both";
  let financialPeriod = localStorage.getItem("financial-period") === "quarterly" ? "quarterly" : "annual";
  const maPeriods = [5, 10, 20, 60, 120, 240];
  const volumeMaPeriods = [5, 10];
  const defaultRangeDays = Number(localStorage.getItem("etf-chart-range")) || 60;
  const indicatorNames = ["bollinger", "kd", "macd", "rsi"];
  let visibleIndicators;
  try {
    const savedKey = localStorage.getItem("etf-visible-indicators-v2"), saved = JSON.parse(savedKey || localStorage.getItem("etf-visible-indicators"));
    visibleIndicators = new Set(Array.isArray(saved) ? saved.filter(name => indicatorNames.includes(name)) : ["kd"]);
    if (!savedKey && !visibleIndicators.has("kd")) visibleIndicators.add("kd");
  } catch (_) { visibleIndicators = new Set(["kd"]); }
  const tradeOverlayNames = ["buy", "sell", "cost"];
  let visibleTradeOverlays;
  try {
    const saved = JSON.parse(localStorage.getItem("etf-visible-trade-overlays"));
    visibleTradeOverlays = new Set(Array.isArray(saved) ? saved.filter(name => tradeOverlayNames.includes(name)) : tradeOverlayNames);
  } catch (_) { visibleTradeOverlays = new Set(tradeOverlayNames); }
  let visibleMas;
  try {
    const saved = JSON.parse(localStorage.getItem("etf-visible-mas"));
    visibleMas = new Set(Array.isArray(saved) ? saved.filter(period => maPeriods.includes(Number(period))).map(Number) : maPeriods);
  } catch (_) { visibleMas = new Set(maPeriods); }
  let visibleVolumeMas;
  try {
    const saved = JSON.parse(localStorage.getItem("etf-visible-volume-mas"));
    visibleVolumeMas = new Set(Array.isArray(saved) ? saved.filter(period => volumeMaPeriods.includes(Number(period))).map(Number) : volumeMaPeriods);
  } catch (_) { visibleVolumeMas = new Set(volumeMaPeriods); }

  const num = n => n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const price = n => n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateLabel = d => String(d || "").slice(5).replace("-", "/");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  let tooltipEnabled = true;
  function setTooltipEnabled(enabled) {
    tooltipEnabled = enabled;
    const tip = $("tip"), line = $("hoverLine"), horizontalLine = $("hoverHorizontalLine"), button = $("tooltipToggle");
    if (!enabled) {
      if (tip) tip.style.visibility = "hidden";
      if (line) line.setAttribute("visibility", "hidden");
      if (horizontalLine) horizontalLine.setAttribute("visibility", "hidden");
    }
    if (button) {
      button.setAttribute("aria-pressed", String(enabled));
      button.textContent = enabled ? "提示開" : "提示關";
    }
  }

  function etfCodes() { return Object.keys(data.etfs).sort(); }
  function holdingsFor(code) {
    const etf = data.etfs[code];
    const map = new Map();
    (etf?.snapshots || []).forEach(s => (s.holdings || []).forEach(h => {
      if (h.code && !map.has(h.code)) map.set(h.code, h.name || h.code);
    }));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"));
  }
  function securityInfo(code, security) {
    if (directAsset) return directAsset;
    if (security === "__ETF__") return { symbol:code, name:data.etfs[code]?.name || code, market:"TW", assetType:"etf" };
    const rows = (data.etfs[code]?.snapshots || []).flatMap(snapshot => snapshot.holdings || []);
    const holding = [...rows].reverse().find(row => row.code === security) || {};
    return { symbol:security, name:holding.name || security, market:(holding.market || "TW").toUpperCase(), assetType:holding.assetType || "stock" };
  }
  function fillEtfs() {
    const select = $("etfSelect"); select.innerHTML = etfCodes().map(code => `<option value="${esc(code)}">${esc(code)} ${esc(data.etfs[code].name)}</option>`).join("");
    select.value = select.querySelector('option[value="0050"]') ? "0050" : select.options[0]?.value || "";
  }
  function fillSecurities() {
    const code = $("etfSelect").value, etf = data.etfs[code], select = $("securitySelect");
    const options = [`<option value="__ETF__">${esc(code)}（ETF 本身）</option>`].concat(holdingsFor(code).map(([c, n]) => `<option value="${esc(c)}">${esc(c)} ${esc(n)}</option>`));
    select.innerHTML = options.join("");
    render();
  }
  function rowsFor(code, security) {
    if (directAsset?.market === "TW") {
      if (directAsset.assetType === "etf" && data.etfs[directAsset.symbol]) {
        return (data.etfs[directAsset.symbol].snapshots || []).map(s => {
          const q = s.self;
          return q && [q.open, q.high, q.low, q.close].every(v => v != null) ? { date:s.date, ...q } : null;
        }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
      }
      if (directAsset.assetType === "stock") {
        const rows = new Map();
        Object.values(data.etfs).forEach(etf => (etf.snapshots || []).forEach(s => {
          const q = (s.holdings || []).find(h => h.code === directAsset.symbol);
          if (q && [q.open, q.high, q.low, q.close].every(v => v != null)) rows.set(s.date, { date:s.date, ...q });
        }));
        return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
      }
    }
    const etf = data.etfs[code];
    return (etf?.snapshots || []).map(s => {
      const q = security === "__ETF__" ? s.self : (s.holdings || []).find(h => h.code === security);
      return q && [q.open, q.high, q.low, q.close].every(v => v != null) ? { date:s.date, ...q } : null;
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  }
  function historyPath(info) {
    return `price-history/${encodeURIComponent(info.market)}/${encodeURIComponent(info.symbol)}.json`;
  }
  async function loadHistory(info, snapshotRows) {
    let cachedRows = [];
    try {
      const response = await fetch(historyPath(info), { cache:"default" });
      if (response.ok) {
        const payload = await response.json();
        cachedRows = mergePriceRows(payload.rows, snapshotRows);
      }
    } catch (_) {}
    if (!universalPicker) return cachedRows.length ? cachedRows : snapshotRows;
    try {
      const response = await fetch(`/api/market?market=${encodeURIComponent(info.market)}&code=${encodeURIComponent(info.symbol)}`, { cache:"no-store" });
      const payload = await response.json().catch(() => ({ ok:false }));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "行情資料暫時無法取得");
      return mergePriceRows(cachedRows, payload.rows);
    } catch (error) {
      if (cachedRows.length) return cachedRows;
      throw error;
    }
  }
  function mergePriceRows(historyRows, snapshotRows) {
    const merged = new Map();
    (historyRows || []).forEach(row => { if (row?.date) merged.set(row.date, row); });
    (snapshotRows || []).forEach(row => { if (row?.date) merged.set(row.date, { ...merged.get(row.date), ...row }); });
    return [...merged.values()].filter(row => [row.open, row.high, row.low, row.close].every(value => value != null)).sort((a, b) => a.date.localeCompare(b.date));
  }
  function resetViewport(key, days = defaultRangeDays) {
    const end = currentRows.length;
    viewport = { key, start:Math.max(0, end - Math.max(1, days)), end };
    updateRangeControls();
  }
  function setViewport(start, end, persist = false) {
    const total = currentRows.length, span = Math.max(1, Math.min(total, Math.round(end - start)));
    let nextStart = Math.round(start), nextEnd = nextStart + span;
    if (nextStart < 0) { nextEnd -= nextStart; nextStart = 0; }
    if (nextEnd > total) { nextStart -= nextEnd - total; nextEnd = total; }
    viewport.start = Math.max(0, nextStart); viewport.end = Math.max(viewport.start + 1, nextEnd);
    if (persist) localStorage.setItem("etf-chart-range", String(viewport.end - viewport.start));
    updateRangeControls(); drawChart();
  }
  function updateRangeControls() {
    const span = viewport.end - viewport.start;
    document.querySelectorAll("[data-range-days]").forEach(button => {
      const days = button.dataset.rangeDays === "all" ? currentRows.length : Number(button.dataset.rangeDays);
      button.classList.toggle("active", currentRows.length > 0 && span === Math.min(days, currentRows.length));
    });
    const label = $("visibleRange"), first = currentRows[viewport.start], last = currentRows[viewport.end - 1];
    if (label) label.textContent = first && last ? `${first.date} ～ ${last.date}・${span} 日` : "";
  }
  function movingAverage(rows, index, period) {
    const values = rows.slice(Math.max(0, index - period + 1), index + 1).map(r => Number(r.close));
    return values.length === period ? values.reduce((a, b) => a + b, 0) / period : null;
  }
  function volumeMovingAverage(rows, index, period) {
    const values = rows.slice(Math.max(0, index - period + 1), index + 1).map(r => Number(r.volume));
    return values.length === period && values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) / period : null;
  }
  function bollingerValues(rows, index, period = 20, multiplier = 2) {
    const values = rows.slice(Math.max(0, index - period + 1), index + 1).map(r => Number(r.close));
    if (values.length < 2) return null;
    const sampleSize = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / sampleSize;
    const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sampleSize);
    return { mid:mean, upper:mean + multiplier * deviation, lower:mean - multiplier * deviation, sampleSize, warming:sampleSize < period };
  }
  function emaValues(rows, period) {
    const alpha = 2 / (period + 1), result = [];
    rows.forEach((row, index) => {
      const close = Number(row.close), previous = result[index - 1];
      result.push(Number.isFinite(close) ? (previous == null ? close : close * alpha + previous * (1 - alpha)) : null);
    });
    return result;
  }
  function macdValues(rows) {
    const fast = emaValues(rows, 12), slow = emaValues(rows, 26), macd = rows.map((_, i) => fast[i] == null || slow[i] == null ? null : fast[i] - slow[i]);
    const alpha = 2 / 10, signal = [];
    macd.forEach((value, index) => signal.push(value == null ? null : (signal[index - 1] == null ? value : value * alpha + signal[index - 1] * (1 - alpha))));
    return rows.map((_, i) => ({ macd:macd[i], signal:signal[i], histogram:macd[i] == null || signal[i] == null ? null : macd[i] - signal[i] }));
  }
  function rsiValues(rows, period = 14) {
    return rows.map((_, index) => {
      if (index < 1) return null;
      let gains = 0, losses = 0;
      const start = Math.max(1, index - period + 1);
      for (let i = start; i <= index; i++) {
        const change = Number(rows[i].close) - Number(rows[i - 1].close);
        if (change >= 0) gains += change; else losses -= change;
      }
      if (gains === 0 && losses === 0) return 50;
      if (losses === 0) return 100;
      const rs = gains / losses;
      return 100 - 100 / (1 + rs);
    });
  }
  function kdValues(rows) {
    let k = 50, d = 50;
    return rows.map((row, index) => {
      const period = rows.slice(Math.max(0, index - 8), index + 1);
      const high = Math.max(...period.map(r => Number(r.high))), low = Math.min(...period.map(r => Number(r.low)));
      const rsv = high === low ? 50 : (Number(row.close) - low) / (high - low) * 100;
      k = k * 2 / 3 + rsv / 3;
      d = d * 2 / 3 + k / 3;
      return { k, d };
    });
  }
  function signalMeta(score) {
    if (score >= 1.25) return { key:"strong-buy", label:"強力買進", color:"#3977f6" };
    if (score >= .4) return { key:"buy", label:"偏多／買進", color:"#548dff" };
    if (score > -.4) return { key:"neutral", label:"中立觀察", color:"#8a93a3" };
    if (score > -1.25) return { key:"sell", label:"偏空／減碼", color:"#e15b76" };
    return { key:"strong-sell", label:"強力賣出", color:"#ef405f" };
  }
  function analyzeSignal(rows) {
    const lastIndex = rows.length - 1, last = rows[lastIndex], previous = rows[lastIndex - 1];
    const ma5 = movingAverage(rows, lastIndex, 5), prevMa5 = movingAverage(rows, lastIndex - 1, 5), ma20 = movingAverage(rows, lastIndex, 20);
    const kd = kdValues(rows), latestKd = kd[lastIndex], previousKd = kd[lastIndex - 1];
    const recentVolumes = rows.slice(Math.max(0, rows.length - 5), -1).map(r => Number(r.volume)).filter(Number.isFinite);
    const averageVolume = recentVolumes.length ? recentVolumes.reduce((sum, value) => sum + value, 0) / recentVolumes.length : null;
    const volumeRatio = averageVolume ? Number(last.volume) / averageVolume : null;
    const components = [], reasons = [], risks = [];
    let trendScore = 0;
    if (ma5 != null) trendScore += Number(last.close) >= ma5 ? 1 : -1;
    if (prevMa5 != null && ma5 != null) trendScore += ma5 >= prevMa5 ? 1 : -1;
    else if (previous) trendScore += Number(last.close) >= Number(previous.close) ? 1 : -1;
    trendScore = Math.max(-2, Math.min(2, trendScore));
    components.push({ name:"價格趨勢", score:trendScore, detail:ma5 == null ? "資料未滿 5 日" : `收盤 ${Number(last.close) >= ma5 ? "高於" : "低於"} MA5` });
    if (trendScore > 0) reasons.push(`收盤價位於 MA5 ${Number(last.close) >= ma5 ? "之上" : "附近"}，短線趨勢偏多`);
    if (trendScore < 0) risks.push("短線價格趨勢轉弱，留意跌破近期低點");

    let averageScore = ma5 == null ? 0 : (Number(last.close) >= ma5 ? 1 : -1);
    if (ma20 != null) averageScore += Number(last.close) >= ma20 ? 1 : -1;
    else risks.push(`目前僅 ${rows.length} 日資料，MA20 尚未形成`);
    components.push({ name:"移動平均線", score:averageScore, detail:ma20 == null ? "MA20 待資料累積" : `收盤 ${Number(last.close) >= ma20 ? "站上" : "跌破"} MA20` });
    if (averageScore >= 2) reasons.push("收盤同時站上 MA5 與 MA20");
    if (averageScore <= -2) risks.push("收盤同時跌破 MA5 與 MA20");

    let kdScore = latestKd.k >= latestKd.d ? 1 : -1;
    const bullishCross = previousKd && previousKd.k <= previousKd.d && latestKd.k > latestKd.d;
    const bearishCross = previousKd && previousKd.k >= previousKd.d && latestKd.k < latestKd.d;
    if (bullishCross) kdScore = latestKd.k <= 30 ? 2 : 1.5;
    if (bearishCross) kdScore = latestKd.k >= 70 ? -2 : -1.5;
    if (latestKd.k >= 80 && kdScore > 0) { kdScore -= .5; risks.push("KD 位於 80 以上高檔區，追價風險較高"); }
    if (latestKd.k <= 20 && kdScore < 0) risks.push("KD 位於 20 以下低檔區，仍需等待止跌確認");
    components.push({ name:"KD 動能", score:kdScore, detail:`K ${price(latestKd.k)}／D ${price(latestKd.d)}` });
    if (bullishCross) reasons.push(`KD 黃金交叉${latestKd.k <= 30 ? "，且位於相對低檔" : ""}`);
    else if (bearishCross) risks.push(`KD 死亡交叉${latestKd.k >= 70 ? "，且位於相對高檔" : ""}`);
    else if (kdScore > 0) reasons.push("K 值位於 D 值之上，短線動能偏多");

    let volumeScore = 0;
    if (volumeRatio != null && previous) {
      const rising = Number(last.close) >= Number(previous.close);
      if (volumeRatio >= 1.2) volumeScore = rising ? 2 : -2;
      else if (volumeRatio >= .8) volumeScore = rising ? 1 : -1;
      if (volumeScore >= 2) reasons.push(`上漲且成交量為近 4 日均量的 ${volumeRatio.toFixed(2)} 倍`);
      if (volumeScore <= -2) risks.push(`下跌且成交量放大至近 4 日均量的 ${volumeRatio.toFixed(2)} 倍`);
    }
    components.push({ name:"量價表現", score:volumeScore, detail:volumeRatio == null ? "成交量資料不足" : `量比 ${volumeRatio.toFixed(2)} 倍` });
    const rawScore = components.reduce((sum, item) => sum + item.score, 0) / components.length;
    // MA20 尚未形成前不顯示「強力」訊號，避免少量資料造成過度確定的結論。
    const weighted = rows.length < 20 ? Math.max(-1.2, Math.min(1.2, rawScore)) : rawScore;
    const meta = signalMeta(weighted), completeness = Math.min(100, Math.round(rows.length / 20 * 100));
    return { score:weighted, gauge:Math.round((weighted + 2) / 4 * 100), meta, components, reasons:reasons.slice(0, 3), risks:risks.slice(0, 3), completeness, ma5, ma20, kd:latestKd, volumeRatio };
  }
  function gaugeSvg(value, color, label, small) {
    const width = small ? 230 : 330, height = small ? 152 : 180, cx = width / 2, cy = small ? 108 : 145, radius = small ? 76 : 110;
    const startX = cx - radius, endX = cx + radius, angle = Math.PI * (1 - value / 100), needleX = cx + Math.cos(angle) * radius * .76, needleY = cy - Math.sin(angle) * radius * .76;
    // 保留弧形高低層次；左右標籤往色帶外側移，文字朝外延伸。
    const levelSize = small ? 8 : 10, sideY = cy - radius * .57, sideOffset = radius * .92;
    return `<svg class="signal-gauge-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><defs><linearGradient id="signalGradient${small ? "Small" : "Main"}" x1="0" x2="1"><stop offset="0" stop-color="#ef405f"/><stop offset=".5" stop-color="#9b65b7"/><stop offset="1" stop-color="#3977f6"/></linearGradient></defs><path d="M ${startX} ${cy} A ${radius} ${radius} 0 0 1 ${endX} ${cy}" fill="none" stroke="var(--border)" stroke-width="${small ? 15 : 21}"/><path d="M ${startX} ${cy} A ${radius} ${radius} 0 0 1 ${endX} ${cy}" fill="none" stroke="url(#signalGradient${small ? "Small" : "Main"})" stroke-width="${small ? 10 : 14}"/><line x1="${cx}" y1="${cy}" x2="${needleX}" y2="${needleY}" stroke="var(--text)" stroke-width="${small ? 3 : 4}" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${small ? 5 : 7}" fill="var(--text)"/><text x="${startX}" y="${cy + 18}" class="signal-axis" font-size="${levelSize}" text-anchor="start">強力賣出</text><text x="${cx - sideOffset}" y="${sideY}" class="signal-axis" font-size="${levelSize}" text-anchor="end">賣出</text><text x="${cx}" y="${small ? 26 : 30}" class="signal-axis" font-size="${levelSize}" text-anchor="middle">中立</text><text x="${cx + sideOffset}" y="${sideY}" class="signal-axis" font-size="${levelSize}" text-anchor="start">買進</text><text x="${endX}" y="${cy + 18}" class="signal-axis" font-size="${levelSize}" text-anchor="end">強力買進</text></svg>`;
  }
  function renderSignal(rows) {
    const box = $("signalPanel"); if (!box) return;
    if (!rows.length) { box.innerHTML = ""; return; }
    const signal = analyzeSignal(rows);
    const componentCards = signal.components.map(item => { const meta = signalMeta(item.score); return `<article class="signal-component"><h4>${esc(item.name)}</h4>${gaugeSvg(Math.round((item.score + 2) / 4 * 100), meta.color, `${item.name}：${meta.label}`, true)}<strong style="color:${meta.color}">${esc(meta.label)}</strong><small>${esc(item.detail)}</small></article>`; }).join("");
    box.innerHTML = `<div class="signal-heading"><div><h3>每日操作訊號</h3><p>依最新收盤資料計算，作為技術面觀察，不是保證獲利的買賣指令。</p></div><span class="signal-date">資料日 ${esc(rows.at(-1).date)}</span></div><div class="signal-main"><div class="signal-overall">${gaugeSvg(signal.gauge, signal.meta.color, `綜合訊號：${signal.meta.label}`, false)}<div class="signal-label" style="color:${signal.meta.color}">${esc(signal.meta.label)}</div><div class="signal-score">訊號分數 ${signal.score.toFixed(2)}／2</div></div><div class="signal-explain"><div class="signal-notes"><section><h4>成立理由</h4>${signal.reasons.length ? `<ul>${signal.reasons.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>` : "<p>目前沒有足夠的偏多確認條件。</p>"}</section><section class="risk"><h4>風險提醒</h4>${signal.risks.length ? `<ul>${signal.risks.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>` : "<p>目前未偵測到明顯技術面風險。</p>"}</section></div></div></div><div class="signal-components">${componentCards}</div><div class="signal-footnote">判斷項目：價格趨勢、移動平均線、KD 動能與量價表現。至少搭配自身風險承受度、資金配置及重大消息判斷。</div>`;
  }
  function newsDate(value) {
    if (!value) return "時間未提供";
    const date = new Date(value.length === 10 ? value + "T00:00:00+08:00" : value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { month:"2-digit", day:"2-digit", hour:value.length > 10 ? "2-digit" : undefined, minute:value.length > 10 ? "2-digit" : undefined, hour12:false });
  }
  async function renderNews(code, security, name) {
    const box = $("newsPanel"); if (!box) return;
    const info = securityInfo(code, security), market = info.market, symbol = info.symbol;
    const requestKey = `${symbol}|${name}|${market}`; box.dataset.requestKey = requestKey;
    box.innerHTML = `<div class="news-heading"><div><h3>最新消息</h3></div><span class="news-status">載入中…</span></div><div class="news-loading">正在查詢 ${esc(name || symbol)} 的相關消息…</div>`;
    try {
      const response = await fetch(`/api/news?code=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name || symbol)}&market=${encodeURIComponent(market)}`, { cache:"no-store" });
      const payload = await response.json();
      if (box.dataset.requestKey !== requestKey) return;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "消息來源暫時無法連線");
      const items = Array.isArray(payload.items) ? payload.items : [];
      const cards = items.map(item => `<article class="news-item ${item.type === "official" ? "official" : ""}"><div class="news-meta"><span class="news-type">${item.type === "official" ? "官方公告" : "媒體報導"}</span><span>${esc(item.category || "最新消息")}</span><time>${esc(newsDate(item.publishedAt))}</time></div><h4><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h4><div class="news-source">來源：${esc(item.source || "未標示")}${item.factDate ? `　事件日：${esc(item.factDate)}` : ""}</div></article>`).join("");
      box.innerHTML = `<div class="news-heading"><div><h3>最新消息</h3></div><span class="news-status">官方 ${payload.officialCount || 0} 則・新聞 ${payload.newsCount || 0} 則</span></div>${cards ? `<div class="news-list">${cards}</div>` : `<div class="news-empty">近 7 日未找到 ${esc(name || symbol)} 的相關消息。</div>`}<div class="news-footnote">媒體標題由 Google News RSS 彙整，著作權屬原媒體；點擊後前往原始來源。消息不直接計入技術面操作訊號，請自行判讀事件影響。</div>`;
    } catch (error) {
      if (box.dataset.requestKey !== requestKey) return;
      box.innerHTML = `<div class="news-heading"><div><h3>最新消息</h3></div></div><div class="news-empty">${esc(error.message || "消息來源暫時無法連線，請稍後重試。")}</div>`;
    }
  }
  function updateChartType() {
    document.querySelectorAll("[data-chart-type]").forEach(button => {
      const active = button.dataset.chartType === chartType;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const closeLegend = $("closeLegend"), candleLegend = $("candleLegend"), tip = $("tip");
    if (closeLegend) closeLegend.style.display = chartType === "line" ? "inline-flex" : "none";
    if (candleLegend) candleLegend.style.display = chartType === "candle" ? "inline-flex" : "none";
    if (tip) tip.textContent = chartType === "line" ? "將滑鼠移到線圖上查看每日收盤價。" : "將滑鼠移到圖表上半部的 K 線區域。";
  }
  function updateMaControls() {
    document.querySelectorAll("[data-ma-period]").forEach(button => {
      const active = visibleMas.has(Number(button.dataset.maPeriod));
      button.setAttribute("aria-pressed", String(active));
    });
  }
  function updateVolumeMaControls() {
    document.querySelectorAll("[data-volume-ma-period]").forEach(button => {
      button.setAttribute("aria-pressed", String(visibleVolumeMas.has(Number(button.dataset.volumeMaPeriod))));
    });
  }
  function updateIndicatorControls() {
    document.querySelectorAll("[data-indicator]").forEach(button => {
      button.setAttribute("aria-pressed", String(visibleIndicators.has(button.dataset.indicator)));
    });
  }
  function updateTradeOverlayControls() {
    document.querySelectorAll("[data-trade-overlay]").forEach(button => {
      button.setAttribute("aria-pressed", String(visibleTradeOverlays.has(button.dataset.tradeOverlay)));
      if (button.dataset.tradeOverlay === "cost") {
        const available = Number.isFinite(personalTrades.averageCost);
        button.title = available ? `目前持倉平均成本 ${price(personalTrades.averageCost)} ${personalTrades.currency || ""}`.trim() : "目前標的沒有未平倉持倉成本；需先建立個人交易紀錄";
      }
    });
  }
  function premiumTone(value) {
    if (value == null) return { label:"資料不足", key:"neutral", note:"尚無同日淨值資料" };
    if (value > 1) return { label:"明顯溢價", key:"premium-high", note:"市價明顯高於淨值，買進前請留意追價風險" };
    if (value > .3) return { label:"小幅溢價", key:"premium", note:"市價略高於淨值" };
    if (value < -1) return { label:"明顯折價", key:"discount-high", note:"折價不等於便宜，仍須確認流動性及標的市場交易時間" };
    if (value < -.3) return { label:"小幅折價", key:"discount", note:"市價略低於淨值" };
    return { label:"接近淨值", key:"neutral", note:"市價與淨值差距在 ±0.30% 內" };
  }
  function renderPremium(code, security) {
    const box = $("premiumBox"); if (!box) return;
    const info = securityInfo(code, security);
    if (info.assetType !== "etf" || info.market !== "TW" || !data.etfs[info.symbol]) { box.style.display = "none"; box.innerHTML = ""; return; }
    code = info.symbol;
    const history = data.etfs[code]?.overview?.navHistory || [];
    if (!history.length) { box.style.display = "block"; box.innerHTML = '<div class="premium-empty">折溢價資料尚未取得，下一次每日更新後會自動補入。</div>'; return; }
    const snapshots = data.etfs[code]?.snapshots || [], snapshotDates = new Set(snapshots.map(row => row.date));
    const latest = [...history].reverse().find(row => snapshotDates.has(row.date)) || history.at(-1);
    const premium = Number(latest.premiumPct), tone = premiumTone(Number.isFinite(premium) ? premium : null);
    const snapshot = snapshots.find(row => row.date === latest.date), marketPrice = snapshot?.self?.close;
    const recent = history.filter(row => row.date <= latest.date).slice(-10).map(row => Number(row.premiumPct)).filter(Number.isFinite), low = recent.length ? Math.min(...recent) : null, high = recent.length ? Math.max(...recent) : null;
    const signed = Number.isFinite(premium) ? `${premium > 0 ? "+" : ""}${premium.toFixed(2)}%` : "—";
    box.style.display = "flex";
    box.innerHTML = `<div class="premium-inline-item premium-inline-main ${tone.key}"><span>收盤折溢價</span><strong>${esc(signed)}</strong><b>${esc(tone.label)}</b></div><div class="premium-inline-item"><span>市價</span><strong>${marketPrice == null ? "—" : price(marketPrice)}</strong></div><div class="premium-inline-item"><span>每單位淨值</span><strong>${price(latest.nav)}</strong></div><div class="premium-inline-item"><span>近 ${recent.length} 日區間</span><strong>${low == null ? "—" : `${low > 0 ? "+" : ""}${low.toFixed(2)}% ～ ${high > 0 ? "+" : ""}${high.toFixed(2)}%`}</strong></div><div class="premium-note premium-inline-source"><span>${esc(tone.note)}</span><small>官方資料日 ${esc(latest.date)}・來源：<a href="https://www.twse.com.tw/zh/ETFortune/etfInfo/${encodeURIComponent(code)}" target="_blank" rel="noopener noreferrer">證交所 ETF e添富</a></small></div>`;
  }
  function tradeSummary(fills) {
    const lots = [];
    const ordered = fills.slice().sort((a, b) => String(a.fill_date || "").localeCompare(String(b.fill_date || "")) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
    ordered.forEach(fill => {
      let remaining = Number(fill.shares) || 0;
      if (fill.side === "buy") { lots.push({ fill, remaining }); return; }
      while (remaining > 0) {
        const lot = lots.find(item => item.remaining > 0);
        if (!lot) break;
        const used = Math.min(remaining, lot.remaining);
        lot.remaining -= used; remaining -= used;
      }
    });
    const openLots = lots.filter(lot => lot.remaining > 0), openShares = openLots.reduce((sum, lot) => sum + lot.remaining, 0);
    const totalCost = openLots.reduce((sum, lot) => {
      const shares = Number(lot.fill.shares) || 1, commission = Number(lot.fill.commission_native) || 0;
      return sum + lot.remaining * (Number(lot.fill.price) + commission / shares);
    }, 0);
    return { markers:ordered, openShares, averageCost:openShares ? totalCost / openShares : null, currency:ordered.at(-1)?.currency || "" };
  }
  function renderTradeBox(message) {
    const box = $("tradeBox"); if (!box) return;
    if (message && message.startsWith("尚未記錄")) { box.style.display = "none"; box.innerHTML = ""; return; }
    if (message) { box.style.display = "block"; box.innerHTML = `<div class="trade-empty">${esc(message)}</div>`; return; }
    const visibleDates = new Set(currentRows.map(row => row.date));
    const visibleCount = personalTrades.markers.filter(fill => visibleDates.has(fill.fill_date)).length;
    box.style.display = "grid";
    box.innerHTML = `<div><span>個人交易圖層</span><strong>${personalTrades.markers.length} 筆進出明細</strong></div><div><span>目前未平倉</span><strong>${num(personalTrades.openShares)} 股</strong></div><div><span>剩餘部位平均成本</span><strong>${personalTrades.averageCost == null ? "—" : `${price(personalTrades.averageCost)} ${esc(personalTrades.currency)}`}</strong></div><small>目前圖表區間顯示 ${visibleCount} 個買賣標記；平均成本含買進手續費，採 FIFO 扣除已賣股數。</small>`;
  }
  async function loadPersonalTrades(code, security) {
    const info = securityInfo(code, security), key = `${info.symbol}|${info.market}`;
    personalTrades = { key, markers:[], openShares:0, averageCost:null, currency:"" };
    if (currentRows.length) drawChart();
    if (!["TW", "US"].includes(info.market)) { renderTradeBox("目前個人交易日誌只支援台灣與美國市場。"); return; }
    const auth = window.ETFAuth;
    if (!auth?.isConfigured?.()) { renderTradeBox("個人交易圖層尚未設定。"); return; }
    if (!auth.user?.()) { renderTradeBox("登入後可在線圖顯示自己的買進、賣出與持倉平均成本。"); return; }
    renderTradeBox("正在讀取個人進出明細…");
    try {
      const entriesResult = await auth.client().from("trade_journal_entries").select("id,symbol,market").eq("symbol", info.symbol).eq("market", info.market.toLowerCase());
      if (personalTrades.key !== key) return;
      if (entriesResult.error) throw entriesResult.error;
      const ids = (entriesResult.data || []).map(row => row.id);
      if (!ids.length) { renderTradeBox(`尚未記錄 ${info.symbol} 的進出明細。`); return; }
      const fillsResult = await auth.client().from("trade_journal_fills").select("journal_id,fill_date,side,shares,price,currency,commission_native,created_at").in("journal_id", ids).order("fill_date", { ascending:true }).order("created_at", { ascending:true });
      if (personalTrades.key !== key) return;
      if (fillsResult.error) throw fillsResult.error;
      personalTrades = { key, ...tradeSummary(fillsResult.data || []) };
      renderTradeBox();
      updateTradeOverlayControls();
      if (currentRows.length) drawChart();
    } catch (_) {
      if (personalTrades.key === key) renderTradeBox("個人進出明細暫時無法讀取，請稍後重試。");
    }
  }
  const financialMetrics = {
    revenue:{ label:"營收" }, operatingIncome:{ label:"營業利益" },
    netIncome:{ label:"淨利" }, eps:{ label:"EPS" },
    operatingCashFlow:{ label:"營業現金流" }, investingCashFlow:{ label:"投資現金流" },
    financingCashFlow:{ label:"融資現金流" }, freeCashFlow:{ label:"自由現金流" }
  };
  const cashFlowMetrics = new Set(["operatingCashFlow", "investingCashFlow", "financingCashFlow", "freeCashFlow"]);
  function compactMoney(value, currency) {
    const absolute = Math.abs(Number(value));
    const matched = [[1e12,"兆"],[1e8,"億"],[1e6,"百萬"],[1e3,"千"]].find(([threshold]) => absolute >= threshold);
    if (!matched) return `${num(value)} ${currency || ""}`.trim();
    return `${(Number(value) / matched[0]).toLocaleString("zh-TW", { maximumFractionDigits:2 })} ${matched[1]}${currency || ""}`;
  }
  function growthText(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return "—";
    const value = (current - previous) / Math.abs(previous) * 100;
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  }
  const isLowGrowthBase = (metric, previous) => metric === "eps" && Number.isFinite(previous) && Math.abs(previous) <= .05;
  function renderFinancialChart(payload, metric) {
    const box = $("financialPanel"), allRows = (financialPeriod === "quarterly" ? payload.quarters : payload.years) || [], rows = financialPeriod === "annual" ? allRows.slice(-5) : allRows, meta = financialMetrics[metric];
    const plotRows = rows.filter(row => Number.isFinite(Number(row[metric]))), values = plotRows.map(row => Number(row[metric]));
    if (plotRows.length < 2) { box.querySelector(".financial-content").innerHTML = `<div class="financial-empty">這項指標的${financialPeriod === "quarterly" ? "季度" : "年度"}資料不足，無法繪圖。</div>`; return; }
    const yoyOffset = financialPeriod === "quarterly" ? 4 : 1;
    const yoyValues = plotRows.map((row, index) => {
      const sourceIndex = rows.indexOf(row), previous = rows[sourceIndex - yoyOffset];
      return previous && Number.isFinite(Number(previous[metric])) ? Number(growthText(Number(row[metric]), Number(previous[metric])).replace("%", "")) : null;
    });
    const yoyLowBases = plotRows.map(row => {
      const sourceIndex = rows.indexOf(row), previous = rows[sourceIndex - yoyOffset];
      return Boolean(previous && isLowGrowthBase(metric, Number(previous[metric])));
    });
    const finiteValues = values.filter(Number.isFinite), finiteYoy = yoyValues.filter(Number.isFinite);
    const width = 900, height = 300, padL = 62, padR = 62, padT = 28, padB = 48;
    const floor = Math.min(0, ...finiteValues), ceiling = Math.max(0, ...finiteValues), span = ceiling - floor || 1;
    const yoyFloor = Math.min(0, ...finiteYoy), yoyCeiling = Math.max(0, ...finiteYoy), yoySpan = yoyCeiling - yoyFloor || 1;
    const plotWidth = width - padL - padR, plotHeight = height - padT - padB;
    const bandWidth = Math.min(financialPeriod === "annual" ? 118 : 82, plotWidth / Math.max(plotRows.length, 1));
    const contentWidth = bandWidth * plotRows.length;
    const barWidth = Math.min(78, bandWidth * .68);
    const plotLeft = (width - contentWidth) / 2 + bandWidth / 2, plotRight = plotLeft + bandWidth * Math.max(plotRows.length - 1, 0);
    const x = index => plotLeft + index * (plotRight - plotLeft) / Math.max(plotRows.length - 1, 1);
    const y = value => padT + (ceiling - value) * plotHeight / span;
    const yoyY = value => padT + (yoyCeiling - value) * plotHeight / yoySpan;
    const points = yoyValues.map((value, index) => Number.isFinite(value) ? `${x(index)},${yoyY(value)}` : null).filter(Boolean).join(" ");
    const baseline = y(0);
    const showBar = financialChartMode === "both" || financialChartMode === "bar", showLine = financialChartMode === "both" || financialChartMode === "line";
    const bars = showBar ? values.map((value, index) => {
      if (!Number.isFinite(value)) return "";
      const valueY = y(value), rectY = Math.min(valueY, baseline), rectHeight = Math.max(1, Math.abs(baseline - valueY));
      return `<rect x="${x(index) - barWidth / 2}" y="${rectY}" width="${barWidth}" height="${rectHeight}" rx="6" class="financial-bar${value < 0 ? " negative" : ""}"/>`;
    }).join("") : "";
    const trend = showLine ? `<polyline points="${points}" class="financial-line"/>${yoyValues.map((value, index) => Number.isFinite(value) ? `<g data-financial-yoy="${value.toFixed(2)}" data-low-base="${yoyLowBases[index]}" data-period="${esc(plotRows[index].year)}"><circle cx="${x(index)}" cy="${yoyY(value)}" r="4" class="financial-dot"/><circle cx="${x(index)}" cy="${yoyY(value)}" r="13" class="financial-dot-hit"/></g>` : "").join("")}` : "";
    const grid = [0, .25, .5, .75, 1].map(ratio => {
      const leftValue = ceiling - ratio * span, rightValue = yoyCeiling - ratio * yoySpan, yy = padT + ratio * plotHeight;
      return `<line x1="${padL}" x2="${width-padR}" y1="${yy}" y2="${yy}" class="grid"/><text x="${padL-12}" y="${yy+4}" text-anchor="end" class="axis">${esc(metric === "eps" ? price(leftValue) : compactMoney(leftValue, ""))}</text><text x="${width-padR+12}" y="${yy+4}" class="axis">${rightValue.toFixed(0)}%</text>`;
    }).join("");
    const labels = plotRows.map((row, index) => `<g><text x="${x(index)}" y="${Math.max(16, y(values[index]) - 9)}" text-anchor="middle" class="financial-value${values[index] < 0 ? " negative" : ""}">${esc(metric === "eps" ? price(values[index]) : compactMoney(values[index], ""))}</text><text x="${x(index)}" y="${height - 14}" text-anchor="middle" class="axis">${esc(row.year)}</text></g>`).join("");
    const latest = plotRows.at(-1), latestIndex = rows.indexOf(latest), previousIndex = latestIndex - yoyOffset, currency = latest.currency || "";
    const latestValue = metric === "eps" ? `${price(latest[metric])} ${currency}` : compactMoney(latest[metric], currency);
    const yoy = previousIndex >= 0 ? growthText(Number(latest[metric]), Number(rows[previousIndex][metric])) : "—";
    const latestLowBase = previousIndex >= 0 && isLowGrowthBase(metric, Number(rows[previousIndex][metric]));
    const operatingMargin = Number.isFinite(Number(latest.revenue)) && Number.isFinite(Number(latest.operatingIncome)) && Number(latest.revenue) !== 0 ? Number(latest.operatingIncome) / Number(latest.revenue) * 100 : null;
    const netMargin = Number.isFinite(Number(latest.revenue)) && Number.isFinite(Number(latest.netIncome)) && Number(latest.revenue) !== 0 ? Number(latest.netIncome) / Number(latest.revenue) * 100 : null;
    const isCashFlow = cashFlowMetrics.has(metric);
    const secondaryOne = isCashFlow ? (latest.freeCashFlow == null ? "—" : compactMoney(latest.freeCashFlow, currency)) : (operatingMargin == null ? "—" : operatingMargin.toFixed(1) + "%");
    const secondaryTwo = isCashFlow ? (latest.endingCash == null ? "—" : compactMoney(latest.endingCash, currency)) : (netMargin == null ? "—" : netMargin.toFixed(1) + "%");
    const secondaryOneLabel = isCashFlow ? "自由現金流" : "營業利益率";
    const secondaryTwoLabel = isCashFlow ? "期末現金" : "淨利率";
    const source = payload.source || { name:"Yahoo Finance", url:`https://finance.yahoo.com/quote/${encodeURIComponent(payload.symbol)}/financials/` };
    const quarterNote = financialPeriod === "quarterly" && payload.quarterlyMethod ? `；${esc(payload.quarterlyMethod)}` : "";
    box.querySelector(".financial-content").innerHTML = `<div class="financial-summary"><div><span>${esc(latest.year)} ${esc(meta.label)}</span><strong>${esc(latestValue)}</strong></div><div><span>年增率${latestLowBase ? "（低基期）" : ""}</span><strong class="${yoy.startsWith("+") ? "up" : yoy.startsWith("-") ? "down" : ""}">${esc(yoy)}</strong></div><div><span>${secondaryOneLabel}</span><strong>${esc(secondaryOne)}</strong></div><div><span>${secondaryTwoLabel}</span><strong>${esc(secondaryTwo)}</strong></div></div><div class="financial-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(meta.label)}${financialPeriod === "quarterly" ? "季度" : "年度"}長條與 YoY 折線圖">${grid}<line x1="${padL}" x2="${width-padR}" y1="${baseline}" y2="${baseline}" class="grid financial-zero"/>${bars}${trend}${labels}</svg><div class="financial-tooltip" hidden></div></div><div class="financial-note">${financialPeriod === "quarterly" ? "季度財報" : "年度合併財報"}・幣別 ${esc(currency || "未標示")}；長條為 ${esc(meta.label)}，折線為 YoY 成長率${quarterNote}。不同幣別公司不宜直接比較金額。資料來源：<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)}</a></div>`;
    const chart = box.querySelector(".financial-chart"), tooltip = chart.querySelector(".financial-tooltip");
    const showFinancialTooltip = (event, point) => {
      const chartRect = chart.getBoundingClientRect();
      tooltip.innerHTML = `<strong>${esc(point.dataset.period)}</strong><span>YoY ${Number(point.dataset.financialYoy) >= 0 ? "+" : ""}${Number(point.dataset.financialYoy).toFixed(2)}%${point.dataset.lowBase === "true" ? "（低基期）" : ""}</span>`;
      tooltip.hidden = false;
      const tipWidth = tooltip.offsetWidth, tipHeight = tooltip.offsetHeight;
      const visibleLeft = chart.scrollLeft + 6;
      const leftPos = Math.max(visibleLeft, Math.min(visibleLeft + chartRect.width - tipWidth - 12, chart.scrollLeft + event.clientX - chartRect.left + 12));
      const topPos = Math.max(6, event.clientY - chartRect.top - tipHeight - 12);
      tooltip.style.left = `${leftPos}px`; tooltip.style.top = `${topPos}px`;
    };
    chart.querySelectorAll("[data-financial-yoy]").forEach(point => {
      point.addEventListener("pointerenter", event => showFinancialTooltip(event, point));
      point.addEventListener("pointermove", event => showFinancialTooltip(event, point));
      point.addEventListener("pointerdown", event => showFinancialTooltip(event, point));
      point.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    });
    chart.addEventListener("pointerleave", () => { tooltip.hidden = true; });
  }
  async function renderFinancials(code, security, name) {
    const box = $("financialPanel"); if (!box) return;
    const info = securityInfo(code, security), key = `${info.symbol}|${info.market}`; financialRequestKey = key;
    if (info.assetType === "etf") { box.style.display = "none"; box.innerHTML = ""; return; }
    box.style.display = "block";
    box.innerHTML = `<div class="financial-heading"><div><h3>財報趨勢</h3><p>${esc(name)}・年度／季度財務表現</p></div><span>載入中…</span></div><div class="financial-empty">正在取得財務資料…</div>`;
    try {
      const response = await fetch(`/api/financials?code=${encodeURIComponent(info.symbol)}&market=${encodeURIComponent(info.market)}&v=20260819-2`, { cache:"default" });
      const payload = await response.json().catch(() => ({ ok:false, error:"財務資料暫時無法取得" }));
      if (financialRequestKey !== key) return;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "財務資料暫時無法取得");
      if (!payload.years?.length && !payload.quarters?.length) throw new Error("目前查無可用財報資料");
      if (window.MarketChart) window.MarketChart.currentFinancials = payload;
      document.dispatchEvent(new CustomEvent("marketchart:financials", { detail:{ asset:{ ...info }, payload } }));
      if (financialPeriod === "quarterly" && !(payload.quarters || []).length) financialPeriod = "annual";
      if (!(payload.years || []).length && (payload.quarters || []).length) financialPeriod = "quarterly";
      box.innerHTML = `<div class="financial-heading"><div><h3>財報趨勢</h3><p>${esc(name)}・年度／季度財務表現</p></div><span>${esc(payload.symbol)}</span></div><div class="financial-controls"><div class="financial-tabs" role="group" aria-label="選擇財務指標">${Object.entries(financialMetrics).map(([metric, item], index) => `<button type="button" data-financial-metric="${metric}" class="${index === 0 ? "active" : ""}">${item.label}</button>`).join("")}</div><div class="financial-period" role="group" aria-label="選擇財報期間"><span>期間</span><button type="button" data-financial-period="annual">年度</button><button type="button" data-financial-period="quarterly">季度</button></div><div class="financial-view" role="group" aria-label="選擇財報圖表類型"><span>圖型</span><button type="button" data-financial-mode="both">長條＋折線</button><button type="button" data-financial-mode="bar">長條</button><button type="button" data-financial-mode="line">折線</button></div></div><div class="financial-content"></div>`;
      box.querySelectorAll("[data-financial-period]").forEach(button => {
        const active = button.dataset.financialPeriod === financialPeriod, available = button.dataset.financialPeriod === "annual" ? payload.years?.length : payload.quarters?.length;
        button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); button.disabled = !available;
        button.addEventListener("click", () => {
          financialPeriod = button.dataset.financialPeriod; localStorage.setItem("financial-period", financialPeriod);
          box.querySelectorAll("[data-financial-period]").forEach(item => { const selected = item === button; item.classList.toggle("active", selected); item.setAttribute("aria-pressed", String(selected)); });
          const activeMetric = box.querySelector("[data-financial-metric].active")?.dataset.financialMetric || "revenue";
          renderFinancialChart(payload, activeMetric);
        });
      });
      box.querySelectorAll("[data-financial-mode]").forEach(button => {
        const active = button.dataset.financialMode === financialChartMode;
        button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
        button.addEventListener("click", () => {
          financialChartMode = button.dataset.financialMode; localStorage.setItem("financial-chart-mode", financialChartMode);
          box.querySelectorAll("[data-financial-mode]").forEach(item => { const selected = item === button; item.classList.toggle("active", selected); item.setAttribute("aria-pressed", String(selected)); });
          const activeMetric = box.querySelector("[data-financial-metric].active")?.dataset.financialMetric || "revenue";
          renderFinancialChart(payload, activeMetric);
        });
      });
      box.querySelectorAll("[data-financial-metric]").forEach(button => button.addEventListener("click", () => {
        box.querySelectorAll("[data-financial-metric]").forEach(item => item.classList.toggle("active", item === button));
        renderFinancialChart(payload, button.dataset.financialMetric);
      }));
      renderFinancialChart(payload, "revenue");
    } catch (error) {
      if (financialRequestKey === key) box.innerHTML = `<div class="financial-heading"><div><h3>財報趨勢</h3><p>${esc(name)}・年度／季度財務表現</p></div></div><div class="financial-empty">${esc(error.message || "財務資料暫時無法取得")}</div>`;
    }
  }
  async function render() {
    const code = directAsset?.symbol || $("etfSelect")?.value || "", security = directAsset ? "__DIRECT__" : $("securitySelect")?.value || "__ETF__";
    const snapshotRows = rowsFor(code, security), info = securityInfo(code, security), key = `${info.market}|${info.symbol}`;
    renderRequestKey = key; currentRows = snapshotRows; candlePoints = [];
    const name = info.name;
    $("chartTitle").textContent = `${name} ${info.symbol}`;
    if ($("chartQuote")) $("chartQuote").innerHTML = "";
    $("status").textContent = "載入兩年歷史行情…";
    renderPremium(code, security);
    loadPersonalTrades(code, security); renderFinancials(code, security, name);
    try { currentRows = await loadHistory(info, snapshotRows); }
    catch (error) { currentRows = snapshotRows; if (!currentRows.length) $("status").textContent = error.message || "行情資料暫時無法取得"; }
    if (renderRequestKey !== key) return;
    if (window.MarketChart) window.MarketChart.currentRows = currentRows.slice();
    if ($("chartQuote") && currentRows.length) {
      const latest = currentRows.at(-1), previous = currentRows.at(-2), reference = Number.isFinite(Number(latest.prevClose)) ? Number(latest.prevClose) : Number(previous?.close);
      const change = Number.isFinite(Number(latest.change)) ? Number(latest.change) : Number.isFinite(reference) ? Number(latest.close) - reference : null;
      const changePct = Number.isFinite(Number(latest.changePct)) ? Number(latest.changePct) : reference && change != null ? change / reference * 100 : null;
      const tone = change > 0 ? "price-up" : change < 0 ? "price-down" : "";
      const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "";
      $("chartQuote").innerHTML = `<span class="price ${tone}">${price(latest.close)}</span><span class="change ${tone}">${arrow} ${change == null ? "—" : `${change >= 0 ? "+" : ""}${price(change)}`}　${changePct == null ? "—" : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}</span>`;
    }
    $("status").textContent = currentRows.length ? `行情 ${currentRows.length} 日（${currentRows[0].date} ～ ${currentRows.at(-1).date}）` : "尚無完整 OHLC 資料";
    document.dispatchEvent(new CustomEvent("marketchart:datachange", { detail:{ asset:{ ...info }, rows:currentRows.slice() } }));
    if (!currentRows.length) { $("chartBox").innerHTML = '<div class="empty">目前尚無可繪製的完整開高低收資料。</div>'; renderSignal([]); return; }
    if (viewport.key !== key) resetViewport(key); else setViewport(viewport.start, viewport.end);
    drawChart(); renderSignal(currentRows); renderNews(code, security, name);
  }
  function drawChart() {
    if (!currentRows.length) return;
    candlePoints = [];
    const viewStart = Math.max(0, Math.min(viewport.start, currentRows.length - 1));
    const viewEnd = Math.max(viewStart + 1, Math.min(viewport.end || currentRows.length, currentRows.length));
    const rows = currentRows.slice(viewStart, viewEnd);
    const rootStyle = getComputedStyle(document.documentElement);
    const chartColors = {
      accent: rootStyle.getPropertyValue("--accent").trim() || "#3b5bdb",
      ma5: rootStyle.getPropertyValue("--ma5").trim() || "#e9a23b",
      ma10: rootStyle.getPropertyValue("--ma10").trim() || "#45a3d8",
      ma20: rootStyle.getPropertyValue("--ma20").trim() || "#a78bca",
      ma60: rootStyle.getPropertyValue("--ma60").trim() || "#16a085",
      ma120: rootStyle.getPropertyValue("--ma120").trim() || "#e8590c",
      ma240: rootStyle.getPropertyValue("--ma240").trim() || "#868e96",
      vol5: rootStyle.getPropertyValue("--vol5").trim() || "#4c9ffe",
      vol10: rootStyle.getPropertyValue("--vol10").trim() || "#f06595",
      bb: rootStyle.getPropertyValue("--bb").trim() || "#d97706",
      bbMid: rootStyle.getPropertyValue("--bb-mid").trim() || "#b45309",
      macd: rootStyle.getPropertyValue("--macd").trim() || "#7c3aed",
      macdSignal: rootStyle.getPropertyValue("--macd-signal").trim() || "#db2777",
      rsi: rootStyle.getPropertyValue("--rsi").trim() || "#0891b2",
      k: rootStyle.getPropertyValue("--kd-k").trim() || "#19a7a0",
      d: rootStyle.getPropertyValue("--kd-d").trim() || "#e06b8b",
      buy: rootStyle.getPropertyValue("--trade-buy").trim() || "#3977f6",
      sell: rootStyle.getPropertyValue("--trade-sell").trim() || "#ef405f",
      cost: rootStyle.getPropertyValue("--trade-cost").trim() || "#8a63d2"
    };
    const rowDates = new Set(rows.map(row => row.date));
    const visibleTrades = personalTrades.markers.filter(fill => rowDates.has(fill.fill_date) && Number.isFinite(Number(fill.price)) && visibleTradeOverlays.has(fill.side === "buy" ? "buy" : "sell"));
    const referenceValues = visibleTrades.map(fill => Number(fill.price));
    if (visibleTradeOverlays.has("cost") && personalTrades.averageCost != null) referenceValues.push(Number(personalTrades.averageCost));
    const bb = currentRows.map((_, i) => bollingerValues(currentRows, i)).slice(viewStart, viewEnd);
    const macd = macdValues(currentRows).slice(viewStart, viewEnd), rsi = rsiValues(currentRows).slice(viewStart, viewEnd), kd = kdValues(currentRows).slice(viewStart, viewEnd);
    const maSeries = Object.fromEntries(maPeriods.map(period => [period, currentRows.map((_, index) => movingAverage(currentRows, index, period)).slice(viewStart, viewEnd)]));
    const volumeMaSeries = Object.fromEntries(volumeMaPeriods.map(period => [period, currentRows.map((_, index) => volumeMovingAverage(currentRows, index, period)).slice(viewStart, viewEnd)]));
    const indicatorValues = visibleIndicators.has("bollinger") ? bb.flatMap(v => v ? [v.upper, v.lower] : []) : [];
    maPeriods.forEach(period => { if (visibleMas.has(period)) indicatorValues.push(...maSeries[period].filter(Number.isFinite)); });
    const values = (chartType === "line" ? rows.map(r => Number(r.close)) : rows.flatMap(r => [Number(r.low), Number(r.high)])).concat(referenceValues, indicatorValues).filter(Number.isFinite);
    let min = Math.min(...values), max = Math.max(...values); if (min === max) { min -= 1; max += 1; }
    const maxVol = Math.max(...rows.map(r => Number(r.volume) || 0), 1), plotW = W - left - right, priceH = priceBottom - top;
    const panels = [];
    if (visibleIndicators.has("kd")) panels.push({ name:"KD", top:440, height:110 });
    if (visibleIndicators.has("macd")) { const previous = panels.at(-1); panels.push({ name:"MACD", top:previous ? previous.top + previous.height + 28 : 440, height:100 }); }
    if (visibleIndicators.has("rsi")) { const previous = panels.at(-1); panels.push({ name:"RSI", top:previous ? previous.top + previous.height + 28 : 440, height:100 }); }
    const panel = name => panels.find(item => item.name === name), kdPanel = panel("KD"), macdPanel = panel("MACD"), rsiPanel = panel("RSI");
    const lastPanel = panels.at(-1), chartBottom = lastPanel ? lastPanel.top + lastPanel.height : volumeBottom + 32, chartHeight = chartBottom + 42;
    // X 軸使用交易日序號，不把週末／休市日當成空白時間。資料很少時，
    // 讓 K 棒集中在圖中央並保持固定間距；資料變多後才逐步填滿圖寬。
    const slot = Math.min(34, plotW / Math.max(rows.length - 1, 1));
    const contentW = slot * Math.max(rows.length - 1, 0);
    const startX = left + Math.max(0, (plotW - contentW) / 2);
    const x = i => startX + i * slot;
    const y = v => top + (max - v) * priceH / (max - min);
    const vy = v => volumeBottom - (Number(v || 0) / maxVol) * (volumeBottom - volumeTop);
    const ky = v => kdPanel ? kdPanel.top + kdPanel.height - Number(v) / 100 * kdPanel.height : 0;
    const extentY = (value, minValue, maxValue, panelInfo) => panelInfo.top + panelInfo.height - (value - minValue) / (maxValue - minValue || 1) * panelInfo.height;
    const macdFlat = macd.flatMap(v => [v.macd, v.signal]).filter(Number.isFinite), macdMin = Math.min(0, ...macdFlat), macdMax = Math.max(0, ...macdFlat);
    const macdY = value => macdPanel ? extentY(value, macdMin, macdMax, macdPanel) : 0;
    const rsiY = value => rsiPanel ? rsiPanel.top + rsiPanel.height - Number(value) / 100 * rsiPanel.height : 0;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc($("chartTitle").textContent)} ${chartType === "line" ? "收盤價線圖" : "K 線圖"}">`;
    [0, .25, .5, .75, 1].forEach(t => { const yy = top + t * priceH, val = max - t * (max - min); svg += `<line x1="${left}" x2="${W - right}" y1="${yy}" y2="${yy}" class="grid"/><text x="4" y="${yy + 4}" class="axis">${price(val)}</text>`; });
    svg += `<line x1="${left}" x2="${W - right}" y1="${volumeBottom}" y2="${volumeBottom}" class="grid"/>`;
    if (kdPanel) {
      [20,50,80].forEach(v => svg += `<line x1="${left}" x2="${W - right}" y1="${ky(v)}" y2="${ky(v)}" class="grid${v===50?'':' kd-threshold'}"/><text x="24" y="${ky(v)+4}" class="axis">${v}</text>`);
      svg += `<text x="4" y="${kdPanel.top + 12}" class="axis">KD</text>`;
    }
    if (macdPanel) svg += `<line x1="${left}" x2="${W-right}" y1="${macdY(0)}" y2="${macdY(0)}" class="grid kd-threshold"/><text x="4" y="${macdPanel.top + 12}" class="axis">MACD</text>`;
    if (rsiPanel) {
      [30, 50, 70].forEach(value => svg += `<line x1="${left}" x2="${W-right}" y1="${rsiY(value)}" y2="${rsiY(value)}" class="grid${value === 50 ? "" : " kd-threshold"}"/><text x="30" y="${rsiY(value)+4}" class="axis">${value}</text>`);
      svg += `<text x="4" y="${rsiPanel.top + 12}" class="axis">RSI</text>`;
    }
    const tickCount = Math.min(7, rows.length);
    const tickIndexes = [...new Set(Array.from({ length: tickCount }, (_, i) => Math.round(i * (rows.length - 1) / Math.max(1, tickCount - 1))))];
    tickIndexes.forEach(index => {
      svg += `<text x="${x(index)}" y="${chartHeight - 8}" text-anchor="middle" class="axis">${dateLabel(rows[index].date)}</text>`;
    });
    rows.forEach((r, i) => {
      const cx = x(i), candleW = Math.max(2, Math.min(18, plotW / Math.max(rows.length, 1) * .56)), rising = Number(r.close) >= Number(r.open), color = rising ? "var(--up)" : "var(--down)";
      const bodyY = y(Math.max(r.open, r.close)), bodyH = Math.max(1.5, Math.abs(y(r.open) - y(r.close)));
      candlePoints.push({ x:cx, y:chartType === "line" ? y(Number(r.close)) : y((Number(r.open) + Number(r.close)) / 2), date:r.date, row:r });
      if (chartType === "candle") svg += `<line x1="${cx}" x2="${cx}" y1="${y(r.high)}" y2="${y(r.low)}" stroke="${color}" stroke-width="1.5"/><rect x="${cx - candleW / 2}" y="${bodyY}" width="${candleW}" height="${bodyH}" fill="${color}" rx="1"/>`;
      svg += `<rect x="${cx - candleW / 2}" y="${vy(r.volume)}" width="${candleW}" height="${volumeBottom - vy(r.volume)}" fill="${color}" opacity=".35"/>`;
      maPeriods.forEach(period => { const average = maSeries[period][i]; if (visibleMas.has(period) && average != null) svg += `<circle class="ma-point ma${period}-point" cx="${cx}" cy="${y(average)}" r="1.15" fill="${chartColors[`ma${period}`]}"/>`; });
    });
    function volumeLine(period, color, name) { const pts = volumeMaSeries[period].map((value, i) => value == null ? null : `${x(i)},${vy(value)}`).filter(Boolean).join(" "); return pts ? `<polyline class="volume-ma-line ${name}" points="${pts}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>` : ""; }
    volumeMaPeriods.forEach(period => { if (visibleVolumeMas.has(period)) svg += volumeLine(period, chartColors[`vol${period}`], `vol${period}-line`); });
    function line(period, color, name) { const pts = maSeries[period].map((value, i) => value == null ? null : `${x(i)},${y(value)}`).filter(Boolean).join(" "); return pts ? `<polyline class="ma-line ${name}" points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` : ""; }
    if (chartType === "line") {
      const closePoints = rows.map((r, i) => `${x(i)},${y(Number(r.close))}`).join(" ");
      svg += `<polygon points="${x(0)},${priceBottom} ${closePoints} ${x(rows.length-1)},${priceBottom}" fill="${chartColors.accent}" opacity=".09"/><polyline points="${closePoints}" fill="none" stroke="${chartColors.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    maPeriods.forEach(period => { if (visibleMas.has(period)) svg += line(period, chartColors[`ma${period}`], `ma${period}-line`); });
    function indicatorLine(values, key, color, width = 1.5, dash = "") { const points = values.map((value, i) => Number.isFinite(value) ? `${x(i)},${y(value)}` : null).filter(Boolean).join(" "); return points ? `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="round" stroke-linejoin="round"/>` : ""; }
    function screenLine(values, color, width = 1.5, dash = "") { const points = values.map((value, i) => Number.isFinite(value) ? `${x(i)},${value}` : null).filter(Boolean).join(" "); return points ? `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="round" stroke-linejoin="round"/>` : ""; }
    if (visibleIndicators.has("bollinger")) {
      svg += indicatorLine(bb.map(v => v?.upper), "upper", chartColors.bb || "#d97706");
      svg += indicatorLine(bb.map(v => v?.mid), "mid", chartColors.bbMid || "#b45309", 1, "4 3");
      svg += indicatorLine(bb.map(v => v?.lower), "lower", chartColors.bb || "#d97706");
    }
    if (macdPanel) {
      macd.forEach((value, i) => { if (Number.isFinite(value.histogram)) { const zero = macdY(0), barY = macdY(Math.max(0, value.histogram)), barH = Math.max(1, Math.abs(macdY(value.histogram) - zero)), width = Math.max(2, Math.min(16, plotW / Math.max(rows.length, 1) * .52)); svg += `<rect x="${x(i)-width/2}" y="${Math.min(barY, zero)}" width="${width}" height="${barH}" fill="${value.histogram >= 0 ? "var(--up)" : "var(--down)"}" opacity=".55"/>`; } });
      const macdLine = key => macd.map(v => v[key]);
      svg += screenLine(macdLine("macd").map(v => Number.isFinite(v) ? macdY(v) : null), chartColors.macd, 1.8);
      svg += screenLine(macdLine("signal").map(v => Number.isFinite(v) ? macdY(v) : null), chartColors.macdSignal, 1.5);
    }
    if (rsiPanel) svg += screenLine(rsi.map(v => Number.isFinite(v) ? rsiY(v) : null), chartColors.rsi, 1.8);
    if (visibleTradeOverlays.has("cost") && Number.isFinite(personalTrades.averageCost)) svg += `<line x1="${left}" x2="${W-right}" y1="${y(personalTrades.averageCost)}" y2="${y(personalTrades.averageCost)}" stroke="${chartColors.cost}" stroke-width="1.5" stroke-dasharray="7 5"/><text x="${W-right-4}" y="${y(personalTrades.averageCost)-6}" text-anchor="end" fill="${chartColors.cost}" font-size="11">持倉成本 ${price(personalTrades.averageCost)}</text>`;
    visibleTrades.forEach(fill => {
      const index = rows.findIndex(row => row.date === fill.fill_date), cx = x(index), cy = y(Number(fill.price)), buy = fill.side === "buy", color = buy ? chartColors.buy : chartColors.sell;
      const points = buy ? `${cx},${cy-9} ${cx-7},${cy+4} ${cx+7},${cy+4}` : `${cx},${cy+9} ${cx-7},${cy-4} ${cx+7},${cy-4}`;
      svg += `<polygon points="${points}" fill="${color}" stroke="var(--card)" stroke-width="1.5"/><text x="${cx}" y="${buy ? cy+17 : cy-10}" text-anchor="middle" fill="${color}" font-size="10" font-weight="700">${buy ? "買" : "賣"}</text>`;
    });
    if (kdPanel) svg += `<polyline class="kd-line k-line" points="${kd.map((v,i)=>`${x(i)},${ky(v.k)}`).join(" ")}" fill="none" stroke="${chartColors.k}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><polyline class="kd-line d-line" points="${kd.map((v,i)=>`${x(i)},${ky(v.d)}`).join(" ")}" fill="none" stroke="${chartColors.d}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg += `<line id="hoverLine" class="crosshair" x1="${left}" x2="${left}" y1="${top}" y2="${chartBottom}" visibility="hidden"/>`;
    svg += `<line id="hoverHorizontalLine" class="crosshair" x1="${left}" x2="${W-right}" y1="${top}" y2="${top}" visibility="hidden"/>`;
    svg += `<rect id="chartHit" x="${left}" y="${top}" width="${plotW}" height="${chartBottom - top}" fill="transparent" pointer-events="all"/> </svg>`;
    svg = svg.replace(`viewBox="0 0 ${W} ${H}"`, `viewBox="0 0 ${W} ${chartHeight}"`);
    $("chartBox").innerHTML = svg;
    const updateTip = event => {
      if (!tooltipEnabled) return;
      const rect = event.currentTarget.getBoundingClientRect(), position = (event.clientX - rect.left) / rect.width * plotW + left;
      const point = candlePoints.reduce((best, p) => Math.abs(p.x - position) < Math.abs(best.x - position) ? p : best, candlePoints[0]);
      const r = point.row; $("hoverLine").setAttribute("x1", point.x); $("hoverLine").setAttribute("x2", point.x); $("hoverLine").setAttribute("visibility", "visible");
      const chartRect = $("chartBox").getBoundingClientRect(), wrapRect = document.querySelector(".kline-chart-wrap, .chart-wrap").getBoundingClientRect(), tip = $("tip");
      const index = candlePoints.indexOf(point), indicator = kd[index];
      const pointerY = top + ((event.clientY - rect.top) / rect.height) * (chartBottom - top);
      const horizontalLine = $("hoverHorizontalLine");
      horizontalLine.setAttribute("y1", pointerY); horizontalLine.setAttribute("y2", pointerY); horizontalLine.setAttribute("visibility", "visible");
      const zone = rsiPanel && pointerY >= rsiPanel.top ? "rsi"
        : macdPanel && pointerY >= macdPanel.top ? "macd"
        : kdPanel && pointerY >= kdPanel.top ? "kd"
        : "price";
      const dateHtml = `<strong class="tip-date">${esc(r.date)}</strong>`;
      const volumeText = value => value == null || !Number.isFinite(Number(value)) ? "—" : `${Math.round(Number(value)).toLocaleString("en-US")} 股`;
      const priceHtml = `<div class="tip-grid"><span>開 ${price(r.open)}</span><span>高 ${price(r.high)}</span><span>低 ${price(r.low)}</span><span>收 ${price(r.close)}</span><span>量 ${volumeText(r.volume)}　VOL5 ${volumeText(volumeMaSeries[5][index])}　VOL10 ${volumeText(volumeMaSeries[10][index])}</span></div>`;
      const bbHtml = visibleIndicators.has("bollinger") && bb[index] ? `<div class="tip-extra">布林 ${price(bb[index].upper)}／${price(bb[index].mid)}／${price(bb[index].lower)}</div>` : "";
      const kdHtml = visibleIndicators.has("kd") && indicator ? `<div class="tip-extra">K ${price(indicator.k)}　D ${price(indicator.d)}</div>` : "";
      const macdHtml = macd[index]?.macd != null ? `<div class="tip-extra">DIF: ${price(macd[index].macd)}　MACD: ${price(macd[index].signal)}　D-M: ${price(macd[index].histogram)}</div>` : "";
      const rsiHtml = rsi[index] != null ? `<div class="tip-extra">RSI ${price(rsi[index])}</div>` : "";
      tip.innerHTML = zone === "kd" ? dateHtml + kdHtml
        : zone === "macd" ? dateHtml + macdHtml
        : zone === "rsi" ? dateHtml + rsiHtml
        : dateHtml + priceHtml + bbHtml;
      tip.style.visibility = "hidden";
      tip.style.left = "0px";
      tip.style.top = "0px";
      const tipWidth = tip.offsetWidth, tipHeight = tip.offsetHeight;
      const pointX = chartRect.left + point.x / W * chartRect.width;
      const hoverY = chartRect.top + pointerY / chartHeight * chartRect.height;
      let leftPos = pointX - wrapRect.left + 18;
      if (leftPos + tipWidth > wrapRect.width - 8) leftPos = pointX - wrapRect.left - tipWidth - 18;
      let topPos = hoverY - wrapRect.top - tipHeight / 2;
      leftPos = Math.max(8, Math.min(wrapRect.width - tipWidth - 8, leftPos));
      topPos = Math.max(8, Math.min(wrapRect.height - tipHeight - 8, topPos));
      tip.style.left = `${leftPos}px`;
      tip.style.top = `${topPos}px`;
      tip.style.visibility = "visible";
    };
    $("chartHit").addEventListener("pointermove", updateTip);
    $("chartHit").addEventListener("contextmenu", event => { event.preventDefault(); setTooltipEnabled(false); });
    $("chartHit").addEventListener("pointerleave", () => {
      $("hoverLine").setAttribute("visibility", "hidden");
      $("hoverHorizontalLine").setAttribute("visibility", "hidden");
      $("tip").style.visibility = "hidden";
    });
  }
  function zoomChart(factor, ratio) {
    if (currentRows.length < 6) return;
    const span = viewport.end - viewport.start, nextSpan = Math.max(1, Math.min(currentRows.length, span * factor));
    const anchor = viewport.start + span * ratio;
    setViewport(anchor - nextSpan * ratio, anchor + nextSpan * (1 - ratio));
  }
  function initChartInteractions() {
    const box = $("chartBox"), pointers = new Map();
    box.addEventListener("contextmenu", event => { event.preventDefault(); setTooltipEnabled(false); });
    box.addEventListener("wheel", event => {
      if (!currentRows.length) return;
      event.preventDefault();
      const rect = box.getBoundingClientRect(), ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      zoomChart(Math.exp(event.deltaY * .0015), ratio);
    }, { passive:false });
    box.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !currentRows.length) return;
      if (event.pointerType === "mouse") setTooltipEnabled(true);
      pointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
      box.setPointerCapture?.(event.pointerId);
      if (pointers.size === 1) {
        dragState = { pointerId:event.pointerId, x:event.clientX, start:viewport.start, end:viewport.end };
        box.classList.add("dragging");
      } else if (pointers.size === 2) {
        const points = [...pointers.values()], distance = Math.abs(points[0].x - points[1].x);
        pinchState = { distance:Math.max(20, distance), start:viewport.start, end:viewport.end };
        dragState = null;
      }
    });
    box.addEventListener("pointermove", event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
      if (pointers.size === 1 && dragState && dragState.pointerId === event.pointerId) {
        const rect = box.getBoundingClientRect(), span = dragState.end - dragState.start;
        const shift = -(event.clientX - dragState.x) / Math.max(1, rect.width) * span;
        const nextStart = Math.max(0, Math.min(currentRows.length - span, Math.round(dragState.start + shift)));
        viewport.start = nextStart; viewport.end = nextStart + span;
        updateRangeControls(); drawChart();
        return;
      }
      if (pointers.size === 2 && pinchState) {
        const points = [...pointers.values()], distance = Math.max(20, Math.abs(points[0].x - points[1].x));
        const rect = box.getBoundingClientRect(), midpoint = (points[0].x + points[1].x) / 2;
        const ratio = Math.max(0, Math.min(1, (midpoint - rect.left) / rect.width));
        viewport.start = pinchState.start; viewport.end = pinchState.end;
        zoomChart(pinchState.distance / distance, ratio);
      }
    });
    const finishPointer = event => {
      const wasDragging = dragState?.pointerId === event.pointerId;
      pointers.delete(event.pointerId);
      if (wasDragging) {
        const rect = box.getBoundingClientRect(), span = dragState.end - dragState.start;
        const shift = -(event.clientX - dragState.x) / Math.max(1, rect.width) * span;
        if (Math.abs(shift) >= .5) setViewport(dragState.start + shift, dragState.end + shift);
      }
      if (pointers.size < 2) pinchState = null;
      if (!pointers.size) { dragState = null; box.classList.remove("dragging"); }
    };
    box.addEventListener("pointerup", finishPointer);
    box.addEventListener("pointercancel", finishPointer);
  }
  const assetTypeLabel = info => info.assetType === "etf" ? `${info.market === "TW" ? "台灣" : "美國"} ETF` : info.market === "TW" ? "台股" : "美股";
  function catalogMatches(term) {
    const query = term.trim().toLowerCase();
    const scored = catalogAssets.map(asset => {
      const symbol = asset.symbol.toLowerCase(), name = asset.name.toLowerCase();
      let score = query ? (symbol === query ? 0 : symbol.startsWith(query) ? 1 : name.startsWith(query) ? 2 : `${symbol} ${name}`.includes(query) ? 3 : 99) : 4;
      return { asset, score };
    }).filter(item => item.score < 99).sort((a, b) => a.score - b.score || a.asset.symbol.localeCompare(b.asset.symbol)).slice(0, 30);
    return scored.map(item => item.asset);
  }
  function renderAssetResults() {
    const box = $("assetResults"), input = $("assetSearch"); if (!box || !input) return;
    const rows = catalogMatches(input.value);
    box.innerHTML = rows.length ? rows.map(asset => `<button type="button" class="asset-result" role="option" data-market="${esc(asset.market)}" data-symbol="${esc(asset.symbol)}" data-asset-type="${esc(asset.assetType)}"><strong>${esc(asset.symbol)}</strong><span>${esc(asset.name)}</span><small>${esc(assetTypeLabel(asset))}</small></button>`).join("") : '<div class="empty">找不到符合條件的標的。</div>';
    box.classList.add("open");
    box.querySelectorAll(".asset-result").forEach(button => button.addEventListener("click", () => {
      const asset = catalogAssets.find(item => item.market === button.dataset.market && item.symbol === button.dataset.symbol && item.assetType === button.dataset.assetType);
      if (asset) selectDirectAsset(asset);
    }));
  }
  function selectDirectAsset(asset, updateUrl = true) {
    if (!asset) return;
    directAsset = { symbol:String(asset.symbol).toUpperCase(), name:asset.name || asset.symbol, market:String(asset.market).toUpperCase(), assetType:String(asset.assetType || "stock").toLowerCase(), exchange:asset.exchange || "" };
    if (window.MarketChart) { window.MarketChart.currentAsset = { ...directAsset }; window.MarketChart.currentRows = []; window.MarketChart.currentFinancials = null; }
    if ($("assetSearch")) $("assetSearch").value = `${directAsset.symbol} ${directAsset.name}`;
    if ($("assetSelectedMeta")) $("assetSelectedMeta").textContent = `${assetTypeLabel(directAsset)}${directAsset.exchange ? `・${directAsset.exchange}` : ""}`;
    $("assetResults")?.classList.remove("open");
    document.dispatchEvent(new CustomEvent("marketchart:assetchange", { detail:{ asset:{ ...directAsset } } }));
    if (updateUrl) {
      const url = new URL(location.href), currentView = url.searchParams.get("view");
      if (!["overview", "kline", "institutional"].includes(currentView)) url.searchParams.set("view", "kline");
      url.searchParams.set("market", directAsset.market); url.searchParams.set("symbol", directAsset.symbol); history.replaceState(null, "", url);
    }
    render();
  }
  async function initUniversalPicker() {
    const input = $("assetSearch"); if (!input) return;
    try {
      const response = await fetch("trade_assets.json", { cache:"force-cache" }), payload = await response.json();
      catalogAssets = (payload.assets || []).map(asset => ({ symbol:String(asset.symbol || "").toUpperCase(), name:asset.name || asset.symbol, market:String(asset.market || "TW").toUpperCase(), assetType:String(asset.asset_type || "stock").toLowerCase(), exchange:asset.exchange || "" })).filter(asset => asset.symbol);
    } catch (_) { catalogAssets = []; }
    Object.entries(data.etfs || {}).forEach(([symbol, etf]) => {
      if (!catalogAssets.some(asset => asset.market === "TW" && asset.symbol === symbol)) catalogAssets.push({ symbol, name:etf.name || symbol, market:"TW", assetType:"etf", exchange:"TWSE" });
    });
    const params = new URLSearchParams(location.search), wantedMarket = (params.get("market") || "TW").toUpperCase(), wantedSymbol = (params.get("symbol") || "00981A").toUpperCase();
    const initial = catalogAssets.find(asset => asset.market === wantedMarket && asset.symbol === wantedSymbol) || catalogAssets.find(asset => asset.market === "TW" && asset.symbol === "0050") || catalogAssets[0];
    input.addEventListener("focus", () => { input.select(); renderAssetResults(); });
    input.addEventListener("click", () => input.select());
    input.addEventListener("input", renderAssetResults);
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") $("assetResults")?.classList.remove("open");
      if (event.key === "Enter") { event.preventDefault(); const first = catalogMatches(input.value)[0]; if (first) selectDirectAsset(first); }
    });
    document.addEventListener("pointerdown", event => { if (!event.target.closest?.(".asset-picker")) $("assetResults")?.classList.remove("open"); });
    window.MarketChart = { currentAsset:null, currentRows:[], currentFinancials:null, selectAsset: (asset, options = {}) => {
      const normalized = { symbol:String(asset.symbol || "").toUpperCase(), market:String(asset.market || "TW").toUpperCase(), assetType:String(asset.assetType || "stock").toLowerCase(), name:asset.name || asset.symbol };
      const matched = catalogAssets.find(item => item.market === normalized.market && item.symbol === normalized.symbol && item.assetType === normalized.assetType) || normalized;
      selectDirectAsset(matched, options.updateUrl !== false);
    }, selectEtfHolding: (etfCode, security = "__ETF__") => {
      const etfSelect = $("etfSelect"), securitySelect = $("securitySelect");
      if (!etfSelect || !securitySelect || !data.etfs[etfCode]) return;
      directAsset = null; etfSelect.value = etfCode; fillSecurities();
      securitySelect.value = [...securitySelect.options].some(option => option.value === security) ? security : "__ETF__";
      render();
    } };
    if (initial) selectDirectAsset(initial, false);
    document.dispatchEvent(new CustomEvent("marketchart:ready"));
  }
  $("etfSelect")?.addEventListener("change", () => {
    directAsset = null; fillSecurities();
    document.dispatchEvent(new CustomEvent("marketchart:etfchange", { detail:{ symbol:$("etfSelect").value } }));
  });
  $("securitySelect")?.addEventListener("change", render);
  document.querySelectorAll("[data-chart-type]").forEach(button => button.addEventListener("click", () => {
    chartType = button.dataset.chartType;
    localStorage.setItem("etf-chart-type", chartType);
    updateChartType();
    if (currentRows.length) drawChart();
  }));
  document.querySelectorAll("[data-ma-period]").forEach(button => button.addEventListener("click", () => {
    const period = Number(button.dataset.maPeriod);
    visibleMas.has(period) ? visibleMas.delete(period) : visibleMas.add(period);
    localStorage.setItem("etf-visible-mas", JSON.stringify([...visibleMas])); updateMaControls(); if (currentRows.length) drawChart();
  }));
  document.querySelectorAll("[data-volume-ma-period]").forEach(button => button.addEventListener("click", () => {
    const period = Number(button.dataset.volumeMaPeriod);
    visibleVolumeMas.has(period) ? visibleVolumeMas.delete(period) : visibleVolumeMas.add(period);
    localStorage.setItem("etf-visible-volume-mas", JSON.stringify([...visibleVolumeMas])); updateVolumeMaControls(); if (currentRows.length) drawChart();
  }));
  document.querySelectorAll("[data-indicator]").forEach(button => button.addEventListener("click", () => {
    const name = button.dataset.indicator;
    visibleIndicators.has(name) ? visibleIndicators.delete(name) : visibleIndicators.add(name);
    localStorage.setItem("etf-visible-indicators-v2", JSON.stringify([...visibleIndicators]));
    updateIndicatorControls();
    if (currentRows.length) drawChart();
  }));
  document.querySelectorAll("[data-trade-overlay]").forEach(button => button.addEventListener("click", () => {
    const name = button.dataset.tradeOverlay;
    visibleTradeOverlays.has(name) ? visibleTradeOverlays.delete(name) : visibleTradeOverlays.add(name);
    localStorage.setItem("etf-visible-trade-overlays", JSON.stringify([...visibleTradeOverlays]));
    updateTradeOverlayControls();
    if (currentRows.length) drawChart();
  }));
  document.querySelectorAll("[data-range-days]").forEach(button => button.addEventListener("click", () => {
    const days = button.dataset.rangeDays === "all" ? currentRows.length : Number(button.dataset.rangeDays);
    localStorage.setItem("etf-chart-range", String(days));
    setViewport(Math.max(0, currentRows.length - days), currentRows.length, true);
  }));
  $("rangeReset")?.addEventListener("click", () => { resetViewport(viewport.key, defaultRangeDays); drawChart(); });
  $("tooltipToggle")?.addEventListener("click", () => setTooltipEnabled(!tooltipEnabled));
  document.addEventListener("etfwatch:change", () => {
    const code = directAsset?.symbol || $("etfSelect")?.value || "", security = directAsset ? "__DIRECT__" : $("securitySelect")?.value || "__ETF__";
    if (code) loadPersonalTrades(code, security);
  });
  initChartInteractions(); updateChartType(); updateMaControls(); updateVolumeMaControls(); updateIndicatorControls(); updateTradeOverlayControls();
  if ($("etfSelect")) { fillEtfs(); fillSecurities(); }
  if (universalPicker) initUniversalPicker();
})();
