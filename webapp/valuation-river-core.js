/* Pure river-chart calculations. Never fill missing or non-positive valuations. */
(function (root) {
  'use strict';
  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  function quantile(values, fraction) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b), position = (sorted.length - 1) * fraction;
    const low = Math.floor(position), high = Math.ceil(position);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
  }
  function defaultMultiples(rows, mode) {
    const values = rows.map(row => row[mode]).filter(positive);
    if (!values.length) return mode === 'pe' ? [10, 15, 20, 25, 30] : [1, 2, 3, 4, 5];
    // Five fixed multiples for this view, based on the full available history.
    // These are descriptive percentiles, not a backtested trading signal.
    const candidates = [.1, .3, .5, .7, .9].map(q => Number(quantile(values, q).toFixed(2)));
    if (new Set(candidates).size === 5) return candidates;
    const median = quantile(values, .5);
    return [.6, .8, 1, 1.2, 1.4].map(value => Number(Math.max(.01, median * value).toFixed(4)));
  }
  function parseMultiples(text) {
    const parts = String(text).trim().split(/[\s,，、]+/);
    if (parts.length !== 5 || parts.some(value => !/^\d+(?:\.\d+)?$/.test(value))) return null;
    const values = parts.map(Number);
    return values.every((value, index) => positive(value) && value <= 10000 && (!index || value > values[index - 1])) ? values : null;
  }
  function bandValue(row, mode, multiple) {
    // Use the same-day official ratio/close, not today's EPS on past prices.
    return positive(row.close) && positive(row[mode]) && positive(multiple) ? row.close / row[mode] * multiple : null;
  }
  function periodRows(rows, years) {
    if (!rows.length) return [];
    const end = new Date(rows.at(-1).date + 'T00:00:00Z');
    const start = new Date(end); start.setUTCFullYear(end.getUTCFullYear() - years);
    const cutoff = start.toISOString().slice(0, 10);
    return rows.filter(row => row.date >= cutoff);
  }
  function segments(rows, value) {
    const groups = []; let current = [];
    rows.forEach((row, index) => {
      const v = value(row);
      if (row.gapBefore || !positive(v)) { if (current.length) groups.push(current); current = []; }
      if (positive(v)) current.push({row, index, value:v});
    });
    if (current.length) groups.push(current);
    return groups;
  }
  const api = {positive, quantile, defaultMultiples, parseMultiples, bandValue, periodRows, segments};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ValuationRiverCore = api;
})(typeof window === 'undefined' ? globalThis : window);
