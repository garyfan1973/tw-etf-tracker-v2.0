const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../webapp/etf-compare-core.js");

test("holding overlap uses the smaller weight of common holdings", () => {
  const result = core.overlap([{ code:"A", weight:40 }, { code:"B", weight:20 }], [{ code:"A", weight:25 }, { code:"C", weight:30 }]);
  assert.equal(result.weight, 25);
  assert.deepEqual([result.commonCount, result.leftOnly, result.rightOnly], [1, 1, 1]);
});

test("return, volatility and drawdown calculations are deterministic", () => {
  const rows = [100, 110, 88, 96.8].map((close, i) => ({ date:`2026-01-0${i + 1}`, close }));
  assert.ok(Math.abs(core.priceReturn(rows, 3) + 3.2) < 1e-9);
  assert.ok(Math.abs(core.totalReturn(rows, [{ exDate:"2026-01-02", amount:2 }], 3) + 1.44) < 1e-9);
  assert.equal(Math.round(core.maxDrawdown(rows, 3) * 10) / 10, -20);
  assert.ok(core.annualVolatility(rows, 3) > 0);
});

test("top concentration and trailing yield handle normalized values", () => {
  assert.equal(core.topConcentration([{weight:8},{weight:4},{weight:2}], 2), 12);
  assert.equal(core.trailingDividendYield([{exDate:"2026-02-01",amount:2},{exDate:"2024-01-01",amount:8}], 100, "2026-08-30"), 2);
});

test("calendar returns, annualization, YTD and dividend frequency use available dates", () => {
  const rows = [
    {date:"2025-01-02",close:100}, {date:"2025-08-30",close:110},
    {date:"2026-01-02",close:120}, {date:"2026-08-30",close:144},
  ];
  assert.ok(Math.abs(core.periodReturn(rows, 365) - 30.9090909091) < 1e-8);
  assert.ok(core.periodReturn(rows, 730, true) > 24 && core.periodReturn(rows, 730, true) < 26);
  assert.ok(Math.abs(core.yearToDateReturn(rows) - 20) < 1e-9);
  assert.equal(core.dividendFrequency([{exDate:"2026-02-01"},{exDate:"2026-05-01"},{exDate:"2024-01-01"}], "2026-08-30"), 2);
});
