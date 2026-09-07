/* Pure calculations for the analysis workspace. No network or DOM dependencies. */
(function (root) {
  'use strict';
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  function clean(rows) {
    const dates = new Map();
    (rows || []).forEach(r => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !finite(r.close) || r.close <= 0) return;
      dates.set(r.date, {...r, volume: finite(r.volume) && r.volume >= 0 ? r.volume : null});
    });
    return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  function sma(values, period) {
    return values.map((_, i) => i < period - 1 ? null : mean(values.slice(i - period + 1, i + 1)));
  }
  function ema(values, period) {
    let previous = null;
    return values.map((v, i) => {
      if (i < period - 1) return null;
      previous = previous === null ? mean(values.slice(0, period)) : previous + 2 / (period + 1) * (v - previous);
      return previous;
    });
  }
  function rsi(values, period = 14) {
    const out = Array(values.length).fill(null);
    if (values.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) { gain += Math.max(0, values[i] - values[i - 1]); loss += Math.max(0, values[i - 1] - values[i]); }
    gain /= period; loss /= period;
    const read = () => gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    out[period] = read();
    for (let i = period + 1; i < values.length; i++) {
      gain = (gain * (period - 1) + Math.max(0, values[i] - values[i - 1])) / period;
      loss = (loss * (period - 1) + Math.max(0, values[i - 1] - values[i])) / period;
      out[i] = read();
    }
    return out;
  }
  function indicators(rows) {
    const closes = rows.map(r => r.close), ma20 = sma(closes, 20), fast = ema(closes, 12), slow = ema(closes, 26);
    const dif = closes.map((_, i) => finite(fast[i]) && finite(slow[i]) ? fast[i] - slow[i] : null);
    const signal = Array(Math.min(25, closes.length)).fill(null).concat(ema(dif.slice(25), 9));
    let k = 50, d = 50;
    return {ma20, ma60: sma(closes, 60), rsi: rsi(closes), dif, signal,
      histogram: dif.map((v, i) => finite(v) && finite(signal[i]) ? v - signal[i] : null),
      bands: closes.map((_, i) => { if (i < 19) return null; const std = Math.sqrt(mean(closes.slice(i - 19, i + 1).map(v => (v - ma20[i]) ** 2))); return {upper: ma20[i] + 2 * std, lower: ma20[i] - 2 * std}; }),
      kd: rows.map((r, i) => { if (i < 8) return null; const range = rows.slice(i - 8, i + 1); if (!range.every(v => finite(v.high) && finite(v.low))) return null; const high = Math.max(...range.map(v => v.high)), low = Math.min(...range.map(v => v.low)); const rsv = high === low ? 50 : (r.close - low) / (high - low) * 100; k = k * 2 / 3 + rsv / 3; d = d * 2 / 3 + k / 3; return {k, d}; })};
  }
  function metrics(rows) {
    if (!rows.length) return {returnPct: null, maxDrawdown: null, volatility: null, positiveDays: null, drawdown: []};
    let peak = rows[0].close;
    const drawdown = rows.map(r => { peak = Math.max(peak, r.close); return (r.close / peak - 1) * 100; });
    const returns = rows.slice(1).map((r, i) => Math.log(r.close / rows[i].close));
    const avg = mean(returns);
    return {returnPct: rows.length > 1 ? (rows.at(-1).close / rows[0].close - 1) * 100 : null,
      maxDrawdown: rows.length > 1 ? Math.min(...drawdown) : null, drawdown,
      volatility: returns.length > 1 ? Math.sqrt(returns.reduce((s, v) => s + (v - avg) ** 2, 0) / (returns.length - 1)) * Math.sqrt(252) * 100 : null,
      positiveDays: returns.length ? returns.filter(v => v > 0).length / returns.length * 100 : null};
  }
  function compare(a, b) {
    const byDate = new Map(b.map(r => [r.date, r]));
    const pairs = a.filter(r => byDate.has(r.date)).map(r => [r, byDate.get(r.date)]);
    if (pairs.length < 2) return [];
    return pairs.map(([x, y]) => ({date: x.date, a: (x.close / pairs[0][0].close - 1) * 100, b: (y.close / pairs[0][1].close - 1) * 100}));
  }
  function monthly(rows) {
    const groups = new Map();
    rows.forEach(r => groups.set(r.date.slice(0, 7), r));
    let previous = null;
    return [...groups].map(([month, row]) => { const priorMonth = previous?.date.slice(0, 7), expected = new Date(`${month}-01T00:00:00Z`); expected.setUTCMonth(expected.getUTCMonth() - 1); const value = priorMonth === expected.toISOString().slice(0, 7) ? (row.close / previous.close - 1) * 100 : null; previous = row; return {month, value}; });
  }
  const api = {finite, mean, clean, sma, ema, rsi, indicators, metrics, compare, monthly};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnalysisCore = api;
})(typeof window === 'undefined' ? globalThis : window);
