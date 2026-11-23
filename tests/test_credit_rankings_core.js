const assert=require('node:assert/strict'),C=require('../webapp/credit-rankings-core.js');
const state={side:'margin',unit:'lots',order:'increase',market:'all',kind:'all',query:''};
const rows=[
 {code:'2330',name:'測試上市',exchange:'TWSE',kind:'stock',marginDeltaLots:10,marginDeltaValue:100000,marginBalanceLots:100,marginBalanceValue:1000000,shortDeltaLots:-5,shortDeltaValue:-50000,shortBalanceLots:20,shortBalanceValue:200000},
 {code:'6488',name:'測試上櫃',exchange:'TPEX',kind:'stock',marginDeltaLots:5,marginDeltaValue:500000,marginBalanceLots:200,marginBalanceValue:2000000,shortDeltaLots:10,shortDeltaValue:100000,shortBalanceLots:50,shortBalanceValue:500000},
 {code:'00981A',name:'測試 ETF',exchange:'TWSE',kind:'etf',marginDeltaLots:-50,marginDeltaValue:-250000,marginBalanceLots:20,marginBalanceValue:100000,shortDeltaLots:0,shortDeltaValue:0,shortBalanceLots:0,shortBalanceValue:0},
 {code:'2317',name:'無報價',exchange:'TWSE',kind:'stock',marginDeltaLots:100,marginDeltaValue:null,marginBalanceLots:200,marginBalanceValue:null,shortDeltaLots:null,shortDeltaValue:null,shortBalanceLots:null,shortBalanceValue:null},
];
const codes=extra=>C.rank(rows,{...state,...extra}).map(r=>r.code);
assert.deepEqual(codes({}),['2317','2330','6488']);
assert.deepEqual(codes({unit:'value'}),['6488','2330'],'money rankings use values, not lots; unpriced rows excluded');
assert.deepEqual(codes({order:'decrease'}),['00981A']);
assert.deepEqual(codes({order:'balance',unit:'value'}),['6488','2330','00981A']);
assert.deepEqual(codes({side:'short'}),['6488']);
assert.deepEqual(codes({side:'short',order:'decrease',unit:'value'}),['2330']);
assert.deepEqual(codes({kind:'etf',order:'decrease',query:'00981'}),['00981A']);
assert.deepEqual(codes({market:'TPEX'}),['6488']);
assert.deepEqual(codes({query:'missing'}),[]);
const p=require('../webapp/price-history/credit-rankings/latest.json');
assert.equal(C.valid(p),true,'published snapshot validates');
assert.equal(C.valid({...p,priceAsOf:'2026-11-19'}),false,'different-day prices cannot be ranked as same-session values');
assert.equal(C.valid({...p,rows:p.rows.filter(r=>r.exchange==='TWSE')}),false,'partial markets cannot masquerade as combined coverage');
assert.equal(C.valid({...p,rows:[...p.rows,p.rows[0]]}),false,'duplicates rejected');
console.log('credit rankings: quantities, estimated values, directions, missing prices, filters and dated coverage passed');
