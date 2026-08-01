// 我的持股：記錄個人部位，配息/市值/損益全部即時計算（存 Supabase holdings 表）
(function () {
  const $ = (id) => document.getElementById(id);
  let holdings = [];
  let editingId = null;
  let loadedFor = null;   // 已載入哪個 user 的資料

  const auth = () => window.ETFAuth;
  const sb = () => auth() && auth().client();
  const user = () => auth() && auth().user();

  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  function minus365(ds) { const d = new Date(ds + "T00:00:00"); d.setDate(d.getDate() - 365); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  const num = (n) => (n == null || isNaN(n)) ? "—" : Number(n).toLocaleString("en-US");
  const money = (n) => (n == null || isNaN(n)) ? "—" : Math.round(n).toLocaleString("en-US");
  const price = (n) => (n == null || isNaN(n)) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n) => (n == null || isNaN(n)) ? "—" : (n > 0 ? "+" : "") + Number(n).toFixed(2) + "%";
  const plCls = (n) => n > 0 ? "up" : n < 0 ? "down" : "";

  async function ensureData(codes) {
    for (const c of codes) { if (window.ETFData) await window.ETFData.ensure(c); }
  }

  async function loadHoldings() {
    const c = sb(); if (!c) return;
    const { data, error } = await c.from("holdings").select("*").order("buy_date", { ascending: false });
    holdings = error ? [] : (data || []);
    await ensureData([...new Set(holdings.map((h) => h.etf_code))]);
    render();
  }

  function compute(h) {
    const D = window.DATA, etf = D && D.etfs && D.etfs[h.etf_code];
    const name = etf ? etf.name : h.etf_code;
    const snaps = (etf && etf.snapshots) || [];
    const self = snaps.length ? snaps[snaps.length - 1].self : null;
    const priceNow = self ? self.close : null;
    const chPct = self ? self.changePct : null;
    const shares = Number(h.shares) || 0;
    const cost = (h.avg_cost != null) ? shares * Number(h.avg_cost) : null;
    const mkt = (priceNow != null) ? shares * priceNow : null;
    const pl = (mkt != null && cost != null) ? mkt - cost : null;
    const plp = (pl != null && cost) ? pl / cost * 100 : null;
    const divs = (etf && etf.dividends) || [];
    const t = today();
    const past = divs.filter((d) => d.ex && d.ex <= t).sort((a, b) => a.ex < b.ex ? 1 : -1);
    const fut = divs.filter((d) => d.ex && d.ex > t).sort((a, b) => a.ex < b.ex ? -1 : 1);
    const last = past[0] || null, next = fut[0] || null;
    const ya = minus365(t);
    const ttmPer = divs.filter((d) => d.ex && d.ex <= t && d.ex >= ya && d.amount != null).reduce((s, d) => s + d.amount, 0);
    const ttm = shares * ttmPer;
    const yoc = cost ? ttm / cost * 100 : null;
    const lastAmt = (last && last.amount != null) ? shares * last.amount : null;
    const nextAmt = (next && next.amount != null) ? shares * next.amount : null;
    return { h, name, priceNow, chPct, shares, cost, mkt, pl, plp, last, next, ttm, yoc, lastAmt, nextAmt };
  }

  function renderSummary(rows) {
    let tCost = 0, tMkt = 0, tTtm = 0, hasCost = false, hasMkt = false;
    rows.forEach((r) => {
      if (r.cost != null) { tCost += r.cost; hasCost = true; }
      if (r.mkt != null) { tMkt += r.mkt; hasMkt = true; }
      tTtm += r.ttm || 0;
    });
    const tPl = (hasMkt && hasCost) ? tMkt - tCost : null;
    const tPlp = (tPl != null && tCost) ? tPl / tCost * 100 : null;
    const wYield = tCost ? tTtm / tCost * 100 : null;
    const kpi = (n, l, cls) => '<div class="kpi"><div class="n ' + (cls || "") + '">' + n + '</div><div class="l">' + l + '</div></div>';
    $("summary").innerHTML =
      kpi(hasMkt ? money(tMkt) : "—", "總市值") +
      kpi(hasCost ? money(tCost) : "—", "總成本") +
      kpi(tPl != null ? (tPl > 0 ? "+" : "") + money(tPl) : "—", "總損益" + (tPlp != null ? "（" + pct(tPlp) + "）" : ""), plCls(tPl)) +
      kpi(money(tTtm), "預估年配息") +
      kpi(wYield != null ? wYield.toFixed(2) + "%" : "—", "加權殖利率");
  }

  function card(r) {
    const h = r.h;
    const g = (k, v, cls) => '<div><div class="k">' + k + '</div><div class="v ' + (cls || "") + '">' + v + '</div></div>';
    const divSec =
      '<div class="sec"><div class="h">配息</div><div class="grid">' +
      g("最近除息", r.last ? r.last.ex : "—") +
      g("最近發放", (r.last && r.last.pay) ? r.last.pay : "—") +
      g("最近每股配息", (r.last && r.last.amount != null) ? price(r.last.amount) + " 元" : "—") +
      g("最近發放金額", r.lastAmt != null ? money(r.lastAmt) + " 元" : "—") +
      g("下次除息", r.next ? r.next.ex : "—") +
      g("下次發放", (r.next && r.next.pay) ? r.next.pay : "—") +
      g("下次預估金額", r.nextAmt != null ? money(r.nextAmt) + " 元" : "—") +
      g("個人殖利率", r.yoc != null ? r.yoc.toFixed(2) + "%" : "—") +
      "</div></div>";
    return '<div class="hcard">' +
      '<div class="top"><span class="nm">' + r.name + '</span><span class="cd">' + h.etf_code + '</span>' +
        '<span class="cd">· 買入 ' + (h.buy_date || "—") + '</span>' +
        '<span class="sp"><a class="small" data-edit="' + h.id + '">編輯</a>' +
        '<a class="small" data-del="' + h.id + '" style="color:var(--up);">刪除</a></span></div>' +
      '<div class="grid">' +
        g("持有股數", num(r.shares)) +
        g("買入均價", h.avg_cost != null ? price(h.avg_cost) : "—") +
        g("投入成本", r.cost != null ? money(r.cost) + " 元" : "—") +
        g("現價", price(r.priceNow) + (r.chPct != null ? ' <span class="' + plCls(r.chPct) + '" style="font-size:12px;">' + pct(r.chPct) + "</span>" : "")) +
        g("市值", r.mkt != null ? money(r.mkt) + " 元" : "—") +
        g("損益", r.pl != null ? (r.pl > 0 ? "+" : "") + money(r.pl) + " 元" : "—", plCls(r.pl)) +
        g("損益%", pct(r.plp), plCls(r.plp)) +
        g("過去12月年配息", r.ttm ? money(r.ttm) + " 元" : "—") +
      "</div>" + divSec +
      (h.note ? '<div class="note">📝 ' + h.note + "</div>" : "") +
      "</div>";
  }

  function render() {
    const a = auth();
    const gate = $("gate"), app = $("app");
    if (!a || !a.isConfigured()) {
      gate.style.display = "block"; app.style.display = "none";
      gate.innerHTML = '<div class="empty">會員功能尚未設定（需要 Supabase 設定）。</div>';
      return;
    }
    if (!a.user()) {
      gate.style.display = "block"; app.style.display = "none";
      gate.innerHTML = '<div class="empty">請先用右上角「登入 / 註冊」登入，即可管理個人持股。</div>';
      return;
    }
    gate.style.display = "none"; app.style.display = "block";
    const rows = holdings.map(compute);
    renderSummary(rows);
    const list = $("list");
    list.innerHTML = rows.length
      ? rows.map(card).join("")
      : '<div class="panel empty">還沒有持股記錄，用上方表單新增第一筆。</div>';
    list.querySelectorAll("[data-edit]").forEach((el) => el.onclick = () => startEdit(el.dataset.edit));
    list.querySelectorAll("[data-del]").forEach((el) => el.onclick = () => del(el.dataset.del));
  }

  function resetForm() {
    editingId = null;
    ["fCode", "fShares", "fDate", "fCost", "fNote"].forEach((id) => $(id).value = "");
    $("fMsg").textContent = ""; $("formTitle").textContent = "新增持股";
    $("fSubmit").textContent = "新增"; $("fCancel").style.display = "none";
    $("fCode").disabled = false; $("fDate").value = today();
  }

  function startEdit(id) {
    const h = holdings.find((x) => String(x.id) === String(id));
    if (!h) return;
    editingId = id;
    $("fCode").value = h.etf_code; $("fCode").disabled = true;
    $("fShares").value = h.shares; $("fDate").value = h.buy_date || "";
    $("fCost").value = h.avg_cost != null ? h.avg_cost : ""; $("fNote").value = h.note || "";
    $("formTitle").textContent = "編輯持股 " + h.etf_code;
    $("fSubmit").textContent = "更新"; $("fCancel").style.display = "inline-block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    const c = sb(); if (!c || !user()) return;
    const msg = $("fMsg"); msg.style.color = "var(--up)";
    const code = ($("fCode").value || "").trim().toUpperCase();
    const shares = Number($("fShares").value);
    const date = $("fDate").value || null;
    const cost = $("fCost").value !== "" ? Number($("fCost").value) : null;
    const note = ($("fNote").value || "").trim() || null;
    if (!editingId && !/^[0-9A-Z]{4,6}$/.test(code)) { msg.textContent = "代號格式不正確（4–6 碼英數）"; return; }
    if (!shares || shares <= 0) { msg.textContent = "請填入正確的持有股數"; return; }
    msg.style.color = "var(--muted)"; msg.textContent = "處理中…";
    if (!editingId) {
      const d = await window.ETFData.ensure(code);
      if (!d) { msg.style.color = "var(--up)"; msg.textContent = "查無此 ETF 代號"; return; }
    }
    const res = editingId
      ? await c.from("holdings").update({ shares, avg_cost: cost, buy_date: date, note }).eq("id", editingId).eq("user_id", user().id)
      : await c.from("holdings").insert({ user_id: user().id, etf_code: code, shares, avg_cost: cost, buy_date: date, note });
    if (res.error) { msg.style.color = "var(--up)"; msg.textContent = "儲存失敗：" + res.error.message; return; }
    resetForm();
    await loadHoldings();
  }

  async function del(id) {
    if (!confirm("確定刪除這筆持股記錄？")) return;
    const c = sb();
    await c.from("holdings").delete().eq("id", id).eq("user_id", user().id);
    if (String(editingId) === String(id)) resetForm();
    await loadHoldings();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("fSubmit").onclick = submit;
    $("fCancel").onclick = resetForm;
    $("fDate").value = today();
  });

  // 登入狀態或 ETF 資料變動 → 載入/重繪
  document.addEventListener("etfwatch:change", () => {
    const uid = user() && user().id;
    if (uid && uid !== loadedFor) { loadedFor = uid; loadHoldings(); }
    else if (!uid) { loadedFor = null; render(); }
    else render();
  });

  // 保險：auth 若已就緒但事件已錯過
  setTimeout(() => {
    const uid = user() && user().id;
    if (uid && uid !== loadedFor) { loadedFor = uid; loadHoldings(); } else render();
  }, 500);
})();
