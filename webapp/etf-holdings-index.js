(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EtfHoldingsIndex = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function normalizedMarket(holding) {
    return String((holding && holding.market) || "TW").trim().toUpperCase();
  }

  function holdingKey(holding) {
    if (!holding) return "";
    const code = String(holding.code || "").trim().toUpperCase();
    if (code) return normalizedMarket(holding) + ":" + code;
    const name = String(holding.name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
    return name ? "NAME:" + name : "";
  }

  function isStock(holding) {
    return holding && (!holding.assetType || holding.assetType === "stock");
  }

  function build(etfs) {
    const index = new Map();
    Object.entries(etfs || {}).forEach(([symbol, etf]) => {
      const snapshots = Array.isArray(etf.snapshots) ? etf.snapshots : [];
      const snapshot = snapshots[snapshots.length - 1];
      if (!snapshot) return;
      const holdings = (snapshot.holdings || [])
        .filter(isStock)
        .slice()
        .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0));
      holdings.forEach((holding, position) => {
        const key = holdingKey(holding);
        if (!key) return;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({
          symbol,
          etfName: etf.name || "",
          date: snapshot.date || "",
          rank: position + 1,
          holding,
        });
      });
    });
    index.forEach(rows => rows.sort((a, b) => {
      const weightDiff = (Number(b.holding.weight) || 0) - (Number(a.holding.weight) || 0);
      return weightDiff || a.symbol.localeCompare(b.symbol);
    }));
    return index;
  }

  function lookup(index, holding) {
    return (index && index.get(holdingKey(holding))) || [];
  }

  return { build, holdingKey, lookup };
});
