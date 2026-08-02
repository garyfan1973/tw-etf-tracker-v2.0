(function () {
  const $ = id => document.getElementById(id);
  const COLORS = ["#3b5bdb", "#e8590c", "#2f9e44", "#9c36b5", "#d6336c", "#0c8599", "#6741d9", "#f08c00"];
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
    const values = rows.map(r => mode === "inc" ? Number(r.return_with_dividend) : Number(r.return_ex_dividend)).filter(Number.isFinite);
    let min = Math.min(0, ...values), max = Math.max(0, ...values); if (min === max) { min -= 1; max += 1; }
    const W = 1000, H = 330, left = 58, right = 18, top = 18, bottom = 38, plotW = W - left - right, plotH = H - top - bottom;
    const x = i => left + (dates.length === 1 ? plotW / 2 : i * plotW / (dates.length - 1));
    const y = v => top + (max - v) * plotH / (max - min);
    [0, .25, .5, .75, 1].forEach(t => {
      const yy = top + t * plotH, val = max - t * (max - min);
      svg.innerHTML += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + yy + '" y2="' + yy + '" class="chart-grid"/>' +
        '<text x="4" y="' + (yy + 4) + '" class="axis-label">' + val.toFixed(1) + "%</text>";
    });
    codeSet().filter(c => selected.has(c)).forEach((code, ci) => {
      const byDate = Object.fromEntries(rows.filter(r => r.etf_code === code).map(r => [r.snapshot_date, r]));
      const points = dates.map((d, i) => {
        const r = byDate[d]; const v = r ? (mode === "inc" ? r.return_with_dividend : r.return_ex_dividend) : null;
        return v == null ? null : x(i) + "," + y(Number(v));
      }).filter(Boolean).join(" ");
      if (points) svg.innerHTML += '<polyline points="' + points + '" fill="none" stroke="' + COLORS[ci % COLORS.length] + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
      const row = rows.find(r => r.etf_code === code);
      legend.innerHTML += '<span><i style="background:' + COLORS[ci % COLORS.length] + '"></i>' + code + " " + (row.etf_name || "") + "</span>";
    });
    if (dates.length) {
      svg.innerHTML += '<text x="' + left + '" y="' + (H - 10) + '" class="axis-label">' + dates[0] + '</text>' +
        '<text x="' + (W - right - 70) + '" y="' + (H - 10) + '" class="axis-label">' + dates[dates.length - 1] + "</text>";
    }
  }

  function render() { renderChart(); renderSummary(); renderTable(); }

  async function query() {
    const c = client(); if (!c) return;
    $("msg").textContent = "查詢中…";
    const start = $("start").value, end = $("end").value;
    const result = await c.from("portfolio_daily_snapshots").select("*").gte("snapshot_date", start).lte("snapshot_date", end).order("snapshot_date", { ascending: true }).order("etf_code", { ascending: true });
    if (result.error) { $("msg").textContent = "查詢失敗：" + result.error.message; return; }
    allRows = result.data || []; selected = new Set(codeSet()); $("msg").textContent = allRows.length ? "" : "此日期區間尚無每日快照；請先執行每日快照流程。";
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
