(function () {
  const input = document.getElementById("assetSearch");
  const link = document.getElementById("strategyLauncher");
  if (!input || !link) return;

  function refresh() {
    const typedCode = input.value.trim().split(/\s+/)[0].toUpperCase();
    const asset = window.MarketChart?.findAsset?.(typedCode);
    if (!asset || asset.assetType !== "stock" || !["TW", "US"].includes(asset.market)) {
      link.hidden = true;
      link.removeAttribute("href");
      return;
    }
    const params = new URLSearchParams({ symbol: asset.symbol, market: asset.market, name: asset.name || "" });
    link.href = `investment-strategy.html?${params}`;
    link.setAttribute("aria-label", `${asset.symbol} ${asset.name || ""} 投資策略建議，在新分頁開啟`);
    link.hidden = false;
  }

  input.addEventListener("input", refresh);
  document.addEventListener("marketchart:assetchange", refresh);
  document.addEventListener("marketchart:ready", refresh);
  refresh();
})();
