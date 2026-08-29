const test = require("node:test");
const assert = require("node:assert/strict");
const { build, holdingKey, lookup } = require("../webapp/etf-holdings-index.js");

const etfs = {
  "0050": {
    name: "元大台灣50",
    snapshots: [{ date: "2026-08-28", holdings: [
      { code: "2330", name: "台積電", market: "TW", weight: 50 },
      { code: "AAPL", name: "Apple", market: "US", weight: 4 },
   ] }],
  },
  "006208": {
    name: "富邦台50",
    snapshots: [{ date: "2026-08-27", holdings: [
      { code: "2317", name: "鴻海", market: "TW", weight: 8 },
      { code: "2330", name: "台積電", market: "TW", weight: 45 },
   ] }],
  },
};

test("同一市場與代號可反查 ETF，並依權重排序", () => {
  const rows = lookup(build(etfs), { code: "2330", market: "TW" });
  assert.deepEqual(rows.map(row => row.symbol), ["0050", "006208"]);
  assert.deepEqual(rows.map(row => row.rank), [1, 1]);
});

test("相同代號但不同市場不會誤配", () => {
  assert.notEqual(holdingKey({ code: "2330", market: "TW" }), holdingKey({ code: "2330", market: "US" }));
  assert.equal(lookup(build(etfs), { code: "AAPL", market: "TW" }).length, 0);
});

test("沒有代號時以標準化名稱比對", () => {
  assert.equal(holdingKey({ name: "  Example   Corp " }), "NAME:example corp");
});
