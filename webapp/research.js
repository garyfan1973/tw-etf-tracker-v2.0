(function () {
  const $ = id => document.getElementById(id);
  const labels = { "TW-stock": "台股", "TW-etf": "台灣 ETF", "US-stock": "美股", "US-etf": "美國 ETF" };
  const marketNames = { TW: "台灣", US: "美國" };
  let assets = [], selectedType = "TW-etf", currentRequest = 0;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const number = value => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const price = value => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const typeOf = asset => `${String(asset.market || "").toUpperCase()}-${String(asset.asset_type || "").toLowerCase()}`;

  function filteredAssets() {
    const term = $("assetSearch").value.trim().toLowerCase();
    return assets.filter(asset => typeOf(asset) === selectedType && (!term || `${asset.symbol} ${asset.name}`.toLowerCase().includes(term))).slice(0, 40);
  }

  function renderResults() {
    const rows = filteredAssets();
    $("resultMeta").textContent = `${labels[selectedType]}・${rows.length} 筆結果`;
    $("assetResults").innerHTML = rows.length ? rows.map(asset => `<button class="asset-result" type="button" data-market="${esc(String(asset.market).toUpperCase())}" data-code="${esc(asset.symbol)}"><strong>${esc(asset.symbol)}</strong><span>${esc(asset.name)}</span><small>${esc(marketNames[String(asset.market).toUpperCase()] || "")}</small></button>`).join("") : '<div class="empty">找不到符合條件的標的。</div>';
    document.querySelectorAll(".asset-result").forEach(button => button.addEventListener("click", () => loadInstrument(button.dataset.market, button.dataset.code)));
  }

  function chartSvg(rows) {
    const W = 900, H = 260, pad = 28, values = rows.map(row => Number(row.close)).filter(Number.isFinite);
    if (!values.length) return "";
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const x = index => pad + index * (W - pad * 2) / Math.max(1, values.length - 1);
    const y = value => H - pad - (value - min) * (H - pad * 2) / span;
    const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="一年價格走勢"><line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" class="chart-grid"/><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="${pad}" y="${H - 7}" class="chart-axis">${esc(rows[0].date)}</text><text x="${W - pad}" y="${H - 7}" text-anchor="end" class="chart-axis">${esc(rows.at(-1).date)}</text><text x="${pad}" y="18" class="chart-axis">${price(max)}</text><text x="${pad}" y="${H - 38}" class="chart-axis">${price(min)}</text></svg>`;
  }

  async function loadInstrument(market, code) {
    const request = ++currentRequest;
    $("instrumentEmpty").hidden = true;
    $("instrumentLoading").hidden = false;
    $("instrumentCard").hidden = true;
    try {
      const response = await fetch(`/api/market?market=${encodeURIComponent(market)}&code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const payload = await response.json();
      if (request !== currentRequest) return;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "行情資料暫時無法取得");
      const asset = assets.find(item => String(item.symbol).toUpperCase() === code && typeOf(item) === `${market}-${selectedType.split("-")[1]}`) || { name: code, asset_type: selectedType.split("-")[1] };
      const meta = payload.meta || {}, rows = payload.rows || [], latest = rows.at(-1) || {}, previous = rows.at(-2) || {};
      const change = Number.isFinite(Number(latest.close)) && Number.isFinite(Number(previous.close)) ? Number(latest.close) - Number(previous.close) : null;
      const pct = change != null && Number(previous.close) ? change / Number(previous.close) * 100 : null;
      const tone = change == null ? "" : change >= 0 ? "up" : "down";
      $("instrumentCard").innerHTML = `<div class="instrument-head"><div><span class="instrument-market">${esc(labels[selectedType])}</span><h2>${esc(code)} <small>${esc(asset.name || code)}</small></h2></div><div class="instrument-price ${tone}"><strong>${price(latest.close)}</strong><span>${change == null ? "—" : `${change >= 0 ? "+" : ""}${price(change)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`}</span></div></div><div class="instrument-meta"><span>資料日 ${esc(latest.date || "—")}</span><span>幣別 ${esc(meta.currency || (market === "TW" ? "TWD" : "USD"))}</span><span>交易所 ${esc(meta.exchangeName || "Yahoo Finance")}</span></div><div class="instrument-chart">${chartSvg(rows)}</div><p class="source-note">行情來源：Yahoo Finance；價格資料僅供研究參考。</p>`;
      $("instrumentCard").hidden = false;
    } catch (error) {
      if (request === currentRequest) { $("instrumentEmpty").textContent = error.message; $("instrumentEmpty").hidden = false; }
    } finally { if (request === currentRequest) $("instrumentLoading").hidden = true; }
  }

  async function init() {
    try {
      const response = await fetch("trade_assets.json", { cache: "force-cache" });
      const payload = await response.json();
      assets = Array.isArray(payload.assets) ? payload.assets : [];
      renderResults();
      const first = filteredAssets()[0];
      if (first) loadInstrument(String(first.market).toUpperCase(), first.symbol);
    } catch (_) { $("resultMeta").textContent = "標的清單暫時無法載入"; }
  }
  document.querySelectorAll("[data-market-type]").forEach(button => button.addEventListener("click", () => { selectedType = button.dataset.marketType; document.querySelectorAll("[data-market-type]").forEach(item => item.classList.toggle("active", item === button)); renderResults(); }));
  $("assetSearch").addEventListener("input", renderResults);
  init();
})();
