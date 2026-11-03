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
