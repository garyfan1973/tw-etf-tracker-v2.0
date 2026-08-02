// 我的持股：以交易紀錄計算持股、現值與損益（FIFO）
(function () {
  const $ = (id) => document.getElementById(id);
  let transactions = [];
  let editingId = null;
  let loadedFor = null;   // 已載入哪個 user 的資料
  let portfolioConfig = {
    brokerage: { fee_rate: 0.000399, sell_fee_rate: 0.000399, minimum_fee: 1 },
    securities_transaction_tax: { rate: 0.001, enabled: true }
  };
  const configReady = loadPortfolioConfig();
  let etfDirectory = [];

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

  async function loadPortfolioConfig() {
    try {
      const res = await fetch("portfolio_config.json", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const b = data && data.brokerage;
        const tax = data && data.securities_transaction_tax;
        if (b && Number.isFinite(Number(b.fee_rate)) && Number.isFinite(Number(b.minimum_fee))) {
          portfolioConfig = {
            brokerage: {
              fee_rate: Number(b.fee_rate),
              sell_fee_rate: Number.isFinite(Number(b.sell_fee_rate)) ? Number(b.sell_fee_rate) : Number(b.fee_rate),
              minimum_fee: Number(b.minimum_fee)
            },
            securities_transaction_tax: {
              rate: tax && Number.isFinite(Number(tax.rate)) ? Number(tax.rate) : 0.001,
              enabled: !(tax && tax.enabled === false)
            }
          };
        }
      }
    } catch (e) {
      // 直接以 file:// 開啟時可能無法 fetch JSON，使用上方預設值即可。
    }
  }

  function feeFor(shares, unitPrice, rate) {
    if (unitPrice == null || !Number.isFinite(Number(unitPrice))) return null;
    const b = portfolioConfig.brokerage;
    return Math.max(Number(b.minimum_fee), Math.round(shares * Number(unitPrice) * Number(rate)));
  }

  async function ensureData(codes) {
    for (const c of codes) { if (window.ETFData) await window.ETFData.ensure(c); }
  }

  async function loadEtfDirectory() {
    try {
      const res = await fetch("etf_directory.json", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        etfDirectory = Array.isArray(data.etfs) ? data.etfs : [];
      }
    } catch (e) { /* 清單尚未產生時使用 data.js 退回清單 */ }
    if (!etfDirectory.length && window.DATA && window.DATA.etfs) {
      etfDirectory = Object.entries(window.DATA.etfs).map(([code, etf]) => ({ code, name: etf.name || code }));
    }
    $("etfOptions").innerHTML = etfDirectory.flatMap((x) => [
      '<option value="' + x.code + '" label="' + x.name + '"></option>',
      '<option value="' + x.name + '" label="' + x.code + '"></option>'
    ]).join("");
  }

  async function loadHoldings() {
    const c = sb(); if (!c) return;
    const { data, error } = await c.from("portfolio_transactions").select("*").order("trade_date", { ascending: false }).order("created_at", { ascending: false });
    transactions = error ? [] : (data || []);
    await ensureData([...new Set(transactions.map((t) => t.etf_code))]);
    render();
  }

  // 依交易日期與建立時間排序，將賣出按 FIFO 分配到最早尚未結清的買入批次。
  function derivePortfolio() {
    const byCode = {};
    transactions.forEach((t) => { (byCode[t.etf_code] = byCode[t.etf_code] || []).push(t); });
    const lotsByCode = {}, sales = [], salesByCode = {};
    Object.keys(byCode).forEach((code) => {
      const txs = byCode[code].slice().sort((a, b) => {
        const d = String(a.trade_date || "").localeCompare(String(b.trade_date || ""));
        return d || String(a.created_at || "").localeCompare(String(b.created_at || ""));
      });
      const lots = [];
      txs.forEach((t) => {
        const qty = Number(t.shares) || 0;
        if (t.side === "buy") {
          lots.push({ tx: t, original: qty, remaining: qty, feeRemaining: Number(t.fee) || 0 });
          return;
        }
        let left = qty, basis = 0, valid = true;
        while (left > 0) {
          const lot = lots.find((x) => x.remaining > 0);
          if (!lot) { valid = false; break; }
          const take = Math.min(left, lot.remaining);
          const unit = lot.tx.price == null ? null : Number(lot.tx.price);
          if (unit == null || !Number.isFinite(unit)) valid = false;
          else basis += take * unit + lot.feeRemaining * (take / lot.remaining);
          const oldRemaining = lot.remaining;
          const oldFeeRemaining = lot.feeRemaining;
          lot.remaining = oldRemaining - take;
          lot.feeRemaining = oldRemaining > 0
            ? oldFeeRemaining * (lot.remaining / oldRemaining)
            : 0;
          left -= take;
        }
        const proceeds = t.price == null ? null : qty * Number(t.price) - (Number(t.fee) || 0) - (Number(t.tax) || 0);
        const sale = { t, basis: valid && proceeds != null ? basis : null, realized: valid && proceeds != null ? proceeds - basis : null };
        sales.push(sale);
        (salesByCode[code] = salesByCode[code] || []).push(sale);
      });
      lotsByCode[code] = lots.filter((lot) => lot.remaining > 0).map((lot) => ({
        ...lot.tx,
        buy_date: lot.tx.trade_date,
        avg_cost: lot.tx.price,
        shares: lot.remaining,
        fee: lot.feeRemaining,
        original_shares: lot.original
      }));
    });
    return {
      lotsByCode,
      sales: sales.sort((a, b) => String(b.t.trade_date || "").localeCompare(String(a.t.trade_date || ""))),
      salesByCode
    };
  }

  function compute(h) {
    const D = window.DATA, etf = D && D.etfs && D.etfs[h.etf_code];
    const name = etf ? etf.name : h.etf_code;
    const snaps = (etf && etf.snapshots) || [];
    const self = snaps.length ? snaps[snaps.length - 1].self : null;
    const priceNow = self ? self.close : null;
    const chPct = self ? self.changePct : null;
    const shares = Number(h.shares) || 0;
    const tradeValue = (h.avg_cost != null) ? shares * Number(h.avg_cost) : null;
    const fee = h.fee != null ? Number(h.fee) : feeFor(shares, h.avg_cost, portfolioConfig.brokerage.fee_rate);
    const cost = (tradeValue != null && fee != null) ? tradeValue + fee : null;
    const mkt = (priceNow != null) ? shares * priceNow : null;
    const sellFee = feeFor(shares, priceNow, portfolioConfig.brokerage.sell_fee_rate);
    const taxConfig = portfolioConfig.securities_transaction_tax;
    const sellTax = (mkt != null && taxConfig.enabled) ? Math.round(mkt * Number(taxConfig.rate)) : 0;
    const sellCosts = (mkt != null && sellFee != null) ? sellFee + sellTax : null;
    const currentValue = (mkt != null && sellCosts != null) ? mkt - sellCosts : null;
    const pl = (currentValue != null && cost != null) ? currentValue - cost : null;
    const plp = (pl != null && cost) ? pl / cost * 100 : null;
    const divs = (etf && etf.dividends) || [];
    const t = today();
    const past = divs.filter((d) => d.ex && d.ex < t).sort((a, b) => a.ex < b.ex ? 1 : -1);
    const fut = divs.filter((d) => d.ex && d.ex >= t).sort((a, b) => a.ex < b.ex ? -1 : 1);
    const last = past[0] || null, next = fut[0] || null;
    const ya = minus365(t);
    const ttmPer = divs.filter((d) => d.ex && d.ex <= t && d.ex >= ya && d.amount != null).reduce((s, d) => s + d.amount, 0);
    const ttm = shares * ttmPer;
    const yoc = cost ? ttm / cost * 100 : null;
    return { h, name, priceNow, chPct, shares, tradeValue, fee, cost, mkt, sellFee, sellTax, sellCosts, currentValue, pl, plp, last, next, ttm, yoc };
  }

  function renderSummary(rows) {
    let tCost = 0, tValue = 0, hasCost = false, hasValue = false;
    rows.forEach((r) => {
      if (r.cost != null) { tCost += r.cost; hasCost = true; }
      if (r.currentValue != null) { tValue += r.currentValue; hasValue = true; }
    });
    const tPl = (hasValue && hasCost) ? tValue - tCost : null;
    const tPlp = (tPl != null && tCost) ? tPl / tCost * 100 : null;
    const kpi = (n, l, cls) => '<div class="kpi"><div class="n ' + (cls || "") + '">' + n + '</div><div class="l">' + l + '</div></div>';
    $("summary").innerHTML =
      kpi(hasValue ? money(tValue) : "—", "總現值") +
      kpi(hasCost ? money(tCost) : "—", "總成本") +
      kpi(tPl != null ? (tPl > 0 ? "+" : "") + money(tPl) : "—", "總損益" + (tPlp != null ? "（" + pct(tPlp) + "）" : ""), plCls(tPl));
  }

  // 依 ETF 分組：配息資訊只顯示一次，各筆買入列在下方，另附該檔合計
  function etfCard(code, rs, sales) {
    const first = rs[0];
    const g = (k, v, cls, boxCls) => '<div class="' + (boxCls || "") + '"><div class="k">' + k + '</div><div class="v ' + (cls || "") + '">' + v + '</div></div>';
    let shares = 0, fee = 0, cost = 0, value = 0, sellCosts = 0, ttm = 0;
    let hasCost = false, hasFee = false, hasValue = false, hasSellCosts = false;
    rs.forEach((r) => {
      shares += r.shares;
      if (r.fee != null) { fee += r.fee; hasFee = true; }
      if (r.cost != null) { cost += r.cost; hasCost = true; }
      if (r.currentValue != null) { value += r.currentValue; hasValue = true; }
      if (r.sellCosts != null) { sellCosts += r.sellCosts; hasSellCosts = true; }
      ttm += r.ttm || 0;
    });
    const pl = (hasValue && hasCost) ? value - cost : null;
    const plp = (pl != null && cost) ? pl / cost * 100 : null;
    const yoc = cost ? ttm / cost * 100 : null;
    const last = first.last, next = first.next;

    let html = '<div class="hcard">';
    // 標題 + 現價（每檔一次）
    html += '<div class="top"><span class="nm">' + first.name + '</span><span class="cd">' + code + '</span>' +
      '<span class="cd" style="margin-left:auto;">現價 ' + price(first.priceNow) +
      (first.chPct != null ? ' <span class="' + plCls(first.chPct) + '">' + pct(first.chPct) + "</span>" : "") + "</span></div>";
    // 配息資訊（每檔一次）
    const expected = next && next.amount != null ? shares * Number(next.amount) : null;
    html += '<div class="divline">配息｜最近除息 <b>' + (last ? last.ex : "—") + "</b>・發放 <b>" +
      (last && last.pay ? last.pay : "—") + "</b>・每股 <b>" + (last && last.amount != null ? price(last.amount) + " 元" : "—") +
      "</b>　下次除息 <b>" + (next ? next.ex : "—") + "</b>・發放 <b>" + (next && next.pay ? next.pay : "—") +
      "</b>・每股 <b>" + (next && next.amount != null ? price(next.amount) + " 元" : "—") + "</b>" +
      (expected != null ? "・預計可配息 <b>" + money(expected) + " 元</b>" : "") + "</div>";
    // 該檔合計
    html += '<div class="sec"><div class="h">合計（' + rs.length + " 筆）</div><div class=\"grid\">" +
      g("持有股數", num(shares), "", "key-field") +
      g("投入成本", hasCost ? money(cost) + " 元" : "—") +
      g("現值", hasValue ? money(value) + " 元" : "—") +
      g("損益", pl != null ? (pl > 0 ? "+" : "") + money(pl) + " 元" : "—", plCls(pl)) +
      g("報酬率%", pct(plp), plCls(plp)) +
      '<div class="expand-cell"><button class="lot-toggle" type="button" data-toggle-lots="' + code + '" aria-expanded="false">展開</button></div>' +
      "</div></div>";
    // 各筆買入：預設收合，需要時逐檔展開
    html += '<div class="lots lot-section" data-lots="' + code + '" hidden>' +
      '<div class="detail-heading">各筆買入（' + rs.length + " 筆）</div>";
    rs.forEach((r) => {
      const h = r.h;
      const buyLabel = h.buy_date ? "買入 " + h.buy_date : "買入日期（定期定額）";
      html += '<div class="lot"><div class="lot-top"><span class="cd">' + buyLabel + "</span>" +
        '<span class="sp"><button class="icon-btn" type="button" data-edit="' + h.id + '" title="編輯這筆買入" aria-label="編輯這筆買入">✎</button>' +
        '<button class="icon-btn delete" type="button" data-del="' + h.id + '" title="刪除這筆買入" aria-label="刪除這筆買入">🗑</button></span></div>' +
        '<div class="grid">' +
        g("持有股數", num(r.shares), "", "key-field") +
        g("買入均價", h.avg_cost != null ? price(h.avg_cost) : "—", "", "key-field") +
        g("投入成本", r.cost != null ? money(r.cost) + " 元" : "—") +
        g("現值", r.currentValue != null ? money(r.currentValue) + " 元" : "—") +
        g("損益", r.pl != null ? (r.pl > 0 ? "+" : "") + money(r.pl) + " 元" : "—", plCls(r.pl)) +
        g("報酬率%", pct(r.plp), plCls(r.plp)) +
        "</div>" + (h.note ? '<div class="note">📝 ' + h.note + "</div>" : "") + "</div>";
    });
    if (sales && sales.length) {
      html += '<div class="sale-subhead">賣出紀錄（' + sales.length + " 筆）</div>" +
        '<div class="trade-history" data-sales="' + code + '">';
      sales.slice().sort((a, b) => String(b.t.trade_date || "").localeCompare(String(a.t.trade_date || ""))).forEach((s) => {
        const t = s.t;
        html += '<div class="trade-row"><span class="sell">賣出</span>　' + (t.trade_date || "—") +
          "　" + num(t.shares) + " 股　成交均價 " + (t.price != null ? price(t.price) : "—") + " 元" +
          (s.realized != null ? '　已實現損益 <span class="' + plCls(s.realized) + '">' + (s.realized > 0 ? "+" : "") + money(s.realized) + " 元</span>" : "") +
          '　<button class="icon-btn delete" type="button" data-del="' + t.id + '" title="刪除這筆賣出" aria-label="刪除這筆賣出">🗑</button>' +
          (t.note ? '<div class="note">📝 ' + t.note + "</div>" : "") + "</div>";
      });
      html += "</div>";
    }
    html += "</div></div>";
    return html;
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
    const portfolio = derivePortfolio();
    const rows = Object.keys(portfolio.lotsByCode).flatMap((code) => portfolio.lotsByCode[code].map(compute));
    renderSummary(rows);
    const list = $("list");
    if (!rows.length) {
      list.innerHTML = '<div class="panel empty">目前沒有未結清持股，可用上方表單新增買入。</div>';
    } else {
      const groups = {};
      rows.forEach((r) => { (groups[r.h.etf_code] = groups[r.h.etf_code] || []).push(r); });
      list.innerHTML = Object.keys(groups).map((code) => etfCard(code, groups[code], portfolio.salesByCode[code] || [])).join("");
    }
    list.querySelectorAll("[data-edit]").forEach((el) => el.onclick = () => startEdit(el.dataset.edit));
    list.querySelectorAll("[data-del]").forEach((el) => el.onclick = () => del(el.dataset.del));
    list.querySelectorAll("[data-toggle-lots]").forEach((el) => el.onclick = () => {
      const box = list.querySelector('[data-lots="' + el.dataset.toggleLots + '"]');
      const open = box.hidden;
      box.hidden = !open;
      el.setAttribute("aria-expanded", String(open));
      el.textContent = open ? "收合" : "展開";
    });
  }

  function resetForm() {
    editingId = null;
    ["fCode", "fShares", "fDate", "fPrice", "fNote"].forEach((id) => $(id).value = "");
    $("fSideBuy").checked = true; $("fSideBuy").disabled = false; $("fSideSell").disabled = false;
    $("fMsg").textContent = ""; $("formTitle").textContent = "新增交易";
    $("fSubmit").textContent = "新增買入"; $("fCancel").style.display = "none";
    $("fCode").disabled = false; updateFormMode();
  }

  function startEdit(id) {
    const h = transactions.find((x) => String(x.id) === String(id));
    if (!h || h.side !== "buy") return;
    const currentLot = (derivePortfolio().lotsByCode[h.etf_code] || []).find((x) => String(x.id) === String(id));
    if (!currentLot || Number(currentLot.shares) < Number(h.shares)) {
      alert("這筆買入已有部分或全部賣出，為保留 FIFO 歷史，目前不能編輯。");
      return;
    }
    editingId = id;
    $("fSideBuy").checked = true; $("fSideBuy").disabled = true; $("fSideSell").disabled = true;
    $("fCode").value = h.etf_code; $("fCode").disabled = true;
    $("fShares").value = h.shares; $("fDate").value = h.trade_date || "";
    $("fPrice").value = h.price != null ? h.price : ""; $("fNote").value = h.note || "";
    $("formTitle").textContent = "編輯買入 " + h.etf_code;
    $("fSubmit").textContent = "更新"; $("fCancel").style.display = "inline-block";
    updateFormMode();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateFormMode() {
    const sell = $("fSideSell").checked;
    $("fSharesLabel").textContent = sell ? "賣出股數" : "買入股數";
    $("fDateLabel").textContent = sell ? "賣出日期" : "買入日期（選填）";
    $("fPriceLabel").textContent = sell ? "賣出均價" : "買入均價（選填）";
    $("fPrice").placeholder = sell ? "例如 35.2" : "例如 35.2";
    if (!editingId) $("fSubmit").textContent = sell ? "新增賣出" : "新增買入";
  }

  async function submit() {
    const c = sb(); if (!c || !user()) return;
    const msg = $("fMsg"); msg.style.color = "var(--up)";
    const side = $("fSideSell").checked ? "sell" : "buy";
    const rawCode = ($("fCode").value || "").trim();
    const matchedEtf = etfDirectory.find((x) => x.code === rawCode.toUpperCase() || x.name === rawCode);
    const code = matchedEtf ? matchedEtf.code : rawCode.toUpperCase();
    const shares = Number($("fShares").value);
    const date = $("fDate").value || null;
    const tradePrice = $("fPrice").value !== "" ? Number($("fPrice").value) : null;
    const note = ($("fNote").value || "").trim() || null;
    if (!/^[0-9A-Z]{4,6}$/.test(code)) { msg.textContent = "代號格式不正確（4–6 碼英數）"; return; }
    if (!shares || shares <= 0) { msg.textContent = "請填入正確的股數"; return; }
    if (side === "sell" && (tradePrice == null || tradePrice < 0)) { msg.textContent = "賣出時請填入實際成交均價"; return; }
    if (side === "buy" && (tradePrice == null || tradePrice < 0)) { msg.textContent = "買入時請填入成交均價"; return; }
    if (side === "sell" && !date) { msg.textContent = "賣出時請填入賣出日期"; return; }
    msg.style.color = "var(--muted)"; msg.textContent = "處理中…";
    const d = await window.ETFData.ensure(code);
    if (!d) { msg.style.color = "var(--up)"; msg.textContent = "查無此 ETF 代號"; return; }
    if (side === "sell") {
      const available = derivePortfolio().lotsByCode[code] || [];
      const totalAvailable = available.reduce((s, lot) => s + (Number(lot.shares) || 0), 0);
      if (shares > totalAvailable) { msg.style.color = "var(--up)"; msg.textContent = "賣出股數超過目前可賣股數（" + num(totalAvailable) + " 股）"; return; }
    }
    const feeRate = side === "sell" ? portfolioConfig.brokerage.sell_fee_rate : portfolioConfig.brokerage.fee_rate;
    const fee = tradePrice == null ? 0 : feeFor(shares, tradePrice, feeRate);
    const tax = side === "sell" && portfolioConfig.securities_transaction_tax.enabled
      ? Math.round(shares * tradePrice * Number(portfolioConfig.securities_transaction_tax.rate)) : 0;
    const payload = { etf_code: code, side, trade_date: side === "buy" ? date : date || today(), shares, price: tradePrice, fee, tax, note };
    const res = editingId
      ? await c.from("portfolio_transactions").update(payload).eq("id", editingId).eq("user_id", user().id)
      : await c.from("portfolio_transactions").insert({ ...payload, user_id: user().id });
    if (res.error) { msg.style.color = "var(--up)"; msg.textContent = "儲存失敗：" + res.error.message; return; }
    resetForm();
    await loadHoldings();
  }

  async function del(id) {
    const t = transactions.find((x) => String(x.id) === String(id));
    if (!t) return;
    if (t.side === "sell") {
      if (!confirm("確定刪除這筆賣出紀錄？刪除後 FIFO 持股會重新計算。")) return;
    } else {
      const lot = derivePortfolio().lotsByCode[t.etf_code] || [];
      const current = lot.find((x) => String(x.id) === String(id));
      const sold = !current || Number(current.shares) < Number(t.shares);
      if (sold) { alert("這筆買入已有部分或全部賣出，為保留交易歷史，目前不能刪除。"); return; }
      if (!confirm("確定刪除這筆買入紀錄？")) return;
    }
    const c = sb();
    await c.from("portfolio_transactions").delete().eq("id", id).eq("user_id", user().id);
    if (String(editingId) === String(id)) resetForm();
    await loadHoldings();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("fSubmit").onclick = submit;
    $("fCancel").onclick = resetForm;
    $("fSideBuy").onchange = updateFormMode;
    $("fSideSell").onchange = updateFormMode;
    updateFormMode();
    loadEtfDirectory();
  });

  // 登入狀態或 ETF 資料變動 → 載入/重繪
  document.addEventListener("etfwatch:change", () => {
    const uid = user() && user().id;
    if (uid && uid !== loadedFor) { loadedFor = uid; configReady.then(loadHoldings); }
    else if (!uid) { loadedFor = null; render(); }
    else render();
  });

  // 保險：auth 若已就緒但事件已錯過
  setTimeout(() => {
    const uid = user() && user().id;
    if (uid && uid !== loadedFor) { loadedFor = uid; configReady.then(loadHoldings); } else configReady.then(render);
  }, 500);
})();
