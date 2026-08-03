(function () {
  const $ = id => document.getElementById(id);
  const W = 1120, H = 500, left = 62, right = 18, top = 18, priceBottom = 330, volumeTop = 365, bottom = 38;
  const data = window.DATA || { etfs: {} };
  let currentRows = [], candlePoints = [];

  const num = n => n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const price = n => n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateLabel = d => String(d || "").slice(5).replace("-", "/");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));

  function etfCodes() { return Object.keys(data.etfs).sort(); }
  function holdingsFor(code) {
    const etf = data.etfs[code];
    const map = new Map();
    (etf?.snapshots || []).forEach(s => (s.holdings || []).forEach(h => {
      if (h.code && !map.has(h.code)) map.set(h.code, h.name || h.code);
    }));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"));
  }
  function fillEtfs() {
    const select = $("etfSelect"); select.innerHTML = etfCodes().map(code => `<option value="${esc(code)}">${esc(code)} ${esc(data.etfs[code].name)}</option>`).join("");
    select.value = select.querySelector('option[value="0050"]') ? "0050" : select.options[0]?.value || "";
  }
  function fillSecurities() {
    const code = $("etfSelect").value, etf = data.etfs[code], select = $("securitySelect");
    const options = [`<option value="__ETF__">${esc(code)}（ETF 本身）</option>`].concat(holdingsFor(code).map(([c, n]) => `<option value="${esc(c)}">${esc(c)} ${esc(n)}</option>`));
    select.innerHTML = options.join("");
    render();
  }
  function rowsFor(code, security) {
    const etf = data.etfs[code];
    return (etf?.snapshots || []).map(s => {
      const q = security === "__ETF__" ? s.self : (s.holdings || []).find(h => h.code === security);
      return q && [q.open, q.high, q.low, q.close].every(v => v != null) ? { date:s.date, ...q } : null;
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  }
  function movingAverage(rows, index, period) {
    const values = rows.slice(Math.max(0, index - period + 1), index + 1).map(r => Number(r.close));
    return values.length === period ? values.reduce((a, b) => a + b, 0) / period : null;
  }
  function render() {
    const code = $("etfSelect").value, security = $("securitySelect").value, etf = data.etfs[code];
    currentRows = rowsFor(code, security); candlePoints = [];
    const name = security === "__ETF__" ? etf?.name || code : ((holdingsFor(code).find(x => x[0] === security) || [security, ""])[1]);
    $("chartTitle").textContent = `${name} ${security === "__ETF__" ? code : security}`;
    $("status").textContent = currentRows.length ? `資料 ${currentRows.length} 日（${currentRows[0].date} ～ ${currentRows[currentRows.length - 1].date}）` : "尚無完整 OHLC 資料";
    if (!currentRows.length) { $("chartBox").innerHTML = '<div class="empty">目前尚無可繪製的完整開高低收資料。</div>'; $("quote").textContent = "—"; return; }
    const last = currentRows[currentRows.length - 1];
    $("quote").innerHTML = `收盤 <strong>${price(last.close)}</strong> <span class="${last.change >= 0 ? "up" : "down"}">${last.change >= 0 ? "+" : ""}${price(last.change)} (${last.changePct == null ? "—" : (last.changePct >= 0 ? "+" : "") + last.changePct + "%"})</span>`;
    drawChart();
  }
  function drawChart() {
    const values = currentRows.flatMap(r => [Number(r.low), Number(r.high)]).filter(Number.isFinite);
    let min = Math.min(...values), max = Math.max(...values); if (min === max) { min -= 1; max += 1; }
    const maxVol = Math.max(...currentRows.map(r => Number(r.volume) || 0), 1), plotW = W - left - right, priceH = priceBottom - top;
    const x = i => left + (currentRows.length === 1 ? plotW / 2 : i * plotW / (currentRows.length - 1));
    const y = v => top + (max - v) * priceH / (max - min);
    const vy = v => volumeTop + 94 - (Number(v || 0) / maxVol) * 94;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc($("chartTitle").textContent)} K 線圖">`;
    [0, .25, .5, .75, 1].forEach(t => { const yy = top + t * priceH, val = max - t * (max - min); svg += `<line x1="${left}" x2="${W - right}" y1="${yy}" y2="${yy}" class="grid"/><text x="4" y="${yy + 4}" class="axis">${price(val)}</text>`; });
    svg += `<line x1="${left}" x2="${W - right}" y1="${volumeTop + 94}" y2="${volumeTop + 94}" class="grid"/><text x="${left}" y="${H - 8}" class="axis">${dateLabel(currentRows[0].date)}</text><text x="${W - right - 34}" y="${H - 8}" class="axis">${dateLabel(currentRows.at(-1).date)}</text>`;
    currentRows.forEach((r, i) => {
      const cx = x(i), candleW = Math.max(4, Math.min(18, plotW / Math.max(currentRows.length, 1) * .56)), rising = Number(r.close) >= Number(r.open), color = rising ? "var(--up)" : "var(--down)";
      const bodyY = y(Math.max(r.open, r.close)), bodyH = Math.max(1.5, Math.abs(y(r.open) - y(r.close)));
      const ma5 = movingAverage(currentRows, i, 5), ma20 = movingAverage(currentRows, i, 20);
      candlePoints.push({ x:cx, date:r.date, row:r });
      svg += `<line x1="${cx}" x2="${cx}" y1="${y(r.high)}" y2="${y(r.low)}" stroke="${color}" stroke-width="1.5"/><rect x="${cx - candleW / 2}" y="${bodyY}" width="${candleW}" height="${bodyH}" fill="${color}" rx="1"/><rect x="${cx - candleW / 2}" y="${vy(r.volume)}" width="${candleW}" height="${volumeTop + 94 - vy(r.volume)}" fill="${color}" opacity=".35"/>`;
      if (ma5 != null) svg += `<circle cx="${cx}" cy="${y(ma5)}" r="1.6" fill="var(--ma5)"/>`;
      if (ma20 != null) svg += `<circle cx="${cx}" cy="${y(ma20)}" r="1.6" fill="var(--ma20)"/>`;
    });
    function line(period, color) { const pts = currentRows.map((r, i) => { const v = movingAverage(currentRows, i, period); return v == null ? null : `${x(i)},${y(v)}`; }).filter(Boolean).join(" "); return pts ? `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` : ""; }
    svg += line(5, "var(--ma5)") + line(20, "var(--ma20)");
    svg += `<line id="hoverLine" class="crosshair" x1="${left}" x2="${left}" y1="${top}" y2="${priceBottom}" visibility="hidden"/>`;
    svg += `<rect id="chartHit" x="${left}" y="${top}" width="${plotW}" height="${priceBottom - top}" fill="transparent" pointer-events="all"/> </svg>`;
    $("chartBox").innerHTML = svg;
    const updateTip = event => {
      const rect = event.currentTarget.getBoundingClientRect(), position = (event.clientX - rect.left) / rect.width * plotW + left;
      const point = candlePoints.reduce((best, p) => Math.abs(p.x - position) < Math.abs(best.x - position) ? p : best, candlePoints[0]);
      const r = point.row; $("hoverLine").setAttribute("x1", point.x); $("hoverLine").setAttribute("x2", point.x); $("hoverLine").setAttribute("visibility", "visible");
      const chartRect = $("chartBox").getBoundingClientRect(), tip = $("tip");
      tip.style.left = `${Math.max(8, Math.min(chartRect.width - tip.offsetWidth - 8, event.clientX - chartRect.left - tip.offsetWidth / 2))}px`;
      $("tip").innerHTML = `<strong>${esc(r.date)}</strong>　開 ${price(r.open)}　高 ${price(r.high)}　低 ${price(r.low)}　收 ${price(r.close)}　量 ${num(r.volume)}`;
    };
    $("chartHit").addEventListener("pointermove", updateTip);
    $("chartHit").addEventListener("pointerleave", () => $("hoverLine").setAttribute("visibility", "hidden"));
  }
  $("etfSelect").addEventListener("change", fillSecurities);
  $("securitySelect").addEventListener("change", render);
  fillEtfs(); fillSecurities();
})();
