'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../webapp/academy-content.js'),G=require('../webapp/academy-chart.js'),D=require('../webapp/academy-diagrams.js');
assert.equal(C.lessons.length,60);assert.equal(C.modules.length,12);assert.equal(new Set(C.lessons.map(l=>l.id)).size,60);
for(const m of C.modules)assert.equal(C.lessons.filter(l=>l.module===m.id).length,5);
for(const l of C.lessons){
  for(const field of ['title','explain','method','confirm','invalid','practice'])assert.ok(l[field]?.length>4,`${l.id} ${field}`);
  assert.equal(l.quiz.wrong.length,2);assert.equal(new Set([l.quiz.answer,...l.quiz.wrong]).size,3);
  let count=0;for(let s=0;s<4;s++)for(const v of ['base','fail','range']){
    const d=D.build(l.diagram,s,v);assert.ok(d.rows.length>=10);for(const r of d.rows)assert.ok(r.low<=Math.min(r.open,r.close)&&r.high>=Math.max(r.open,r.close)&&r.low>0);
    if(v==='base'){assert.ok(d.rows.length>=count);count=d.rows.length;}
  }
}
const sample=Array.from({length:80},(_,i)=>({date:new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10),open:100+i,high:103+i,low:99+i,close:102+i,volume:1000+i}));
const tech=G.indicators(sample);assert.equal(tech.ma20[18],null);assert.equal(tech.ma20[19],111.5);assert.equal(tech.rsi[14],100);assert.ok(Math.abs(tech.atr[14]-4)<1e-10);
const flat=G.indicators(sample.map(r=>({...r,open:100,close:100,high:100,low:100})));assert.equal(flat.rsi[14],50);assert.equal(flat.atr[14],0);
// Prefix indicators must not depend on any future values.
for(let n=20;n<80;n+=11){const prefix=G.indicators(sample.slice(0,n));for(const k of Object.keys(prefix))assert.deepEqual(prefix[k],tech[k].slice(0,n));}
const wed=[{date:'2025-01-06',open:100,high:110,low:95,close:105,volume:10},{date:'2025-01-07',open:106,high:112,low:101,close:109,volume:20},{date:'2025-01-08',open:108,high:109,low:90,close:91,volume:30}];
assert.deepEqual(G.weekly(wed),[{date:'2025-01-08',open:100,high:112,low:90,close:91,volume:60,week:'2025-01-06'}]);
assert.equal(G.risk({capital:100000,percent:1,entry:100,stop:95,target:115}).shares,200);
assert.equal(G.risk({capital:100000,percent:1,entry:100,stop:90,target:115}).shares,100);
assert.equal(G.risk({capital:100000,percent:1,entry:100,stop:95,target:115,lot:1000}).shares,0);
assert.equal(G.risk({capital:100000,percent:1,entry:100,stop:105,target:115}),null);
assert.equal(G.risk({capital:100,percent:100,entry:100,stop:90,target:115,cost:1}).shares,0);
const cat=JSON.parse(fs.readFileSync(path.join(__dirname,'../webapp/academy-data/catalog.json')));
assert.equal(cat.cases.length,156);assert.equal(cat.assets.length,24);assert.equal(new Set(cat.cases.map(c=>c.id)).size,156);
const snapshots=new Map();let rowsCount=0;
for(const asset of cat.assets){const h=JSON.parse(fs.readFileSync(path.join(__dirname,`../webapp/academy-data/history/${asset.market}-${asset.symbol}.json`)));const rows=G.unpack(h.rows);rowsCount+=rows.length;assert.ok(rows.length>=4000);assert.equal(rows[0].date,asset.firstDate);assert.equal(rows.at(-1).date,asset.lastDate);
  for(let i=0;i<rows.length;i++){const r=rows[i];assert.ok([r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite));assert.ok(r.low>0&&r.volume>=0&&r.low<=Math.min(r.open,r.close)&&r.high>=Math.max(r.open,r.close));if(i)assert.ok(r.date>rows[i-1].date);}
  snapshots.set(`${asset.market}-${asset.symbol}`,rows);
}
const count={};for(const c of cat.cases){count[c.family]=(count[c.family]||0)+1;const rows=snapshots.get(`${c.market}-${c.symbol}`);assert.ok(c.start<c.at&&c.end===c.at+20&&c.end<rows.length);assert.equal(rows[c.at].date,c.date);assert.equal(rows[c.start].date,c.from);assert.equal(rows[c.end].date,c.to);assert.ok(c.level>0);assert.ok(Math.abs((rows[c.end].close/rows[c.at].close-1)*100-c.return20)<.006);
  assert.equal(c.priorLow,Math.min(...rows.slice(c.at-40,c.at).map(r=>r.low)));assert.equal(c.priorHigh,Math.max(...rows.slice(c.at-40,c.at).map(r=>r.high)));
  for(const a of c.anchors){assert.ok(a.i>=c.start&&a.i<=a.knownAt&&a.knownAt<=c.at);assert.ok(Number.isFinite(a.price));}
  if(c.family==='breakout')assert.ok(rows[c.at].close>c.priorHigh*1.003);
  if(c.family==='failed'){assert.ok(c.anchors.length===1);assert.ok(c.at-c.anchors[0].i<=10);assert.ok(rows[c.at].close<c.level*.997);}
  if(c.family==='volume')assert.ok(c.volumeRatio>2.49);
  const same=cat.cases.filter(x=>x.market===c.market&&x.symbol===c.symbol&&x.id!==c.id);for(const other of same)assert.ok(c.end<other.start||c.start>other.end,`overlap ${c.id} ${other.id}`);
}
for(const [family,n] of Object.entries(count))assert.equal(n,['triangle','wedge','flag','cup','roundbottom','roundtop'].includes(family)?6:10);
for(const family of Object.keys(count))assert.ok(new Set(cat.cases.filter(c=>c.family===family).map(c=>c.outcome)).size>=2,`${family} must have counterexamples`);
console.log(`Academy checks passed: 60 lessons, 720 schematic states, 156 non-overlapping cases, 24 snapshots / ${rowsCount} daily rows; prefix indicators, partial weeks and risk calculations.`);
