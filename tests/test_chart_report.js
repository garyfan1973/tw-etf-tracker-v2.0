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
console.log('Chart report: fixed sections, ordering, legacy results, cost, rating and escaping passed.');
