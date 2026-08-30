(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ETFCompareCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const cleanRows = rows => (rows || []).filter(row => row && row.date && number(row.close) != null)
    .map(row => ({ ...row, close: number(row.close) })).sort((a, b) => a.date.localeCompare(b.date));

  function normalizeName(value) {
    return String(value || "").toUpperCase().normalize("NFKD")
      .replace(/\b(INC(?:ORPORATED)?|CORP(?:ORATION)?|LTD|LIMITED|PLC|COMMON STOCK|CLASS [A-Z]|ORDINARY SHARES?)\b/g, "")
      .replace(/[^A-Z0-9\u3400-\u9FFF]+/g, "").trim();
  }

  function priceReturn(rows, periods) {
    const clean = cleanRows(rows);
    if (clean.length < 2) return null;
    const end = clean[clean.length - 1].close;
    const start = clean[Math.max(0, clean.length - 1 - periods)].close;
    return start ? (end / start - 1) * 100 : null;
  }

  function totalReturn(rows, dividends, periods) {
    const clean = cleanRows(rows);
    if (clean.length < 2) return null;
    const startIndex = Math.max(0, clean.length - 1 - periods);
    const dividendMap = new Map();
    (dividends || []).forEach(item => {
      const date = item.exDate || item.date || item.ex_date;
      const amount = number(item.amount ?? item.cashDividend ?? item.cash_dividend);
      if (date && amount != null) dividendMap.set(date, (dividendMap.get(date) || 0) + amount);
    });
    let factor = 1;
    for (let index = startIndex + 1; index < clean.length; index++) {
      const previous = clean[index - 1].close;
      const dividend = dividendMap.get(clean[index].date) || 0;
      if (previous) factor *= (clean[index].close + dividend) / previous;
    }
    return (factor - 1) * 100;
  }

  function annualVolatility(rows, periods = 252) {
    const clean = cleanRows(rows).slice(-(periods + 1));
    if (clean.length < 3) return null;
    const returns = clean.slice(1).map((row, index) => Math.log(row.close / clean[index].close));
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  function maxDrawdown(rows, periods = 252) {
    const clean = cleanRows(rows).slice(-(periods + 1));
    if (!clean.length) return null;
    let peak = clean[0].close, drawdown = 0;
    clean.forEach(row => {
      peak = Math.max(peak, row.close);
      if (peak) drawdown = Math.min(drawdown, (row.close / peak - 1) * 100);
    });
    return drawdown;
  }

  function holdingKey(item) {
    return String(item.code || item.symbol || item.cusip || item.isin || normalizeName(item.name)).toUpperCase();
  }

  function holdingDiff(left, right) {
    const map = new Map();
    const add = (items, side) => (items || []).forEach(item => {
      const key = holdingKey(item);
      if (!key) return;
      const row = map.get(key) || { key, name: item.name || key, symbol: item.symbol || item.code || "", left: 0, right: 0 };
      row[side] += number(item.weight) || 0;
      if (!row.symbol) row.symbol = item.symbol || item.code || "";
      if ((!row.name || row.name === row.key) && item.name) row.name = item.name;
      map.set(key, row);
    });
    add(left, "left"); add(right, "right");
    return [...map.values()].map(row => ({ ...row, difference: row.left - row.right }))
      .sort((a, b) => Math.max(b.left, b.right) - Math.max(a.left, a.right));
  }

  function overlap(left, right) {
    const rows = holdingDiff(left, right);
    return {
      weight: rows.reduce((sum, row) => sum + Math.min(row.left, row.right), 0),
      commonCount: rows.filter(row => row.left > 0 && row.right > 0).length,
      leftOnly: rows.filter(row => row.left > 0 && row.right === 0).length,
      rightOnly: rows.filter(row => row.right > 0 && row.left === 0).length,
    };
  }

  function topConcentration(holdings, count = 10) {
    return (holdings || []).map(item => number(item.weight) || 0).sort((a, b) => b - a)
      .slice(0, count).reduce((sum, value) => sum + value, 0);
  }

  function trailingDividendYield(dividends, currentPrice, latestDate) {
    const price = number(currentPrice);
    if (!price) return null;
    const end = latestDate ? new Date(latestDate + "T00:00:00Z") : new Date();
    const start = new Date(end); start.setUTCFullYear(start.getUTCFullYear() - 1);
    const total = (dividends || []).reduce((sum, item) => {
      const date = new Date((item.exDate || item.date || item.ex_date || "") + "T00:00:00Z");
      const amount = number(item.amount ?? item.cashDividend ?? item.cash_dividend);
      return !Number.isNaN(date.valueOf()) && date > start && date <= end && amount != null ? sum + amount : sum;
    }, 0);
    return total / price * 100;
  }

  return { normalizeName, priceReturn, totalReturn, annualVolatility, maxDrawdown, holdingDiff, overlap, topConcentration, trailingDividendYield };
});
