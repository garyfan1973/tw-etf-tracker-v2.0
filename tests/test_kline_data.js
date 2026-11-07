const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../webapp/technical-chart-core.js");

test("canonical history overrides contaminated ETF snapshot OHLC", () => {
  const history = [{ date:"2026-08-03", open:298.5, high:320.5, low:298.5, close:311, volume:18250000 }];
  const snapshots = [
    { date:"2026-08-03", open:555, high:564, low:530, close:530, volume:24059926, quoteDate:"2026-08-03" },
    { date:"2026-08-04", open:320, high:342, low:313.5, close:342, volume:18841749 },
  ];

  assert.deepEqual(window.TechnicalChartCore.mergePriceRows(history, snapshots), [
    history[0],
    snapshots[1],
  ]);
});

test("daily change falls back to previous close when quote fields are null", () => {
  const rows = [
    { date:"2026-11-05", close:12.06 },
    { date:"2026-11-06", close:11.18, change:null, changePct:null, prevClose:null },
  ];

  const quote = window.TechnicalChartCore.dailyChange(rows);
  assert.ok(Math.abs(quote.change - (-0.88)) < 1e-9);
  assert.ok(Math.abs(quote.changePct - (-7.296849088)) < 1e-6);
});

test("daily change keeps valid explicit zero values", () => {
  const rows = [
    { date:"2026-11-05", close:12.06 },
    { date:"2026-11-06", close:12.06, change:0, changePct:0, prevClose:12.06 },
  ];

  assert.deepEqual(window.TechnicalChartCore.dailyChange(rows), { change:0, changePct:0 });
});

test("daily history takes precedence over an incorrect zero quote snapshot", () => {
  const rows = [
    { date:"2026-11-05", close:12.06 },
    { date:"2026-11-06", close:11.18, change:0, changePct:0, prevClose:11.18 },
  ];

  const quote = window.TechnicalChartCore.dailyChange(rows);
  assert.ok(Math.abs(quote.change - (-0.88)) < 1e-9);
  assert.ok(Math.abs(quote.changePct - (-7.296849088)) < 1e-6);
});
