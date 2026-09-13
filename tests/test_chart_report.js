const assert = require('node:assert/strict');
const report = require('../webapp/chart-report.js');
const result = {
  reportMeta: {schemaVersion: 2, averageCost: 394, costCurrency: 'USD'},
  marketState: '弱勢反彈', conclusion: '<script>alert(1)</script>',
  technicalPoints: [...report.labels].reverse().map(label => ({label, analysis: '測試證據'})),
  keyLevels: [{price: '365–368', meaning: '第一支撐'}], currency: 'USD',
  costAnalysis: '接近壓力區', rating: '⭐⭐⭐☆☆', ratingReason: '趨勢未翻多',
  tradePlan: {holdingAdvice:'觀察支撐', entry:'回測止穩', firstTarget:'373–377', secondTarget:'突破後看390–395', weakening:'跌破360'},
  invalidation:'跌破350', riskNotes:['<img src=x onerror=alert(1)>']
};
const html = report.render(result);
assert.deepEqual([...html.matchAll(/<h3>(.*?)<\/h3>/g)].map(x => x[1]), ['結論','技術面','關鍵價位','操作策略']);
assert(!html.includes('<script>'));
assert(!html.includes('<img src=x'));
assert(html.includes('&lt;script&gt;'));
assert(html.includes('394 USD'));
assert(html.includes('⭐⭐⭐☆☆'));
let last = -1;
for (const label of report.labels) {const next=html.indexOf(`<b>${label}：</b>`); assert(next>last); last=next;}
for (const label of ['已持有','想低接','短線第一目標','突破後情境','反彈轉弱條件','結構失效條件']) assert(html.includes(`<b>${label}：</b>`));
const legacy = report.render({supportZones:['350：前低'], tradePlan:{defense:'失守離場'}, rating:'⭐⭐☆☆☆'});
assert(legacy.includes('350：前低'));
assert(legacy.includes('失守離場'));
assert(legacy.includes('舊紀錄未提供持倉成本分析'));
assert(report.render({...result, rating:'暫不評分（資訊不足）'}).includes('暫不評分（資訊不足）'));
assert.equal((report.render(result, {compact:true}).match(/<h3>/g)||[]).length,1);
const standard = {
  reportMeta: {schemaVersion:3}, imageQualityNote:'圖表資料來自 `chartData`。',
  chart: {symbol:'2345', name:'智邦', market:'TW', date:'2026-09-11', timeframe:'日 K', lastPrice:'100', currency:'TWD'},
  verdict: {overall:'等待確認', state:'區間整理', entryNow:'等待確認', thesis:'以提供的chartData與除息還原後adjustedTechnical為準。', biggestRisk:'rawGapPct 不等於真正跌幅。'},
  technical: {patternAndMA:'MA20 仍向上；operationSignal 顯示觀望。', volume:'priceRows 的量能仍需確認。', indicators:'RSI 與 MACD 未背離。',
    levels:[{kind:'支撐',price:'95',basis:'依 visibleRange 的前低'}]},
  fundamentals: {status:'未查證', asOf:'2026Q2', industry:'contextData 尚無可靠來源 [1]。', earningsCatalysts:'未查證',
    valuationDownside:'未查證', judgment:'未查證', watch:'corporateActions', invalidates:'availabilityNotes 不完整',
    sources:[{title:'官方財報',url:'https://example.com/filing',period:'2026Q2'}]},
  fastTrade: {style:'短線', rewardRisk:'未計算', entry:'96', trigger:'確認支撐', target1:'100', target2:'103', stop:'94', execution:'分批', sizing:'輕倉'},
  strategies:[], closing:{holder:'守住支撐', uninvested:'等待確認', watchlist:['exDate','MA20'], reason:'cash-dividend-back-adjusted 僅用於趨勢。'}
};
const standardHtml = report.render(standard);
for (const term of ['chartData','adjustedTechnical','contextData','operationSignal','priceRows','visibleRange','corporateActions','availabilityNotes','rawGapPct','exDate','cash-dividend-back-adjusted']) {
  assert(!standardHtml.includes(term), term);
}
for (const phrase of ['圖表歷史行情','除息還原後的技術指標','系統操作訊號','除息當日未還原漲跌幅','現金股利除息還原','標的分析 · 台灣市場']) {
  assert(standardHtml.includes(phrase), phrase);
}
assert(standardHtml.includes('RSI 與 MACD'));
assert(standardHtml.includes('href="https://example.com/filing"'));
assert(!report.render(standard, {compact:true}).includes('chartData'));
assert(report.render({...result, thesis:'以 chartData 為準'}).includes('以 圖表歷史行情 為準'));
const cleaned = report.cleanResult({...standard, reportMeta:{promptVersion:'chartData'}, fundamentals:{...standard.fundamentals,
  sources:[{title:'chartData 研究報告',url:'https://example.com/chartData',period:'2026Q2'}]}});
assert.equal(cleaned.verdict.thesis, '以圖表的歷史行情與除息還原後的技術指標為準。');
assert.equal(cleaned.reportMeta.promptVersion, 'chartData');
assert.equal(cleaned.fundamentals.sources[0].url, 'https://example.com/chartData');
assert.equal(standard.verdict.thesis, '以提供的chartData與除息還原後adjustedTechnical為準。');
const citedReport = report.render({...standard,
  imageQualityNote:'圖表與附加行情 JSON 可辨識。',
  verdict:{...standard.verdict, thesis:'營收成長 [1]；未附來源的看法 [2]。'},
  technical:{...standard.technical, indicators:'MACD 尚待確認 [1]。'},
  fastTrade:{...standard.fastTrade, execution:'確認後分批 [1]。'},
  closing:{...standard.closing, watchlist:['留意下季財報 [1]']}
});
assert(!citedReport.includes('JSON'));
assert(citedReport.includes('圖表與行情資料均可辨識'));
assert.equal((citedReport.match(/class="sr-cite"/g) || []).length, 5);
assert(citedReport.includes('（來源連結未提供）'));
assert(!citedReport.includes('[2]'));
assert(citedReport.includes('href="https://example.com/filing"'));
const missingSourceReport = report.render({...standard, fundamentals:{...standard.fundamentals,
  sources:[{title:'待核對資料',url:'http://example.com/insecure',period:'2026Q2'}]}});
assert(!missingSourceReport.includes('[1]'));
assert(missingSourceReport.includes('待核對資料（連結未提供）'));
console.log('Chart report: fixed sections, ordering, legacy results, cost, rating and escaping passed.');
