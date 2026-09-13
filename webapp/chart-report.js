/* One safe renderer for live results, history and the PDF sent by email. */
(function (root) {
  const labels = ["收盤與均線", "K 線與結構", "KD", "MACD", "成交量", "綜合判讀"];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[c]);
  // Model prose from both new and saved reports can echo names from the input JSON.
  const internalTerms = {
    chartData: "圖表歷史行情", contextData: "補充市場資料", adjustedTechnical: "除息還原後的技術指標",
    operationSignal: "系統操作訊號", priceRows: "歷史價格資料", indicatorRows: "技術指標資料",
    visibleRange: "圖表顯示區間", startDate: "起始日期", endDate: "結束日期",
    visibleMas: "圖中均線", visibleVolumeMas: "圖中均量線", visibleIndicators: "圖中技術指標",
    truncated: "部分行情未提供", corporateActions: "除息等公司行動", availabilityNotes: "資料取得狀況",
    recentAdjustedRows: "近期除息還原行情", cashDividendBackAdjusted: "現金股利除息還原",
    "cash-dividend-back-adjusted": "現金股利除息還原", rawGapPct: "除息當日未還原漲跌幅",
    dividendAdjustedReturnPct: "計入現金股利後的報酬率", backAdjustmentFactor: "除息還原係數",
    priorClose: "除息前收盤價", exDateClose: "除息日收盤價", exDate: "除息日", payDate: "股利發放日",
    asOfDate: "資料截至日期", latestDate: "最近交易日", latestClose: "最近收盤價",
    positionStatus: "持股狀態", averageCost: "持股均價", costCurrency: "成本幣別",
    screenshotTiming: "截圖時段", proposedPrice: "預計買進價", capturedAt: "圖表擷取時間",
    suppliedRows: "提供的交易日數", totalRows: "圖表交易日數", assetType: "標的類型",
    dataType: "資料性質", "official-end-of-session": "官方盤後資料", generatedAt: "資料產生時間",
    txFrontMonth: "臺股期貨近月契約", putCall: "選擇權賣買權比",
    volumeRatio: "成交量賣買權比", openInterestRatio: "未平倉量賣買權比",
    tradingNet: "法人交易淨額", openInterestLong: "多方未平倉量",
    openInterestShort: "空方未平倉量", openInterestNet: "未平倉淨額",
    taiwanFutures: "台指期市場資料", institutionalDaily: "法人每日買賣超",
    marginDaily: "融資券每日資料", shareholderDistribution: "股東持股分布",
    imageData: "上傳線圖", imageQualityNote: "圖表辨識說明", reportMeta: "報告資料",
    lastPrice: "圖表最新價格", entryNow: "目前進場判斷", biggestRisk: "主要風險",
    patternAndMA: "型態與均線", earningsCatalysts: "營收動能與催化因素",
    valuationDownside: "評價與下檔風險", fastTrade: "短線交易策略",
    rewardRisk: "報酬風險比", entryExit: "進出場條件", riskControl: "風險控管",
    marketState: "市場趨勢", technicalPoints: "技術面重點", supportZones: "支撐區",
    resistanceZones: "壓力區", keyLevels: "關鍵價位", costAnalysis: "持倉成本分析",
    tradePlan: "交易計畫", ratingReason: "評估理由", riskNotes: "風險提醒",
    firstTarget: "第一目標價", secondTarget: "第二目標價", strongResistance: "主要壓力",
    positionSizing: "部位控管", holdingAdvice: "持股建議", promptVersion: "分析規範版本",
    schemaVersion: "報告格式版本", promptHash: "分析規範識別碼", inputHash: "輸入資料識別碼",
    basis: "價格基準", bbUpper: "布林通道上軌", bbMid: "布林通道中軌", bbLower: "布林通道下軌",
    ma5: "MA5", ma10: "MA10", ma20: "MA20", ma60: "MA60", ma120: "MA120", ma240: "MA240",
    williams14: "威廉指標（14 日）", rsi5: "RSI（5 日）", rsi10: "RSI（10 日）",
    vol5: "5 日均量", vol10: "10 日均量"
  };
  const internalTermPattern = new RegExp('([`"]?)\\b(' + Object.keys(internalTerms).sort((a, b) => b.length - a.length).join('|') + ')\\b\\1([=:]?)', 'g');
  const prose = value => String(value ?? "")
    .replace(/除息還原後(?:的)?\s*[`"]?adjustedTechnical[`"]?/g, "除息還原後的技術指標")
    .replace(/提供的\s*[`"]?chartData[`"]?/g, "圖表的歷史行情")
    .replace(internalTermPattern, (_, quote, term, suffix) => internalTerms[term] + (suffix ? "：" : ""))
    .replace(/圖表與附加行情\s*JSON\s*可辨識/gi, "圖表與行情資料均可辨識")
    .replace(/\bJSON\b/gi, "資料")
    .replace(/(行情|資料)\s*資料/g, (_, preceding) => preceding === "資料" ? "資料" : "行情資料")
    .replace(/\bAPI\b/g, "分析服務")
    .replace(/\bschema\b/gi, "報告格式")
    .replace(/\bpayload\b/gi, "輸入資料")
    .replace(/交易價位(?:仍採|使用)未調整價格/g, "進出場與風險控管價位以實際報價為準");
  const text = value => esc(prose(value || "資訊不足，無法判定"));
  const cleanResult = (value, key = "") => {
    if (key === "url" || key === "reportMeta") return value;
    if (Array.isArray(value)) return value.map(item => cleanResult(item));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, cleanResult(item, name)]));
    return typeof value === "string" ? prose(value) : value;
  };
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
    const cited = value => esc(prose(value || "圖中未顯示／無法辨識")).replace(/\[(\d+)\]/g, (match, number) => {
      const source = sources[Number(number) - 1], url = safeUrl(source?.url);
      return url ? `<a class="sr-cite" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="來源 ${number}：${text(source.title)}">[${number}]</a>`
        : `<span class="sr-cite-missing" title="這項資料未附可點選的查證來源">（來源連結未提供）</span>`;
    });
    const field = (label, value) => `<div class="sr-field"><span>${label}</span><p>${cited(value)}</p></div>`;
    const section = (number, title, subtitle, content) => `<section class="sr-section"><header class="sr-section-head"><span class="sr-index">${number}</span><div><h3>${title}</h3><p>${subtitle}</p></div></header>${content}</section>`;
    const marketName = {TW: "台灣市場", US: "美國市場", FX: "外匯市場", INDEX: "指數市場"}[chart.market] || chart.market || "市場未辨識";
    const hero = `<header class="sr-hero"><div class="sr-hero-top"><span class="sr-eyebrow">標的分析 · ${esc(marketName)}</span><span class="sr-overall">${cited(verdict.overall)}</span></div><h2>${text(chart.symbol)} <span>${esc(chart.name || "")}</span></h2><div class="sr-meta"><span>${text(chart.date)}</span><span>${text(chart.timeframe)}</span><span>${text(chart.lastPrice)} ${esc(chart.currency || "")}</span></div><p class="sr-verdict">${cited(verdict.state)} · ${cited(verdict.entryNow)}</p><p class="sr-thesis">${cited(verdict.thesis)}</p><div class="sr-risk-banner"><b>最大風險</b><span>${cited(verdict.biggestRisk)}</span></div></header>`;
    if (compact) return `<div class="cr-report sr-report">${hero}</div>`;
    const levelRows = (technical.levels || []).map(item => `<tr><td><span class="sr-level-type sr-${item.kind === "支撐" ? "support" : item.kind === "壓力" ? "resistance" : "invalid"}">${esc(item.kind)}</span></td><td><b>${cited(item.price)}</b></td><td>${cited(item.basis)}</td></tr>`).join("") || `<tr><td colspan="3">圖中沒有足夠依據確認價位</td></tr>`;
    const technicalHtml = `<div class="sr-grid">${field("型態與均線架構", technical.patternAndMA)}${field("成交量能", technical.volume)}${field("指標訊號", technical.indicators)}</div><div class="sr-table-wrap"><table class="sr-table sr-level-table"><thead><tr><th>類型</th><th>價位（${esc(chart.currency || "未提供")}）</th><th>區域意義與依據</th></tr></thead><tbody>${levelRows}</tbody></table></div>`;
    const sourceHtml = sources.length ? `<div class="sr-sources"><b>資料來源</b><ol>${sources.map((source, index) => {
      const url = safeUrl(source.url);
      return `<li>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">[${index + 1}] ${text(source.title)}</a>` : `${text(source.title)}（連結未提供）`}<span>${text(source.period || "期間未註明")}</span></li>`;
    }).join("")}</ol></div>` : "";
    const fundamentalHtml = `<div class="sr-fund-status"><span>${text(fundamental.status)}</span><span>資料期間：${text(fundamental.asOf)}</span></div><div class="sr-grid sr-fund-grid"><div class="sr-field"><span>產業週期與供需</span><p>${cited(fundamental.industry)}</p></div><div class="sr-field"><span>營收動能與催化劑</span><p>${cited(fundamental.earningsCatalysts)}</p></div><div class="sr-field"><span>評價與下檔支撐</span><p>${cited(fundamental.valuationDownside)}</p></div></div><div class="sr-judgment"><b>基本面判斷：${cited(fundamental.judgment)}</b><p>追蹤 ${cited(fundamental.watch)}<br>失效 ${cited(fundamental.invalidates)}</p></div>${sourceHtml}`;
    const fastHtml = `<div class="sr-fast-head"><span>${cited(fast.style)}</span><b>${cited(fast.rewardRisk)}</b></div><div class="sr-fast-grid">${field("進場價區", fast.entry)}${field("確認條件", fast.trigger)}${field("第一獲利點", fast.target1)}${field("第二獲利點", fast.target2)}${field("防守停損", fast.stop)}${field("執行方式", fast.execution)}</div><p class="sr-size"><b>部位與追價：</b>${cited(fast.sizing)}</p>`;
    const strategyRows = (r.strategies || []).map(row => `<tr><th scope="row">${text(row.horizon)}</th><td>${cited(row.approach)}</td><td>${cited(row.entryExit)}</td><td>${cited(row.riskControl)}</td></tr>`).join("");
    const strategiesHtml = `<div class="sr-subhead"><h4>短中長期操作總結</h4><p>各週期各有失效條件，短單不自動轉為長抱。</p></div><div class="sr-table-wrap"><table class="sr-table sr-strategy-table"><thead><tr><th>週期</th><th>策略方針</th><th>進出場點位參考</th><th>風險控管</th></tr></thead><tbody>${strategyRows}</tbody></table></div><div class="sr-closing"><div><b>持股者</b><p>${cited(closing.holder)}</p></div><div><b>空手者</b><p>${cited(closing.uninvested)}</p></div></div><div class="sr-watch"><b>追蹤清單</b><ul>${(closing.watchlist || []).map(item => `<li>${cited(item)}</li>`).join("")}</ul></div><div class="sr-final"><b>${cited(verdict.overall)}</b><span>${cited(closing.reason)}</span></div>`;
    const quality = r.imageQualityNote ? `<p class="sr-quality">${cited(r.imageQualityNote)}</p>` : "";
    return `<div class="cr-report sr-report">${hero}${quality}${section("01", "技術面現況診斷", "先看價格結構，再用量能與指標確認。", technicalHtml)}${section("02", "基本面與產業重點", "事實、資料期間與查證來源分開呈現。", fundamentalHtml)}${section("03", "快閃／短中長操作策略", "條件、價位與風險控管一起看。", fastHtml + strategiesHtml)}</div>`;
  }
  function render(result, { compact = false } = {}) {
    const r = result || {}, plan = r.tradePlan || {};
    if (r.reportMeta?.schemaVersion === 3 || r.chart && r.verdict && r.strategies) return renderStandard(r, {compact});
    const modern = r.reportMeta?.schemaVersion === 2 || Array.isArray(r.keyLevels);
    const section = (title, content) => `<section class="cr-section"><h3>${title}</h3>${content}</section>`;
    let output = section("結論", `<span class="cr-state">${text(r.marketState)}</span><p class="cr-conclusion">${text(r.conclusion)}</p>${r.thesis ? `<p>${text(r.thesis)}</p>` : ""}`);
    if (compact) return `<div class="cr-report">${output}</div>`;
    if (r.imageQualityNote) output += `<p class="cr-quality">${text(r.imageQualityNote)}</p>`;
    const points = Array.isArray(r.technicalPoints) ? r.technicalPoints : [];
    const ordered = modern ? labels.map(label => points.find(p => p.label === label) || {label, analysis:"資訊不足，無法判定"}) : points;
    output += section("技術面", `<ul class="cr-points">${ordered.map(p => `<li><b>${text(p.label)}：</b>${text(p.analysis)}</li>`).join("") || "<li>舊紀錄未提供技術判讀</li>"}</ul>`);
    const levels = modern ? r.keyLevels : [
      ...(r.supportZones || []).map(v => ({price:"支撐區", meaning:v})),
      ...(r.resistanceZones || []).map(v => ({price:"壓力區", meaning:v}))
    ];
    const rows = levels?.length ? levels : [{price:"無法判定", meaning:"缺少可確認的價格依據"}];
    const meta = r.reportMeta || {};
    const costInput = meta.averageCost != null ? `輸入成本：${esc(meta.averageCost)} ${esc(meta.costCurrency)}。` : "";
    const cost = r.costAnalysis || (modern ? "未提供，以下以一般情境分析。" : "舊紀錄未提供持倉成本分析。");
    output += section("關鍵價位", `<table class="cr-levels"><thead><tr><th scope="col">價位（${esc(r.currency || "幣別未提供")}）</th><th scope="col">區域意義與依據</th></tr></thead><tbody>${rows.map(row => `<tr><td>${text(row.price)}</td><td>${text(row.meaning)}</td></tr>`).join("")}</tbody></table><p class="cr-cost"><b>持倉成本：</b>${costInput}${text(cost)}</p>`);
    const strategies = modern ? [
      ["已持有", plan.holdingAdvice], ["想低接", plan.entry], ["短線第一目標", plan.firstTarget],
      ["突破後情境", plan.secondTarget], ["反彈轉弱條件", plan.weakening], ["結構失效條件", r.invalidation]
    ] : [["進場條件", plan.entry], ["防守／停損", plan.defense], ["第一目標", plan.firstTarget],
      ["第二目標", plan.secondTarget], ["強壓位置", plan.strongResistance], ["部位建議", plan.positionSizing], ["結構失效條件", r.invalidation]];
    output += section("操作策略", `<ul>${strategies.map(([label, value]) => `<li><b>${label}：</b>${text(value)}</li>`).join("")}</ul>${modern && plan.positionSizing ? `<p><b>部位與風險：</b>${text(plan.positionSizing)}</p>` : ""}${r.riskNotes?.length ? `<p class="cr-risk"><b>風險提醒：</b>${r.riskNotes.map(text).join("；")}</p>` : ""}`);
    output += `<div class="cr-rating"><b>評分：${text(r.rating || "舊紀錄未提供評分")}</b>${r.ratingReason ? `<p>${text(r.ratingReason)}</p>` : ""}<small>短線偏多技術條件評估，不代表獲利機率。</small></div>`;
    return `<div class="cr-report">${output}</div>`;
  }
  const api = {render, labels, cleanResult};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChartReport = api;
})(typeof window !== "undefined" ? window : globalThis);
