const assert = require('node:assert/strict');
const C = require('../webapp/analysis-core.js');
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
const rows = values => values.map((close,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),close,open:close,high:close,low:close,volume:100}));
const dirty=[{date:'2025-01-02',close:3},{date:'2025-01-01',close:null},{date:'2025-01-02',close:4},{date:'2025-01-03',close:0},{date:'2025-01-04',close:'5'},{date:'2025-01-05',close:Infinity}];
assert.deepEqual(C.clean(dirty),[{date:'2025-01-02',close:4,volume:null}]);
assert.equal(C.finite(null),false);assert.equal(C.finite('2'),false);
assert.deepEqual(C.sma([1,2,3,4],3),[null,null,2,3]);
assert.deepEqual(C.ema([1,2,3,4],3),[null,null,2,3]);
assert.equal(C.rsi(Array(20).fill(100))[19],50);
assert.equal(C.rsi(Array.from({length:30},(_,i)=>i+1))[29],100);
assert.equal(C.rsi(Array.from({length:30},(_,i)=>100-i))[29],0);
// Wilder's published example (first RSI = ~70.4641), independent expected value.
near(C.rsi([44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28])[14],70.46413502109705);
const t=C.indicators(rows(Array(80).fill(100)));
assert.equal(t.rsi[13],null);assert.equal(t.rsi[14],50);
assert.equal(t.ma60[58],null);assert.equal(t.ma60[59],100);
assert.equal(t.bands[18],null);assert.deepEqual(t.bands[19],{upper:100,lower:100});
assert.equal(t.histogram[32],null);assert.equal(t.histogram[33],0);
assert.equal(t.kd[7],null);assert.deepEqual(t.kd[8],{k:50,d:50});
const m=C.metrics(rows([100,120,90,110]));near(m.returnPct,10);near(m.maxDrawdown,-25);near(m.positiveDays,200/3);
assert.deepEqual(m.drawdown.map(x=>Math.round(x)),[0,0,-25,-8]);
assert.equal(C.metrics([]).maxDrawdown,null);assert.equal(C.metrics(rows([100])).returnPct,null);assert.equal(C.metrics(rows([100,100])).volatility,null);
near(C.metrics(rows([100,100,100])).volatility,0);
near(C.metrics(rows([100,110,99])).volatility,Math.sqrt(126)*Math.log(1.1/.9)*100);
const comparison=C.compare([{date:'a',close:100},{date:'b',close:200},{date:'c',close:220}],[{date:'b',close:50},{date:'c',close:55},{date:'d',close:60}]);
assert.equal(comparison.length,2);assert.equal(comparison[0].a,0);assert.equal(comparison[0].b,0);near(comparison[1].a,10);near(comparison[1].b,10);
assert.deepEqual(C.compare(rows([1]),rows([2])),[]);
const month=C.monthly([{date:'2025-01-10',close:80},{date:'2025-01-31',close:100},{date:'2025-02-28',close:110},{date:'2025-04-30',close:200}]);
assert.equal(month[0].value,null);near(month[1].value,10);assert.equal(month[2].value,null);
// Every saved asset must produce finite-or-null indicators and finite risks.
const fs=require('node:fs'), p=require('node:path');let tested=0;
for(const market of ['TW','US','JP','KS']) for(const file of fs.readdirSync(p.join(__dirname,'../webapp/price-history',market))){
 const r=C.clean(JSON.parse(fs.readFileSync(p.join(__dirname,'../webapp/price-history',market,file))).rows),ind=C.indicators(r),met=C.metrics(r);
 for(const key of ['ma20','ma60','rsi','dif','signal','histogram']){assert.equal(ind[key].length,r.length);assert.ok(ind[key].every(v=>v===null||Number.isFinite(v)));}
 assert.ok(met.maxDrawdown===null||(met.maxDrawdown<=0&&met.maxDrawdown>=-100));
 tested++;
}
console.log(`PASS: financial calculation edge cases + ${tested} saved histories`);
