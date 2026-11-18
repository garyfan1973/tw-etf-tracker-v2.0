const assert = require('node:assert/strict');
const C = require('../webapp/valuation-river-core.js');

const rows = [
  {date:'2024-01-02',close:100,pe:10,pb:2},
  {date:'2024-01-03',close:120,pe:12,pb:2.4},
  {date:'2024-01-04',close:60,pe:null,pb:1.2},
  {date:'2024-01-05',close:150,pe:15,pb:3},
  {date:'2024-03-01',close:160,pe:16,pb:3.2,gapBefore:true},
];
assert.equal(C.bandValue(rows[0], 'pe', 20),200);
assert.equal(C.bandValue(rows[1], 'pe', 20),200, 'Same reference earnings, different daily ratios');
assert.equal(C.bandValue(rows[0], 'pb', 3),150);
assert.equal(C.bandValue(rows[2], 'pe', 20),null);
assert.equal(C.bandValue({...rows[0],pe:0}, 'pe', 20),null);
assert.equal(C.bandValue({...rows[0],pe:-1}, 'pe', 20),null);
assert.equal(C.bandValue({...rows[0],pe:NaN}, 'pe', 20),null);
assert.deepEqual(C.segments(rows, r=>C.bandValue(r,'pe',20)).map(group=>group.length),[2,1,1]);
assert.deepEqual(C.segments(rows, r=>r.close).map(group=>group.length),[4,1]);
assert.deepEqual(C.parseMultiples('10, 15，20、25 30'),[10,15,20,25,30]);
for (const text of ['0,1,2,3,4','1,1,2,3,4','5,4,3,2,1','1,2,3,4','1,2,3,4,NaN','1,2,3,4,Infinity','1,2,3,4,1e9','1,2,3,4,10001']) assert.equal(C.parseMultiples(text),null,text);
assert.equal(C.quantile([40,10,30,20],.5),25);
assert.equal(C.quantile([],.5),null);
assert.deepEqual(C.defaultMultiples([], 'pe'),[10,15,20,25,30]);
assert.deepEqual(C.defaultMultiples([{pe:10},{pe:10}], 'pe'),[6,8,10,12,14]);
const multiples = C.defaultMultiples(rows,'pe');
assert.equal(multiples.length,5);
assert(multiples.every((m,i)=>m>0&&(!i||m>multiples[i-1])));
assert.deepEqual(C.periodRows([{date:'2022-02-28'},{date:'2023-02-28'},{date:'2024-02-29'}],1),[{date:'2024-02-29'}]);
console.log('Valuation river calculations: passed');
