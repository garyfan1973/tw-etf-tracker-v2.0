// 交易紀錄：顯示所有買入與賣出，並以 FIFO 判斷買入是否仍可刪除。
(function () {
  const $ = (id) => document.getElementById(id);
  let transactions = [];
  let loadedFor = null;
  let fromDate = "";
  let toDate = "";
  let etfFilter = "";
  let etfDirectory = [];
  let sortKey = "trade_date";
  let sortDir = -1;
  let config = { feeRate: 0.000399, minFee: 1 };

  const auth = () => window.ETFAuth;
  const sb = () => auth() && auth().client();
  const user = () => auth() && auth().user();
  const money = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const price = (n) => n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  async function loadEtfDirectory() {
    try {
      const r = await fetch("etf_directory.json", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        etfDirectory = Array.isArray(d.etfs) ? d.etfs : [];
      }
    } catch (e) { /* 使用 data.js 退回清單 */ }
    if (!etfDirectory.length && window.DATA && window.DATA.etfs) {
      etfDirectory = Object.entries(window.DATA.etfs).map(([code, etf]) => ({ code, name: etf.name || code }));
    }
    $("txEtfOptions").innerHTML = etfDirectory.flatMap((x) => [
      '<option value="' + x.code + '" label="' + x.name + '"></option>',
      '<option value="' + x.name + '" label="' + x.code + '"></option>'
    ]).join("");
  }

  function etfName(code) {
    const item = etfDirectory.find((x) => x.code === code);
    return item ? item.name : (window.DATA && window.DATA.etfs && window.DATA.etfs[code] ? window.DATA.etfs[code].name : code);
  }

  function sortValue(t, key) {
    if (key === "etf_name") return etfName(t.etf_code);
    if (key === "amount") return Number(t.shares || 0) * Number(t.price || 0);
    if (key === "side") return t.side === "sell" ? "賣出" : "買入";
    if (key === "trade_date" || key === "etf_code") return String(t[key] || "");
    return Number(t[key] || 0);
  }

  function updateSortHeaders() {
    document.querySelectorAll("[data-sort]").forEach((button) => {
      button.setAttribute("aria-sort", button.dataset.sort === sortKey ? (sortDir > 0 ? "ascending" : "descending") : "none");
    });
  }

  async function loadConfig() {
    try {
      const r = await fetch("portfolio_config.json", { cache: "no-store" });
      const d = await r.json();
      if (d.brokerage) {
        config.feeRate = Number(d.brokerage.fee_rate) || config.feeRate;
        config.minFee = Number(d.brokerage.minimum_fee) || config.minFee;
      }
    } catch (e) { /* 使用預設費率 */ }
  }

  async function load() {
    const c = sb();
    if (!c || !user()) return;
    const r = await c.from("portfolio_transactions").select("*").order("trade_date", { ascending: false }).order("created_at", { ascending: false });
    transactions = r.error ? [] : (r.data || []);
    if (window.ETFData) await Promise.all([...new Set(transactions.map((t) => t.etf_code))].map((code) => window.ETFData.ensure(code)));
    render();
  }

  function currentLots() {
    const byCode = {};
    transactions.forEach((t) => (byCode[t.etf_code] = byCode[t.etf_code] || []).push(t));
    const result = {};
    Object.keys(byCode).forEach((code) => {
      const lots = [];
      byCode[code].slice().sort((a, b) => String(a.trade_date || "").localeCompare(String(b.trade_date || "")) || String(a.created_at || "").localeCompare(String(b.created_at || ""))).forEach((t) => {
        if (t.side === "buy") lots.push({ id: t.id, original: Number(t.shares) || 0, remaining: Number(t.shares) || 0 });
        else {
          let left = Number(t.shares) || 0;
          while (left > 0) {
            const lot = lots.find((x) => x.remaining > 0);
            if (!lot) break;
            const take = Math.min(left, lot.remaining);
            lot.remaining -= take;
            left -= take;
          }
        }
      });
      result[code] = lots;
    });
    return result;
  }

  function render() {
    const a = auth();
    if (!a || !a.isConfigured()) { $("gate").style.display = "block"; $("app").style.display = "none"; $("gate").innerHTML = '<div class="empty">會員功能尚未設定（需要 Supabase 設定）。</div>'; return; }
    if (!a.user()) { $("gate").style.display = "block"; $("app").style.display = "none"; $("gate").innerHTML = '<div class="empty">請先用右上角「登入 / 註冊」登入，即可查看交易紀錄。</div>'; return; }
    $("gate").style.display = "none"; $("app").style.display = "block";
    const body = $("rows");
    const matchedEtf = etfDirectory.find((x) => x.code === etfFilter.toUpperCase() || x.name === etfFilter);
    const codeFilter = matchedEtf ? matchedEtf.code : etfFilter.toUpperCase();
    const visible = transactions.filter((t) => (!fromDate || String(t.trade_date || "") >= fromDate) && (!toDate || String(t.trade_date || "") <= toDate) && (!codeFilter || t.etf_code === codeFilter));
    visible.sort((a, b) => {
      const av = sortValue(a, sortKey), bv = sortValue(b, sortKey);
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
    updateSortHeaders();
    $("empty").style.display = visible.length ? "none" : "block";
    $("filterSummary").textContent = visible.length + " / " + transactions.length + " 筆";
    body.innerHTML = visible.map((t) => {
      const gross = Number(t.shares || 0) * Number(t.price || 0);
      const net = t.side === "sell" ? gross - Number(t.fee || 0) - Number(t.tax || 0) : gross + Number(t.fee || 0);
      return '<tr><td>' + esc(t.trade_date || "—") + '</td><td class="' + (t.side === "sell" ? "sell" : "buy") + '">' + (t.side === "sell" ? "賣出" : "買入") +
        '</td><td>' + esc(t.etf_code) + '</td><td>' + esc(etfName(t.etf_code)) + '</td><td class="num">' + num(t.shares) + '</td><td class="num">' + price(t.price) +
        '</td><td class="num">' + money(t.fee) + ' 元</td><td class="num">' + money(t.tax) + ' 元</td><td class="num">' + money(net) + ' 元</td><td class="note" title="' + esc(t.note || "") + '">' + esc(t.note || "—") +
        '</td><td><a class="delete" data-delete="' + esc(t.id) + '">刪除</a></td></tr>';
    }).join("");
    body.querySelectorAll("[data-delete]").forEach((el) => el.onclick = () => remove(el.dataset.delete));
  }

  async function remove(id) {
    const t = transactions.find((x) => String(x.id) === String(id));
    if (!t) return;
    if (t.side === "buy") {
      const lot = (currentLots()[t.etf_code] || []).find((x) => String(x.id) === String(id));
      if (!lot || lot.remaining < lot.original) { alert("這筆買入已有部分或全部賣出，為保留 FIFO 歷史，目前不能刪除。"); return; }
      if (!confirm("確定刪除這筆買入紀錄？")) return;
    } else if (!confirm("確定刪除這筆賣出紀錄？刪除後 FIFO 持股會重新計算。")) return;
    const r = await sb().from("portfolio_transactions").delete().eq("id", id).eq("user_id", user().id);
    if (r.error) { alert("刪除失敗：" + r.error.message); return; }
    await load();
  }

  document.addEventListener("etfwatch:change", () => {
    const uid = user() && user().id;
    if (uid && uid !== loadedFor) { loadedFor = uid; loadConfig().then(load); }
    else if (!uid) { loadedFor = null; render(); }
  });
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-sort]").forEach((button) => button.onclick = () => {
      if (sortKey === button.dataset.sort) sortDir *= -1;
      else { sortKey = button.dataset.sort; sortDir = sortKey === "trade_date" ? -1 : 1; }
      render();
    });
    $("filterBtn").onclick = () => {
      fromDate = $("fromDate").value || "";
      toDate = $("toDate").value || "";
      etfFilter = $("etfFilter").value.trim();
      if (fromDate && toDate && fromDate > toDate) {
        alert("開始日期不可晚於結束日期。");
        return;
      }
      render();
    };
    $("clearFilterBtn").onclick = () => {
      $("fromDate").value = "";
      $("toDate").value = "";
      $("etfFilter").value = "";
      fromDate = ""; toDate = ""; etfFilter = "";
      render();
    };
    loadEtfDirectory();
  });
  setTimeout(() => {
    const uid = user() && user().id;
    if (uid && uid !== loadedFor) { loadedFor = uid; loadConfig().then(load); }
    else render();
  }, 500);
})();
