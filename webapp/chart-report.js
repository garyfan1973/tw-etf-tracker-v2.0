/* One safe renderer for live results, history and the PDF sent by email. */
(function (root) {
  const labels = ["收盤與均線", "K 線與結構", "KD", "MACD", "成交量", "綜合判讀"];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[c]);
  const text = value => esc(value || "資訊不足，無法判定");
  const safeUrl = value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  };
  function renderStandard(result, { compact = false } = {}) {
    const r = result || {}, chart = r.chart || {}, verdict = r.verdict || {}, technical = r.technical || {};
    const fundamental = r.fundamentals || {}, fast = r.fastTrade || {}, closing = r.closing || {};
    const sources = Array.isArray(fundamental.sources) ? fundamental.sources : [];
    const cited = value => esc(value || "圖中未顯示／無法辨識").replace(/\[(\d+)\]/g, (match, number) => {
      const source = sources[Number(number) - 1], url = safeUrl(source?.url);
      return url ? `<a class="sr-cite" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="來源 ${number}：${esc(source.title)}">[${number}]</a>` : match;
    });
    const field = (label, value) => `<div class="sr-field"><span>${label}</span><p>${text(value)}</p></div>`;
    const section = (number, title, subtitle, content) => `<section class="sr-section"><header class="sr-section-head"><span class="sr-index">${number}</span><div><h3>${title}</h3><p>${subtitle}</p></div></header>${content}</section>`;
    const hero = `<header class="sr-hero"><div class="sr-hero-top"><span class="sr-eyebrow">STOCK ANALYSIS · ${esc(chart.market || "市場未辨識")}</span><span class="sr-overall">${text(verdict.overall)}</span></div><h2>${text(chart.symbol)} <span>${esc(chart.name || "")}</span></h2><div class="sr-meta"><span>${text(chart.date)}</span><span>${text(chart.timeframe)}</span><span>${text(chart.lastPrice)} ${esc(chart.currency || "")}</span></div><p class="sr-verdict">${text(verdict.state)} · ${text(verdict.entryNow)}</p><p class="sr-thesis">${text(verdict.thesis)}</p><div class="sr-risk-banner"><b>最大風險</b><span>${text(verdict.biggestRisk)}</span></div></header>`;
    if (compact) return `<div class="cr-report sr-report">${hero}</div>`;
    const levelRows = (technical.levels || []).map(item => `<tr><td><span class="sr-level-type sr-${item.kind === "支撐" ? "support" : item.kind === "壓力" ? "resistance" : "invalid"}">${esc(item.kind)}</span></td><td><b>${text(item.price)}</b></td><td>${text(item.basis)}</td></tr>`).join("") || `<tr><td colspan="3">圖中沒有足夠依據確認價位</td></tr>`;
    const technicalHtml = `<div class="sr-grid">${field("型態與均線架構", technical.patternAndMA)}${field("成交量能", technical.volume)}${field("指標訊號", technical.indicators)}</div><div class="sr-table-wrap"><table class="sr-table sr-level-table"><thead><tr><th>類型</th><th>價位（${esc(chart.currency || "未提供")}）</th><th>區域意義與依據</th></tr></thead><tbody>${levelRows}</tbody></table></div>`;
    const sourceHtml = sources.length ? `<div class="sr-sources"><b>資料來源</b><ol>${sources.map((source, index) => {
      const url = safeUrl(source.url);
      return `<li>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">[${index + 1}] ${text(source.title)}</a>` : `[${index + 1}] ${text(source.title)}`}<span>${esc(source.period || "期間未註明")}</span></li>`;
    }).join("")}</ol></div>` : "";
    const fundamentalHtml = `<div class="sr-fund-status"><span>${text(fundamental.status)}</span><span>資料期間：${text(fundamental.asOf)}</span></div><div class="sr-grid sr-fund-grid"><div class="sr-field"><span>產業週期與供需</span><p>${cited(fundamental.industry)}</p></div><div class="sr-field"><span>營收動能與催化劑</span><p>${cited(fundamental.earningsCatalysts)}</p></div><div class="sr-field"><span>評價與下檔支撐</span><p>${cited(fundamental.valuationDownside)}</p></div></div><div class="sr-judgment"><b>基本面判斷：${text(fundamental.judgment)}</b><p>追蹤 ${text(fundamental.watch)}<br>失效 ${text(fundamental.invalidates)}</p></div>${sourceHtml}`;
    const fastHtml = `<div class="sr-fast-head"><span>${text(fast.style)}</span><b>${text(fast.rewardRisk)}</b></div><div class="sr-fast-grid">${field("進場價區", fast.entry)}${field("確認條件", fast.trigger)}${field("第一獲利點", fast.target1)}${field("第二獲利點", fast.target2)}${field("防守停損", fast.stop)}${field("執行方式", fast.execution)}</div><p class="sr-size"><b>部位與追價：</b>${text(fast.sizing)}</p>`;
    const strategyRows = (r.strategies || []).map(row => `<tr><th scope="row">${text(row.horizon)}</th><td>${text(row.approach)}</td><td>${text(row.entryExit)}</td><td>${text(row.riskControl)}</td></tr>`).join("");
    const strategiesHtml = `<div class="sr-subhead"><h4>短中長期操作總結</h4><p>各週期各有失效條件，短單不自動轉為長抱。</p></div><div class="sr-table-wrap"><table class="sr-table sr-strategy-table"><thead><tr><th>週期</th><th>策略方針</th><th>進出場點位參考</th><th>風險控管</th></tr></thead><tbody>${strategyRows}</tbody></table></div><div class="sr-closing"><div><b>持股者</b><p>${text(closing.holder)}</p></div><div><b>空手者</b><p>${text(closing.uninvested)}</p></div></div><div class="sr-watch"><b>追蹤清單</b><ul>${(closing.watchlist || []).map(item => `<li>${text(item)}</li>`).join("")}</ul></div><div class="sr-final"><b>${text(verdict.overall)}</b><span>${text(closing.reason)}</span></div>`;
    const quality = r.imageQualityNote ? `<p class="sr-quality">${esc(r.imageQualityNote)}</p>` : "";
    return `<div class="cr-report sr-report">${hero}${quality}${section("01", "技術面現況診斷", "先看價格結構，再用量能與指標確認。", technicalHtml)}${section("02", "基本面與產業重點", "事實、資料期間與查證來源分開呈現。", fundamentalHtml)}${section("03", "快閃／短中長操作策略", "條件、價位與風險控管一起看。", fastHtml + strategiesHtml)}</div>`;
  }
  function render(result, { compact = false } = {}) {
    const r = result || {}, plan = r.tradePlan || {};
    if (r.reportMeta?.schemaVersion === 3 || r.chart && r.verdict && r.strategies) return renderStandard(r, {compact});
    const modern = r.reportMeta?.schemaVersion === 2 || Array.isArray(r.keyLevels);
    const section = (title, content) => `<section class="cr-section"><h3>${title}</h3>${content}</section>`;
    let output = section("結論", `<span class="cr-state">${text(r.marketState)}</span><p class="cr-conclusion">${text(r.conclusion)}</p>${r.thesis ? `<p>${esc(r.thesis)}</p>` : ""}`);
    if (compact) return `<div class="cr-report">${output}</div>`;
    if (r.imageQualityNote) output += `<p class="cr-quality">${esc(r.imageQualityNote)}</p>`;
    const points = Array.isArray(r.technicalPoints) ? r.technicalPoints : [];
    const ordered = modern ? labels.map(label => points.find(p => p.label === label) || {label, analysis:"資訊不足，無法判定"}) : points;
    output += section("技術面", `<ul class="cr-points">${ordered.map(p => `<li><b>${esc(p.label)}：</b>${text(p.analysis)}</li>`).join("") || "<li>舊紀錄未提供技術判讀</li>"}</ul>`);
    const levels = modern ? r.keyLevels : [
      ...(r.supportZones || []).map(v => ({price:"支撐區", meaning:v})),
      ...(r.resistanceZones || []).map(v => ({price:"壓力區", meaning:v}))
    ];
    const rows = levels?.length ? levels : [{price:"無法判定", meaning:"缺少可確認的價格依據"}];
    const meta = r.reportMeta || {};
    const costInput = meta.averageCost != null ? `輸入成本：${esc(meta.averageCost)} ${esc(meta.costCurrency)}。` : "";
    const cost = r.costAnalysis || (modern ? "未提供，以下以一般情境分析。" : "舊紀錄未提供持倉成本分析。");
    output += section("關鍵價位", `<table class="cr-levels"><thead><tr><th scope="col">價位（${esc(r.currency || "幣別未提供")}）</th><th scope="col">區域意義與依據</th></tr></thead><tbody>${rows.map(row => `<tr><td>${text(row.price)}</td><td>${text(row.meaning)}</td></tr>`).join("")}</tbody></table><p class="cr-cost"><b>持倉成本：</b>${costInput}${esc(cost)}</p>`);
    const strategies = modern ? [
      ["已持有", plan.holdingAdvice], ["想低接", plan.entry], ["短線第一目標", plan.firstTarget],
      ["突破後情境", plan.secondTarget], ["反彈轉弱條件", plan.weakening], ["結構失效條件", r.invalidation]
    ] : [["進場條件", plan.entry], ["防守／停損", plan.defense], ["第一目標", plan.firstTarget],
      ["第二目標", plan.secondTarget], ["強壓位置", plan.strongResistance], ["部位建議", plan.positionSizing], ["結構失效條件", r.invalidation]];
    output += section("操作策略", `<ul>${strategies.map(([label, value]) => `<li><b>${label}：</b>${text(value)}</li>`).join("")}</ul>${modern && plan.positionSizing ? `<p><b>部位與風險：</b>${esc(plan.positionSizing)}</p>` : ""}${r.riskNotes?.length ? `<p class="cr-risk"><b>風險提醒：</b>${r.riskNotes.map(esc).join("；")}</p>` : ""}`);
    output += `<div class="cr-rating"><b>評分：${esc(r.rating || "舊紀錄未提供評分")}</b>${r.ratingReason ? `<p>${esc(r.ratingReason)}</p>` : ""}<small>短線偏多技術條件評估，不代表獲利機率。</small></div>`;
    return `<div class="cr-report">${output}</div>`;
  }
  const api = {render, labels};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChartReport = api;
})(typeof window !== "undefined" ? window : globalThis);
