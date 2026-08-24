// 多市場持股：台股、台灣 ETF、美股與美國 ETF；依原幣分開計算。
(function () {
  const $ = (id) => document.getElementById(id);
  const auth = () => window.ETFAuth;
  const sb = () => auth() && auth().client();
  const user = () => auth() && auth().user();
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const number = (n, digits = 2) => n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: digits });
  const price = (n) => n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const pct = (n) => n == null || !Number.isFinite(Number(n)) ? "—" : `${Number(n) > 0 ? "+" : ""}${Number(n).toFixed(2)}%`;
  const cls = (n) => Number(n) > 0 ? "up" : Number(n) < 0 ? "down" : "";
  const currencyMark = (currency) => currency === "USD" ? "US$" : "NT$";
  const assetKey = (row) => `${row.market}:${row.symbol}`;
  const marketLabel = (market) => market === "us" ? "美國" : "台灣";
  const typeLabel = (type) => type === "stock" ? "股票" : "ETF";

  let assets = [];
  let transactions = [];
  let quotes = new Map();
  let dividends = new Map();
  let editingId = null;
  let loadedFor = null;
  let readyPromise = null;
  let formContext = "tw:etf:buy";
  let portfolioConfig = { brokerage:{fee_rate:.000399,sell_fee_rate:.000399,minimum_fee:1} };

  function normalize(row) {
    const symbol = String(row.symbol || row.etf_code || "").toUpperCase();
    const market = String(row.market || "tw").toLowerCase();
    const assetType = String(row.asset_type || "etf").toLowerCase();
    return { ...row, symbol, etf_code:symbol, market, asset_type:assetType,
      currency:row.currency || (market === "us" ? "USD" : "TWD") };
  }

  async function loadConfig() {
    try {
      const r = await fetch("portfolio_config.json", {cache:"no-store"});
      if (r.ok) portfolioConfig = {...portfolioConfig, ...(await r.json())};
    } catch (_) { /* 使用預設費率 */ }
  }

  async function loadAssets() {
    try {
      const r = await fetch("trade_assets.json", {cache:"force-cache"});
      const data = await r.json();
      assets = Array.isArray(data.assets) ? data.assets.map((asset) => ({ ...asset,
        market:String(asset.market || "tw").toLowerCase(), asset_type:String(asset.asset_type || "etf").toLowerCase(),
        symbol:String(asset.symbol || "").toUpperCase(), currency:asset.currency || (asset.market === "us" ? "USD" : "TWD")
      })).filter((asset) => asset.symbol) : [];
    } catch (_) { assets = []; }
    renderAssetOptions();
  }

  function filteredAssets() {
    const market = $("fMarket").value, type = $("fAssetType").value;
    return assets.filter((a) => a.market === market && a.asset_type === type);
  }

  function renderAssetOptions() {
    const list = filteredAssets();
    $("assetOptions").innerHTML = list.flatMap((a) => [
      `<option value="${esc(a.symbol)}" label="${esc(a.name)} · ${esc(a.exchange || "")}"></option>`,
      `<option value="${esc(a.name)}" label="${esc(a.symbol)} · ${esc(a.exchange || "")}"></option>`
    ]).join("");
    updateMarketFields();
  }

  function resolveAsset(raw, market = $("fMarket").value, type = $("fAssetType").value) {
    const value = String(raw || "").trim();
    return assets.find((a) => a.market === market && a.asset_type === type &&
      (a.symbol === value.toUpperCase() || a.name === value)) || null;
  }

  function metadata(row) {
    return assets.find((a) => a.market === row.market && a.symbol === row.symbol && a.asset_type === row.asset_type) ||
      {symbol:row.symbol,name:row.asset_name || row.symbol,market:row.market,asset_type:row.asset_type,exchange:row.exchange || ""};
  }

  async function fetchQuote(row) {
    const key = assetKey(row);
    if (quotes.has(key)) return;
    const market = row.market.toUpperCase();
    try {
      let response = market === "US"
        ? await fetch(`/api/market?market=${market}&code=${encodeURIComponent(row.symbol)}`, {cache:"no-store"})
        : await fetch(`price-history/${market}/${encodeURIComponent(row.symbol)}.json`, {cache:"no-store"});
      if (!response.ok && market !== "US") response = await fetch(`/api/market?market=${market}&code=${encodeURIComponent(row.symbol)}`, {cache:"no-store"});
      if (!response.ok) throw new Error("行情來源無回應");
      const data = await response.json();
      if (data.ok === false) throw new Error(data.error || "行情來源無資料");
      const rows = data.rows || [];
      const latest = rows[rows.length - 1] || null, prior = rows[rows.length - 2] || null;
      quotes.set(key, latest ? {price:Number(latest.close), changePct:prior && prior.close ? (Number(latest.close) / Number(prior.close) - 1) * 100 : null, date:latest.date} : null);
    } catch (_) { quotes.set(key, null); }
  }

  async function fetchDividends(row) {
    const key = assetKey(row);
    if (dividends.has(key)) return;
    const legacy = row.market === "tw" && window.DATA && window.DATA.etfs && window.DATA.etfs[row.symbol];
    let events = legacy ? (legacy.dividends || []).map((d) => ({exDate:d.ex,payDate:d.pay || null,amount:d.amount,currency:"TWD",source:"MoneyDJ"})) : [];
    try {
      const response = await fetch(`/api/dividends?market=${row.market.toUpperCase()}&type=${row.asset_type}&code=${encodeURIComponent(row.symbol)}`, {cache:"no-store"});
      const data = await response.json();
      if (data.ok && Array.isArray(data.events)) {
        const byKey = new Map(events.map((d) => [`${d.exDate}:${d.amount}`, d]));
        data.events.forEach((d) => byKey.set(`${d.exDate}:${d.amount}`, {...(byKey.get(`${d.exDate}:${d.amount}`) || {}), ...d}));
        events = [...byKey.values()];
      }
    } catch (_) { /* 保留既有 ETF 配息 */ }
    dividends.set(key, events.sort((a,b) => String(a.exDate).localeCompare(String(b.exDate))));
  }

  async function loadHoldings() {
    const c = sb(); if (!c || !user()) return;
    const result = await c.from("portfolio_transactions").select("*").order("trade_date", {ascending:false}).order("created_at", {ascending:false});
    if (result.error) {
      transactions = [];
      $("summary").innerHTML = "";
      $("list").innerHTML = `<div class="panel empty">持股資料載入失敗：${esc(result.error.message || "請稍後再試")}</div>`;
      return;
    }
    transactions = (result.data || []).map(normalize);
    quotes = new Map(); dividends = new Map();
    const unique = [...new Map(transactions.map((row) => [assetKey(row), row])).values()];
    await Promise.all(unique.flatMap((row) => [fetchQuote(row), fetchDividends(row)]));
    render();
  }

  function derivePortfolio() {
    const groups = {};
    transactions.forEach((t) => (groups[assetKey(t)] = groups[assetKey(t)] || []).push(t));
    const lots = {}, sales = {};
    Object.entries(groups).forEach(([key, rows]) => {
      const open = [];
      rows.slice().sort((a,b) => String(a.trade_date || "").localeCompare(String(b.trade_date || "")) || String(a.created_at || "").localeCompare(String(b.created_at || ""))).forEach((t) => {
        const qty = Number(t.shares) || 0;
        if (t.side === "buy") { open.push({tx:t,original:qty,remaining:qty,feeRemaining:Number(t.fee)||0}); return; }
        let left = qty, basis = 0, valid = true;
        while (left > 0) {
          const lot = open.find((x) => x.remaining > 0);
          if (!lot) { valid = false; break; }
          const take = Math.min(left, lot.remaining), old = lot.remaining;
          if (lot.tx.price == null) valid = false;
          else basis += take * Number(lot.tx.price) + lot.feeRemaining * take / old;
          lot.remaining -= take; lot.feeRemaining *= lot.remaining / old; left -= take;
        }
        const proceeds = t.price == null ? null : qty * Number(t.price) - Number(t.fee || 0) - Number(t.tax || 0);
        (sales[key] = sales[key] || []).push({t,basis:valid ? basis:null,realized:valid && proceeds != null ? proceeds-basis:null});
      });
      lots[key] = open.filter((x) => x.remaining > 0).map((x) => ({...x.tx,shares:x.remaining,original_shares:x.original,fee:x.feeRemaining}));
    });
    return {lots,sales};
  }

  function eligibleShares(key, exDate) {
    const rows = transactions.filter((t) => assetKey(t) === key && (!t.trade_date || String(t.trade_date) < String(exDate)))
      .sort((a,b) => String(a.trade_date || "").localeCompare(String(b.trade_date || "")) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
    const lots=[];
    rows.forEach((t) => {
      if (t.side === "buy") lots.push(Number(t.shares)||0);
      else { let left=Number(t.shares)||0; for(let i=0;i<lots.length&&left>0;i++){const take=Math.min(left,lots[i]);lots[i]-=take;left-=take;} }
    });
    return lots.reduce((sum,n)=>sum+n,0);
  }

  function compute(lot) {
    const quote = quotes.get(assetKey(lot)), shares=Number(lot.shares)||0;
    const cost = lot.price == null ? null : shares*Number(lot.price)+Number(lot.fee||0);
    const value = quote ? shares*quote.price : null;
    const pnl = cost != null && value != null ? value-cost : null;
    return {lot,quote,shares,cost,value,pnl,pnlPct:pnl!=null&&cost?pnl/cost*100:null};
  }

  function renderSummary(rows) {
    const byCurrency = {TWD:[],USD:[]};
    rows.forEach((r) => (byCurrency[r.lot.currency] || (byCurrency[r.lot.currency]=[])).push(r));
    $("summary").innerHTML = Object.entries(byCurrency).filter(([,items]) => items.length).flatMap(([currency,items]) => {
      const costItems=items.filter((r)=>r.cost!=null), valueItems=items.filter((r)=>r.value!=null);
      const cost=costItems.reduce((s,r)=>s+r.cost,0), value=valueItems.reduce((s,r)=>s+r.value,0);
      const hasCost=costItems.length===items.length, hasValue=valueItems.length===items.length;
      const pnl=hasCost&&hasValue?value-cost:null, p=pnl!=null&&cost?pnl/cost*100:null, mark=currencyMark(currency);
      const kpi=(v,label,c="")=>`<div class="kpi"><div class="n ${c}">${v}</div><div class="l">${label}</div></div>`;
      return [kpi(hasValue?`${mark} ${number(value)}`:"—",`${currency} 總現值`),kpi(hasCost?`${mark} ${number(cost)}`:"—",`${currency} 總成本`),kpi(pnl!=null?`${pnl>0?"+":""}${mark} ${number(pnl)}`:"—",`總損益（${pct(p)}）`,cls(pnl))];
    }).join("") || '<div class="panel empty">尚無持股資料。</div>';
  }

  function card(key, rows, sales) {
    const first=rows[0], lot=first.lot, meta=metadata(lot), mark=currencyMark(lot.currency), quote=first.quote;
    const shares=rows.reduce((s,r)=>s+r.shares,0), cost=rows.reduce((s,r)=>s+(r.cost||0),0), value=rows.reduce((s,r)=>s+(r.value||0),0), pnl=value-cost, pp=cost?pnl/cost*100:null;
    const divs=dividends.get(key)||[], now=today(), past=divs.filter(d=>d.exDate&&d.exDate<now), future=divs.filter(d=>d.exDate&&d.exDate>=now), last=past[past.length-1], next=future[0];
    const lastEligible=last?eligibleShares(key,last.exDate):0, lastPayout=last&&last.amount!=null?lastEligible*Number(last.amount):null;
    const nextPayout=next&&next.amount!=null?shares*Number(next.amount):null;
    const divLine = (last || next) ? `<div class="divline dividend-line"><span class="dividend-title">股利｜</span>${last?`<span class="dividend-group recent"><span class="group-label">最近除息</span><b>${esc(last.exDate)}</b><span>每股 ${mark} ${price(last.amount)}</span><span>發放 ${esc(last.payDate||"未公告")}</span>${lastPayout!=null?`<span>符合股數 ${number(lastEligible,4)} · 約 ${mark} ${number(lastPayout)}</span>`:""}</span>`:""}${next?`<span class="dividend-group next"><span class="group-label">下次除息</span><b>${esc(next.exDate)}</b><span>每股 ${mark} ${price(next.amount)}</span><span>發放 ${esc(next.payDate||"未公告")}</span>${nextPayout!=null?`<span>目前部位估算 ${mark} ${number(nextPayout)}</span>`:""}</span>`:""}</div>` : `<div class="divline">目前來源尚無已公告的現金股利資料。</div>`;
    const grid=(label,value,c="")=>`<div><div class="k">${label}</div><div class="v ${c}">${value}</div></div>`;
    let html=`<article class="hcard"><div class="top"><span class="nm">${esc(meta.name||lot.asset_name||lot.symbol)}</span><span class="cd">${esc(lot.symbol)}</span><span class="asset-badge">${marketLabel(lot.market)} · ${typeLabel(lot.asset_type)} · ${lot.currency}</span><span class="cd" style="margin-left:auto">${quote?`${mark} ${price(quote.price)} <span class="${cls(quote.changePct)}">${pct(quote.changePct)}</span>`:"行情暫無資料"}</span></div>${divLine}`;
    html+=`<div class="sec"><div class="h">合計（${rows.length} 筆）</div><div class="grid">${grid("持有股數",number(shares,4))}${grid("投入成本",`${mark} ${number(cost)}`)}${grid("現值",quote?`${mark} ${number(value)}`:"—")}${grid("未實現損益",quote?`${pnl>0?"+":""}${mark} ${number(pnl)}`:"—",cls(pnl))}${grid("報酬率",pct(pp),cls(pp))}<div class="expand-cell"><button class="lot-toggle" data-toggle-lots="${esc(key)}">展開</button></div></div></div>`;
    html+=`<div class="lots lot-section" data-lots="${esc(key)}" hidden><div class="detail-heading">各筆買入</div>`;
    rows.forEach((r)=>{const t=r.lot;html+=`<div class="lot"><div class="lot-top"><span class="cd">買入 ${esc(t.trade_date||"—")}</span><span class="sp"><button class="icon-btn" data-edit="${esc(t.id)}">✎</button><button class="icon-btn delete" data-del="${esc(t.id)}">🗑</button></span></div><div class="grid">${grid("股數",number(r.shares,4))}${grid("成交均價",`${mark} ${price(t.price)}`)}${grid("投入成本",`${mark} ${number(r.cost)}`)}${grid("現值",r.value!=null?`${mark} ${number(r.value)}`:"—")}${grid("損益",r.pnl!=null?`${r.pnl>0?"+":""}${mark} ${number(r.pnl)}`:"—",cls(r.pnl))}${grid("報酬率",pct(r.pnlPct),cls(r.pnlPct))}</div>${t.note?`<div class="note">📝 ${esc(t.note)}</div>`:""}</div>`;});
    if(sales.length){html+=`<div class="sale-subhead">賣出紀錄（${sales.length} 筆）</div>`;sales.forEach((s)=>{html+=`<div class="trade-row"><span class="sell">賣出</span>　${esc(s.t.trade_date||"—")}　${number(s.t.shares,4)} 股　${mark} ${price(s.t.price)}${s.realized!=null?`　已實現 <span class="${cls(s.realized)}">${s.realized>0?"+":""}${mark} ${number(s.realized)}</span>`:""}　<button class="icon-btn delete" data-del="${esc(s.t.id)}">🗑</button></div>`;});}
    return html+"</div></article>";
  }

  function render() {
    const a=auth();
    if(!a||!a.isConfigured()){ $("gate").style.display="block";$("app").style.display="none";$("gate").textContent="會員功能尚未設定。";return; }
    if(!a.user()){ $("gate").style.display="block";$("app").style.display="none";$("gate").textContent="請先登入，即可管理個人持股。";return; }
    $("gate").style.display="none";$("app").style.display="block";
    const portfolio=derivePortfolio(), groups={}, all=[];
    Object.entries(portfolio.lots).forEach(([key,lots])=>{groups[key]=lots.map(compute);all.push(...groups[key]);});
    renderSummary(all);
    $("list").innerHTML=Object.keys(groups).length?Object.keys(groups).sort().map((key)=>card(key,groups[key],portfolio.sales[key]||[])).join(""):'<div class="panel empty">目前沒有未結清持股，可用上方表單新增買入。</div>';
    $("list").querySelectorAll("[data-toggle-lots]").forEach((button)=>button.onclick=()=>{const box=$("list").querySelector(`[data-lots="${CSS.escape(button.dataset.toggleLots)}"]`);box.hidden=!box.hidden;button.textContent=box.hidden?"展開":"收合";});
    $("list").querySelectorAll("[data-edit]").forEach((b)=>b.onclick=()=>startEdit(b.dataset.edit));
    $("list").querySelectorAll("[data-del]").forEach((b)=>b.onclick=()=>remove(b.dataset.del));
  }

  function autoCosts() {
    const side=$("fSideSell").checked?"sell":"buy", market=$("fMarket").value, type=$("fAssetType").value, shares=Number($("fShares").value), unit=Number($("fPrice").value);
    if(!shares||!unit)return;
    if(market==="tw"){
      const b=portfolioConfig.brokerage||{}, rate=side==="sell"?Number(b.sell_fee_rate||b.fee_rate||0):Number(b.fee_rate||0);
      $("fFee").value=Math.max(Number(b.minimum_fee||1),Math.round(shares*unit*rate));
      $("fTax").value=side==="sell"?Math.round(shares*unit*(type==="stock"?.003:.001)):0;
    }
  }

  function updateMarketFields() {
    const us=$("fMarket").value==="us", sell=$("fSideSell").checked;
    const nextContext=`${$("fMarket").value}:${$("fAssetType").value}:${sell?"sell":"buy"}`;
    if (!editingId && nextContext !== formContext) { $("fFee").value=""; $("fTax").value=""; }
    formContext=nextContext;
    $("fFeeLabel").textContent=`手續費（${us?"USD":"TWD"}${us?"，依券商填寫":"，自動估算"}）`;
    $("fTaxField").style.display=us?"none":"flex";
    $("marketHint").textContent=us?"美股支援零股；損益以 USD 顯示，不與 TWD 混加。":`${$("fAssetType").value==="stock"?"股票":"ETF"} 賣出交易稅率分開估算。`;
    $("fShares").step=us?"any":"1";
    $("fSharesLabel").textContent=sell?"賣出股數":"買入股數";
    $("fDateLabel").textContent=sell?"賣出日期":"買入日期";
    $("fPriceLabel").textContent=sell?"賣出均價":"買入均價";
  }

  function resetForm(){editingId=null;["fCode","fShares","fDate","fPrice","fFee","fTax","fNote"].forEach(id=>$(id).value="");$("fSideBuy").checked=true;$("fSideBuy").disabled=false;$("fSideSell").disabled=false;$("fMarket").disabled=false;$("fAssetType").disabled=false;$("fCode").disabled=false;$("formTitle").textContent="新增交易";$("fSubmit").textContent="新增買入";$("fCancel").style.display="none";$("fMsg").textContent="";updateMarketFields();}

  function startEdit(id){const t=transactions.find(x=>String(x.id)===String(id));if(!t||t.side!=="buy")return;const current=(derivePortfolio().lots[assetKey(t)]||[]).find(x=>String(x.id)===String(id));if(!current||Number(current.shares)<Number(t.shares)){alert("這筆買入已有賣出紀錄，不能直接編輯。");return;}editingId=id;$("fSideBuy").checked=true;$("fSideBuy").disabled=true;$("fSideSell").disabled=true;$("fMarket").value=t.market;$("fAssetType").value=t.asset_type;$("fMarket").disabled=true;$("fAssetType").disabled=true;$("fCode").value=t.symbol;$("fCode").disabled=true;$("fShares").value=t.shares;$("fDate").value=t.trade_date||"";$("fPrice").value=t.price??"";$("fFee").value=t.fee??"";$("fTax").value=t.tax??"";$("fNote").value=t.note||"";$("formTitle").textContent=`編輯買入 ${t.symbol}`;$("fSubmit").textContent="更新";$("fCancel").style.display="inline-block";updateMarketFields();window.scrollTo({top:0,behavior:"smooth"});}

  async function submit(){const msg=$("fMsg"),side=$("fSideSell").checked?"sell":"buy",market=$("fMarket").value,type=$("fAssetType").value,found=resolveAsset($("fCode").value,market,type),symbol=(found?found.symbol:$("fCode").value.trim().toUpperCase()),shares=Number($("fShares").value),unit=Number($("fPrice").value),date=$("fDate").value||today();
    if(!/^[0-9A-Z.\-]{1,12}$/.test(symbol)){msg.textContent="標的代號格式不正確";return;}if(!shares||shares<=0||!Number.isFinite(unit)||unit<=0){msg.textContent="請填入正確的股數與成交均價";return;}if(market==="tw"&&!Number.isInteger(shares)){msg.textContent="台灣標的股數請輸入整數";return;}
    const key=`${market}:${symbol}`;if(side==="sell"){const available=(derivePortfolio().lots[key]||[]).reduce((s,x)=>s+Number(x.shares||0),0);if(shares>available){msg.textContent=`賣出股數超過可賣股數（${number(available,4)} 股）`;return;}}
    if($("fFee").value==="")autoCosts();const fee=Number($("fFee").value||0),tax=market==="tw"?Number($("fTax").value||0):0,currency=market==="us"?"USD":"TWD";
    const payload={etf_code:symbol,symbol,market,asset_type:type,asset_name:found?found.name:null,exchange:found?found.exchange:null,currency,side,trade_date:date,shares,price:unit,fee,tax,note:$("fNote").value.trim()||null};msg.style.color="var(--muted)";msg.textContent="儲存中…";
    const result=editingId?await sb().from("portfolio_transactions").update(payload).eq("id",editingId).eq("user_id",user().id):await sb().from("portfolio_transactions").insert({...payload,user_id:user().id});if(result.error){msg.style.color="var(--up)";msg.textContent=`儲存失敗：${result.error.message}`;return;}resetForm();await loadHoldings();}

  async function remove(id){const t=transactions.find(x=>String(x.id)===String(id));if(!t)return;
    if(t.side==="buy"){const current=(derivePortfolio().lots[assetKey(t)]||[]).find(x=>String(x.id)===String(id));if(!current||Number(current.shares)<Number(t.shares)){alert("這筆買入已有部分或全部賣出，為保留 FIFO 歷史，目前不能刪除。");return;}}
    if(!confirm(`確定刪除這筆${t.side==="sell"?"賣出":"買入"}紀錄？${t.side==="sell"?"刪除後 FIFO 成本會重新計算。":""}`))return;const result=await sb().from("portfolio_transactions").delete().eq("id",id).eq("user_id",user().id);if(result.error){alert(`刪除失敗：${result.error.message}`);return;}if(String(editingId)===String(id))resetForm();await loadHoldings();}

  function ensureReady(){return readyPromise||(readyPromise=Promise.all([loadConfig(),loadAssets()]));}
  document.addEventListener("DOMContentLoaded",()=>{$("fSubmit").onclick=submit;$("fCancel").onclick=resetForm;["fMarket","fAssetType"].forEach(id=>$(id).onchange=renderAssetOptions);["fSideBuy","fSideSell"].forEach(id=>$(id).onchange=()=>{if(!editingId)$("fSubmit").textContent=$("fSideSell").checked?"新增賣出":"新增買入";updateMarketFields();});["fShares","fPrice"].forEach(id=>$(id).onblur=autoCosts);updateMarketFields();ensureReady();});
  document.addEventListener("etfwatch:change",async()=>{const uid=user()&&user().id;if(uid&&uid!==loadedFor){loadedFor=uid;await ensureReady();loadHoldings();}else if(!uid){loadedFor=null;transactions=[];render();}else render();});
  setTimeout(async()=>{const uid=user()&&user().id;if(uid&&uid!==loadedFor){loadedFor=uid;await ensureReady();loadHoldings();}else render();},500);
})();
