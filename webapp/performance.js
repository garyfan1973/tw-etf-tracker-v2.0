(function () {
  const $ = id => document.getElementById(id);
  const COLORS = ["#4263eb", "#d9480f", "#2b8a3e", "#9c36b5", "#c2255c", "#0b7285", "#7048e8", "#e67700", "#087f5b", "#5f3dc4", "#364fc7", "#a61e4d"];
  let allRows = [], selected = new Set(), mode = "ex", initialized = false;
  const money = n => n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US");
  const pct = n => n == null ? "—" : (n > 0 ? "+" : "") + Number(n).toFixed(2) + "%";
  const num = n => n == null ? "—" : Number(n).toLocaleString("en-US");
  const fmtDate = d => d ? String(d).slice(0, 10) : "—";

  function today() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function daysAgo(n) {
    const d = new Date(today() + "T00:00:00"); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function client() { return window.ETFAuth && window.ETFAuth.client(); }
  function user() { return window.ETFAuth && window.ETFAuth.user(); }
  function codeSet() { return [...new Set(allRows.map(r => r.etf_code))]; }
  function visibleRows() { return allRows.filter(r => selected.has(r.etf_code)); }

  function renderChoices() {
    const box = $("choices"); box.innerHTML = "";
    codeSet().forEach(code => {
      const row = allRows.find(r => r.etf_code === code);
      const el = document.createElement("span");
      el.className = "choice" + (selected.has(code) ? " on" : "");
      el.textContent = code + " " + (row.etf_name || "");
      el.onclick = () => { if (selected.has(code)) selected.delete(code); else selected.add(code); renderChoices(); render(); };
      box.appendChild(el);
    });
  }

  function renderSummary() {
    const box = $("summary"); box.innerHTML = "";
    const rows = visibleRows();
    if (!rows.length) { box.innerHTML = '<div class="empty">尚無查詢資料</div>'; return; }
    const lastDate = rows.reduce((m, r) => r.snapshot_date > m ? r.snapshot_date : m, "");
    const last = rows.filter(r => r.snapshot_date === lastDate);
    last.forEach(r => {
      const value = mode === "inc" ? r.return_with_dividend : r.return_ex_dividend;
      box.innerHTML += '<div class="metric"><div class="k">' + r.etf_code + " " + r.etf_name + '</div><div class="v">' + pct(value) + "</div></div>";
    });
  }

  function renderTable() {
    const body = $("rows"); body.innerHTML = "";
    visibleRows().sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date) || a.etf_code.localeCompare(b.etf_code)).forEach(r => {
      const ret = mode === "inc" ? r.return_with_dividend : r.return_ex_dividend;
      body.innerHTML += "<tr><td>" + fmtDate(r.snapshot_date) + "</td><td>" + r.etf_code + " " + (r.etf_name || "") +
        "</td><td>" + num(r.shares) + "</td><td>" + money(r.market_value) + " 元</td><td>" + money(r.unrealized_pnl) +
        " 元</td><td>" + money(r.realized_pnl) + " 元</td><td>" + money(r.dividend_income) + " 元</td><td>" + pct(ret) + "</td></tr>";
    });
    $("returnHead").textContent = mode === "inc" ? "含息報酬率" : "不含息報酬率";
  }

  function renderChart() {
    const svg = $("chart"), legend = $("legend"); svg.innerHTML = ""; legend.innerHTML = "";
    const rows = visibleRows(), dates = [...new Set(rows.map(r => r.snapshot_date))].sort();
    if (!rows.length || !dates.length) { svg.innerHTML = '<text x="30" y="40" class="axis-label">尚無資料</text>'; return; }
    // null 代表當日沒有可用報酬率，不能先轉成 Number(null) === 0，否則會扭曲縱軸。
    const values = rows.map(r => mode === "inc" ? r.return_with_dividend : r.return_ex_dividend)
      .filter(v => v != null && Number.isFinite(Number(v))).map(Number);
    if (!values.length) { svg.innerHTML = '<text x="30" y="40" class="axis-label">目前沒有可用的報酬率資料</text>'; return; }
    let min = Math.min(0, ...values), max = Math.max(0, ...values); if (min === max) { min -= 1; max += 1; }
    const W = 1000, H = 330, left = 58, right = 18, top = 18, bottom = 46, plotW = W - left - right, plotH = H - top - bottom;
    // 以觀測到的資料點作為 x 軸，不按日曆天數拉開；資料很少時壓縮點距。
    const pointGap = dates.length <= 6 ? 96 : plotW / (dates.length - 1);
    const usedW = dates.length === 1 ? 0 : Math.min(plotW, pointGap * (dates.length - 1));
    const xStart = left;
    const x = i => dates.length === 1 ? left + plotW / 2 : xStart + i * usedW / (dates.length - 1);
    const y = v => top + (max - v) * plotH / (max - min);
    [0, .25, .5, .75, 1].forEach(t => {
      const yy = top + t * plotH, val = max - t * (max - min);
      svg.innerHTML += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + yy + '" y2="' + yy + '" class="chart-grid"/>' +
        '<text x="4" y="' + (yy + 4) + '" class="axis-label">' + val.toFixed(1) + "%</text>";
    });
    if (min <= 0 && max >= 0) {
      const zero = y(0);
      svg.innerHTML += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + zero + '" y2="' + zero + '" class="zero-line"/>';
    }
    codeSet().filter(c => selected.has(c)).forEach((code, ci) => {
      const byDate = Object.fromEntries(rows.filter(r => r.etf_code === code).map(r => [r.snapshot_date, r]));
      const pointData = dates.map((d, i) => {
        const r = byDate[d]; const v = r ? (mode === "inc" ? r.return_with_dividend : r.return_ex_dividend) : null;
        return v == null ? null : { x: x(i), y: y(Number(v)), date: d, value: Number(v) };
      }).filter(Boolean);
      const color = COLORS[ci % COLORS.length];
      if (pointData.length > 1) svg.innerHTML += '<polyline points="' + pointData.map(p => p.x + "," + p.y).join(" ") + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      pointData.forEach(p => {
        const rowName = (rows.find(r => r.etf_code === code) || {}).etf_name || code;
        svg.innerHTML += '<circle cx="' + p.x + '" cy="' + p.y + '" r="10" fill="transparent" class="chart-hit" data-code="' + code + '" data-name="' + rowName + '" data-date="' + p.date + '" data-value="' + p.value + '"></circle>' +
          '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="' + color + '" class="chart-point"><title>' + p.date + '　' + pct(p.value) + '</title></circle>';
      });
      const row = rows.find(r => r.etf_code === code);
      legend.innerHTML += '<span><i style="background:' + color + '"></i>' + code + " " + (row.etf_name || "") + "</span>";
    });
    dates.forEach((date, i) => {
      if (dates.length <= 8 || i === 0 || i === dates.length - 1) {
        svg.innerHTML += '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle" class="axis-label">' + date + '</text>';
      }
    });
    const tooltip = $("chartTooltip");
    svg.querySelectorAll(".chart-hit").forEach(hit => {
      hit.addEventListener("mouseenter", e => {
        const value = Number(hit.dataset.value);
        tooltip.innerHTML = '<strong>' + hit.dataset.code + ' ' + hit.dataset.name + '</strong><br>' + hit.dataset.date + '　' + (mode === "inc" ? "含息" : "不含息") + '報酬率：<b>' + pct(value) + '</b>';
        tooltip.style.display = "block";
        tooltip.style.left = (e.clientX + 14) + "px";
        tooltip.style.top = (e.clientY + 14) + "px";
      });
      hit.addEventListener("mousemove", e => {
        tooltip.style.left = (e.clientX + 14) + "px";
        tooltip.style.top = (e.clientY + 14) + "px";
      });
      hit.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    });
  }

  function render() { renderChart(); renderSummary(); renderTable(); }

  async function query() {
    const c = client(); if (!c) return;
    $("msg").textContent = "查詢中…";
    const start = $("start").value, end = $("end").value;
    const result = await c.from("portfolio_daily_snapshots").select("*").gte("snapshot_date", start).lte("snapshot_date", end).order("snapshot_date", { ascending: true }).order("etf_code", { ascending: true });
    if (result.error) { $("msg").textContent = "查詢失敗：" + result.error.message; return; }
    // 舊版可能留下沒有行情價格的快照；這些列沒有可解釋的當日報酬率，先不呈現。
    allRows = (result.data || []).filter(r => r.price != null); selected = new Set(codeSet()); $("msg").textContent = allRows.length ? "" : "此日期區間尚無每日快照；請先執行每日快照流程。";
    renderChoices(); render();
  }

  function boot() {
    if (!window.ETFAuth || !window.ETFAuth.isConfigured()) { $("gate").style.display = "block"; $("gate").innerHTML = '<div class="empty">Supabase 尚未設定。</div>'; return; }
    if (!user()) { $("gate").style.display = "block"; $("gate").innerHTML = '<div class="empty">請先登入，才能查看個人績效歷史。</div>'; return; }
    if (initialized) return;
    initialized = true;
    $("app").style.display = "block"; $("end").value = today(); $("start").value = daysAgo(30);
    document.querySelectorAll('input[name="mode"]').forEach(el => el.onchange = () => { mode = el.value; render(); });
    $("query").onclick = query; query();
  }
  document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0));
  document.addEventListener("etfwatch:change", boot);
})();
