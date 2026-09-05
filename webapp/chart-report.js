/* One safe renderer for live results, history and the PDF sent by email. */
(function (root) {
  const labels = ["收盤與均線", "K 線與結構", "KD", "MACD", "成交量", "綜合判讀"];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[c]);
  const text = value => esc(value || "資訊不足，無法判定");
  function render(result, { compact = false } = {}) {
    const r = result || {}, plan = r.tradePlan || {};
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
