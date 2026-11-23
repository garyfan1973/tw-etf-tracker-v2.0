const assert=require('node:assert/strict'),C=require('../webapp/market-rankings-core.js');
const rows=[
  {code:'2330',name:'台積電',exchange:'TWSE',kind:'stock',volume:1000,changePct:2,spread:10,close:1000,turnover:1000000},
  {code:'00981A',name:'主動 ETF',exchange:'TWSE',kind:'etf',volume:500000,changePct:-3,spread:.5,close:10,turnover:5000000},
  {code:'6488',name:'環球晶',exchange:'TPEX',kind:'stock',volume:8000,changePct:-9,spread:20,close:500,turnover:4000000},
  {code:'00679B',name:'除息 ETF',exchange:'TPEX',kind:'etf',volume:500000,changePct:null,spread:.3,close:30,turnover:15000000},
  {code:'2454',name:'聯發科',exchange:'TWSE',kind:'stock',volume:0,changePct:0,spread:0,close:1200,turnover:0},
];
const state={metric:'volume',market:'all',kind:'all',query:''};
const codes=metric=>C.rank(rows,{...state,metric}).map(row=>row.code);
assert.deepEqual(codes('volume'),['00679B','00981A','6488','2330','2454'],'volume sorts numerically with deterministic ties');
assert.deepEqual(codes('gain'),['2330'],'gains exclude negative, flat and unknown changes');
assert.deepEqual(codes('loss'),['6488','00981A'],'losses use most negative percentage first');
assert.equal(codes('spread')[0],'6488');assert.equal(codes('price')[0],'2454');assert.equal(codes('turnover')[0],'00679B');
assert.deepEqual(C.rank(rows,{...state,market:'TPEX'}).map(row=>row.code),['00679B','6488']);
assert.deepEqual(C.rank(rows,{...state,kind:'etf',query:'主動'}).map(row=>row.code),['00981A']);
assert.equal(C.rank(rows,{...state,query:'not-found'}).length,0);
assert.equal(C.rank([{...rows[0],volume:null},{...rows[1],volume:NaN}],state).length,0,'missing values never become zero');
assert.equal(C.valid({schemaVersion:1,quoteType:'officialClose',asOf:'2026-11-20',rows}),true);
assert.equal(C.valid({schemaVersion:1,quoteType:'officialClose',asOf:'2026-11-20',rows:rows.filter(row=>row.exchange==='TWSE')}),false,'partial-market data cannot masquerade as combined coverage');
console.log('market rankings: six sort modes, market/type/search filters, missing values and complete-session contract passed');
const live={schemaVersion:1,quoteType:'intradaySnapshot',asOf:'2026-11-23',sourceTime:'2026-11-23T12:00:00+08:00',metric:'volume',market:'TPEX',rankingScope:'providerTop100',sourceRows:1,rows:[{...rows[2],sourceRank:1}]};
assert.equal(C.valid(live),true,'a provider-ranked OTC list is valid without listed rows');
assert.equal(C.matches(live,{mode:'live',metric:'volume',market:'all'}),false,'OTC snapshot cannot answer a combined-market request');
assert.equal(C.matches(live,{mode:'live',metric:'price',market:'TPEX'}),false,'volume leaders cannot substitute for price leaders');
assert.equal(C.matches(live,{mode:'close',metric:'volume',market:'TPEX'}),false);
assert.equal(C.valid({...live,sourceTime:'unknown'}),false);
assert.equal(C.older({...live,sourceTime:'2026-11-23T11:59:00+08:00'},live),true,'old cached snapshots never replace fresher quotes');
assert.equal(C.older({quoteType:'officialClose',asOf:'2026-11-20'},live),false,'a labeled closing fallback is allowed');
assert.deepEqual(C.rank([{...rows[0],sourceRank:2},{...rows[1],sourceRank:1}],{...state,mode:'live'}).map(r=>r.sourceRank),[1,2],'preserve authoritative provider ranking');
console.log('intraday rankings: scoped lists, source times, cache regression protection and provider ordering passed');
