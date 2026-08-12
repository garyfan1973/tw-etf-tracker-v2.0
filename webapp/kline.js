(function () {
  const $ = id => document.getElementById(id);
  const W = 1120, H = 650, left = 62, right = 18, top = 18, priceBottom = 300, volumeTop = 325, volumeBottom = 405, kdTop = 440, kdBottom = 590;
  const data = window.DATA || { etfs: {} };
  let currentRows = [], candlePoints = [], chartType = localStorage.getItem("etf-chart-type") === "line" ? "line" : "candle";

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
  function kdValues(rows) {
    let k = 50, d = 50;
    return rows.map((row, index) => {
      const period = rows.slice(Math.max(0, index - 8), index + 1);
      const high = Math.max(...period.map(r => Number(r.high))), low = Math.min(...period.map(r => Number(r.low)));
      const rsv = high === low ? 50 : (Number(row.close) - low) / (high - low) * 100;
      k = k * 2 / 3 + rsv / 3;
      d = d * 2 / 3 + k / 3;
      return { k, d };
    });
  }
  function updateChartType() {
    document.querySelectorAll("[data-chart-type]").forEach(button => {
      const active = button.dataset.chartType === chartType;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const closeLegend = $("closeLegend"), candleLegend = $("candleLegend"), tip = $("tip");
    if (closeLegend) closeLegend.style.display = chartType === "line" ? "inline-flex" : "none";
    if (candleLegend) candleLegend.style.display = chartType === "candle" ? "inline-flex" : "none";
    if (tip) tip.textContent = chartType === "line" ? "將滑鼠移到線圖上查看每日收盤價。" : "將滑鼠移到圖表上半部的 K 線區域。";
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
    const rootStyle = getComputedStyle(document.documentElement);
    const chartColors = {
      accent: rootStyle.getPropertyValue("--accent").trim() || "#3b5bdb",
      ma5: rootStyle.getPropertyValue("--ma5").trim() || "#e9a23b",
      ma20: rootStyle.getPropertyValue("--ma20").trim() || "#a78bca",
      k: rootStyle.getPropertyValue("--kd-k").trim() || "#19a7a0",
      d: rootStyle.getPropertyValue("--kd-d").trim() || "#e06b8b"
    };
    const values = (chartType === "line" ? currentRows.map(r => Number(r.close)) : currentRows.flatMap(r => [Number(r.low), Number(r.high)])).filter(Number.isFinite);
    let min = Math.min(...values), max = Math.max(...values); if (min === max) { min -= 1; max += 1; }
    const maxVol = Math.max(...currentRows.map(r => Number(r.volume) || 0), 1), plotW = W - left - right, priceH = priceBottom - top, kd = kdValues(currentRows);
    // X 軸使用交易日序號，不把週末／休市日當成空白時間。資料很少時，
    // 讓 K 棒集中在圖中央並保持固定間距；資料變多後才逐步填滿圖寬。
    const slot = Math.min(34, plotW / Math.max(currentRows.length - 1, 1));
    const contentW = slot * Math.max(currentRows.length - 1, 0);
    const startX = left + Math.max(0, (plotW - contentW) / 2);
    const x = i => startX + i * slot;
    const y = v => top + (max - v) * priceH / (max - min);
    const vy = v => volumeBottom - (Number(v || 0) / maxVol) * (volumeBottom - volumeTop);
    const ky = v => kdBottom - Number(v) / 100 * (kdBottom - kdTop);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc($("chartTitle").textContent)} ${chartType === "line" ? "收盤價線圖" : "K 線圖"}">`;
    [0, .25, .5, .75, 1].forEach(t => { const yy = top + t * priceH, val = max - t * (max - min); svg += `<line x1="${left}" x2="${W - right}" y1="${yy}" y2="${yy}" class="grid"/><text x="4" y="${yy + 4}" class="axis">${price(val)}</text>`; });
    svg += `<line x1="${left}" x2="${W - right}" y1="${volumeBottom}" y2="${volumeBottom}" class="grid"/>`;
    [20,50,80].forEach(v => svg += `<line x1="${left}" x2="${W - right}" y1="${ky(v)}" y2="${ky(v)}" class="grid${v===50?'':' kd-threshold'}"/><text x="24" y="${ky(v)+4}" class="axis">${v}</text>`);
    svg += `<text x="4" y="${kdTop + 12}" class="axis">KD</text><text x="${x(0)}" y="${H - 8}" text-anchor="middle" class="axis">${dateLabel(currentRows[0].date)}</text><text x="${x(currentRows.length - 1)}" y="${H - 8}" text-anchor="middle" class="axis">${dateLabel(currentRows.at(-1).date)}</text>`;
    currentRows.forEach((r, i) => {
      const cx = x(i), candleW = Math.max(4, Math.min(18, plotW / Math.max(currentRows.length, 1) * .56)), rising = Number(r.close) >= Number(r.open), color = rising ? "var(--up)" : "var(--down)";
      const bodyY = y(Math.max(r.open, r.close)), bodyH = Math.max(1.5, Math.abs(y(r.open) - y(r.close)));
      const ma5 = movingAverage(currentRows, i, 5), ma20 = movingAverage(currentRows, i, 20);
      candlePoints.push({ x:cx, y:chartType === "line" ? y(Number(r.close)) : y((Number(r.open) + Number(r.close)) / 2), date:r.date, row:r });
      if (chartType === "candle") svg += `<line x1="${cx}" x2="${cx}" y1="${y(r.high)}" y2="${y(r.low)}" stroke="${color}" stroke-width="1.5"/><rect x="${cx - candleW / 2}" y="${bodyY}" width="${candleW}" height="${bodyH}" fill="${color}" rx="1"/>`;
      svg += `<rect x="${cx - candleW / 2}" y="${vy(r.volume)}" width="${candleW}" height="${volumeBottom - vy(r.volume)}" fill="${color}" opacity=".35"/>`;
      if (ma5 != null) svg += `<circle class="ma-point ma5-point" cx="${cx}" cy="${y(ma5)}" r="1.15" fill="${chartColors.ma5}"/>`;
      if (ma20 != null) svg += `<circle class="ma-point ma20-point" cx="${cx}" cy="${y(ma20)}" r="1.15" fill="${chartColors.ma20}"/>`;
    });
    function line(period, color, name) { const pts = currentRows.map((r, i) => { const v = movingAverage(currentRows, i, period); return v == null ? null : `${x(i)},${y(v)}`; }).filter(Boolean).join(" "); return pts ? `<polyline class="ma-line ${name}" points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` : ""; }
    if (chartType === "line") svg += `<polyline points="${currentRows.map((r, i) => `${x(i)},${y(Number(r.close))}`).join(" ")}" fill="none" stroke="${chartColors.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg += line(5, chartColors.ma5, "ma5-line") + line(20, chartColors.ma20, "ma20-line");
    svg += `<polyline class="kd-line k-line" points="${kd.map((v,i)=>`${x(i)},${ky(v.k)}`).join(" ")}" fill="none" stroke="${chartColors.k}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><polyline class="kd-line d-line" points="${kd.map((v,i)=>`${x(i)},${ky(v.d)}`).join(" ")}" fill="none" stroke="${chartColors.d}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg += `<line id="hoverLine" class="crosshair" x1="${left}" x2="${left}" y1="${top}" y2="${kdBottom}" visibility="hidden"/>`;
    svg += `<rect id="chartHit" x="${left}" y="${top}" width="${plotW}" height="${kdBottom - top}" fill="transparent" pointer-events="all"/> </svg>`;
    $("chartBox").innerHTML = svg;
    const updateTip = event => {
      const rect = event.currentTarget.getBoundingClientRect(), position = (event.clientX - rect.left) / rect.width * plotW + left;
      const point = candlePoints.reduce((best, p) => Math.abs(p.x - position) < Math.abs(best.x - position) ? p : best, candlePoints[0]);
      const r = point.row; $("hoverLine").setAttribute("x1", point.x); $("hoverLine").setAttribute("x2", point.x); $("hoverLine").setAttribute("visibility", "visible");
      const chartRect = $("chartBox").getBoundingClientRect(), wrapRect = document.querySelector(".kline-chart-wrap, .chart-wrap").getBoundingClientRect(), tip = $("tip");
      const index = candlePoints.indexOf(point), indicator = kd[index];
      tip.innerHTML = `<strong>${esc(r.date)}</strong><br>開 ${price(r.open)}　高 ${price(r.high)}<br>低 ${price(r.low)}　收 ${price(r.close)}<br>量 ${Math.round(Number(r.volume || 0) / 1000).toLocaleString("en-US")} 張<br>K ${price(indicator.k)}　D ${price(indicator.d)}`;
      tip.style.visibility = "hidden";
      tip.style.left = "0px";
      tip.style.top = "0px";
      const tipWidth = tip.offsetWidth, tipHeight = tip.offsetHeight;
      const pointX = chartRect.left + point.x / W * chartRect.width;
      const pointY = chartRect.top + point.y / H * chartRect.height;
      let leftPos = pointX - wrapRect.left + 18;
      if (leftPos + tipWidth > wrapRect.width - 8) leftPos = pointX - wrapRect.left - tipWidth - 18;
      let topPos = pointY - wrapRect.top - tipHeight / 2;
      leftPos = Math.max(8, Math.min(wrapRect.width - tipWidth - 8, leftPos));
      topPos = Math.max(8, Math.min(wrapRect.height - tipHeight - 8, topPos));
      tip.style.left = `${leftPos}px`;
      tip.style.top = `${topPos}px`;
      tip.style.visibility = "visible";
    };
    $("chartHit").addEventListener("pointermove", updateTip);
    $("chartHit").addEventListener("pointerleave", () => $("hoverLine").setAttribute("visibility", "hidden"));
  }
  $("etfSelect").addEventListener("change", fillSecurities);
  $("securitySelect").addEventListener("change", render);
  document.querySelectorAll("[data-chart-type]").forEach(button => button.addEventListener("click", () => {
    chartType = button.dataset.chartType;
    localStorage.setItem("etf-chart-type", chartType);
    updateChartType();
    if (currentRows.length) drawChart();
  }));
  updateChartType(); fillEtfs(); fillSecurities();
})();
