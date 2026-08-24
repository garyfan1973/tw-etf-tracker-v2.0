(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const pad = (n) => String(n).padStart(2,"0");
  const auth = () => window.ETFAuth;
  const todayObj = new Date();
  const today = `${todayObj.getFullYear()}-${pad(todayObj.getMonth()+1)}-${pad(todayObj.getDate())}`;
  let viewY=todayObj.getFullYear(), viewM=todayObj.getMonth(), selected=null;
  let holidays=[], assets=[], events=[], active=new Set(), holdings=new Set(), initialized=false;

  const keyOf=(a)=>`${a.market}:${a.symbol}`;
  const marketText=(m)=>m==="us"?"美國":"台灣";
  const typeText=(t)=>t==="stock"?"股票":"ETF";
  const moneyMark=(c)=>c==="USD"?"US$":"NT$";

  async function loadBase() {
    try { const r=await fetch("holidays.json",{cache:"no-store"}); if(r.ok)holidays=await r.json(); } catch(_){ }
    const legacy=window.DATA&&window.DATA.etfs||{};
    Object.entries(legacy).forEach(([symbol,data])=>{
      const asset={market:"tw",asset_type:"etf",symbol,name:data.name||symbol,currency:"TWD",source:"MoneyDJ"};
      assets.push(asset); active.add(keyOf(asset));
      (data.dividends||[]).forEach((d)=>addDividend(asset,{exDate:d.ex,payDate:d.pay,amount:d.amount,yield:d.yield,source:"MoneyDJ"}));
    });
    initialized=true; renderAll();
  }

  function addDividend(asset,d) {
    const base={key:keyOf(asset),symbol:asset.symbol,name:asset.name,market:asset.market,assetType:asset.asset_type,currency:d.currency||asset.currency||(asset.market==="us"?"USD":"TWD"),amount:d.amount,yield:d.yield,source:d.source||asset.source};
    if(d.exDate)events.push({...base,date:d.exDate,type:"ex"});
    if(d.payDate)events.push({...base,date:d.payDate,type:"pay"});
  }

  async function loadMemberAssets() {
    const client=auth()&&auth().client(), user=auth()&&auth().user();
    if(!client||!user)return;
    const result=await client.from("portfolio_transactions").select("symbol,etf_code,market,asset_type,asset_name,exchange,currency,side,shares");
    if(result.error)return;
    const unique=new Map(), balances=new Map();
    (result.data||[]).forEach((row)=>{
      const market=row.market||"tw",symbol=String(row.symbol||row.etf_code||"").toUpperCase();
      if(!symbol)return;
      const asset={market,symbol,asset_type:row.asset_type||"etf",name:row.asset_name||symbol,exchange:row.exchange||"",currency:row.currency||(market==="us"?"USD":"TWD")};
      const key=keyOf(asset); unique.set(key,asset);
      balances.set(key,(balances.get(key)||0)+(row.side==="sell"?-1:1)*Number(row.shares||0));
    });
    holdings=new Set([...balances].filter(([,shares])=>shares>0.00000001).map(([key])=>key));
    const legacyKeys=new Set(assets.map(keyOf));
    for(const asset of unique.values()){
      if(!legacyKeys.has(keyOf(asset)))assets.push(asset);
      if(holdings.has(keyOf(asset)))active.add(keyOf(asset));
      try{
        const response=await fetch(`/api/dividends?market=${asset.market.toUpperCase()}&type=${asset.asset_type}&code=${encodeURIComponent(asset.symbol)}`,{cache:"no-store"});
        const data=await response.json();
        if(data.ok)(data.events||[]).forEach((d)=>addDividend(asset,d));
      }catch(_){ }
    }
    dedupeEvents();renderAll();
  }

  function dedupeEvents(){const map=new Map();events.forEach((e)=>map.set(`${e.key}:${e.type}:${e.date}:${e.amount}`,e));events=[...map.values()];}
  function shownEvents(){return events.filter((e)=>active.has(e.key));}

  function renderChips(){const mine=$("onlyMineDiv").checked;$("chips").innerHTML=assets.filter((a)=>!mine||holdings.has(keyOf(a))).sort((a,b)=>a.market.localeCompare(b.market)||a.symbol.localeCompare(b.symbol)).map((a)=>`<span class="chip ${active.has(keyOf(a))?"on":""}" data-key="${esc(keyOf(a))}">${a.market==="us"?"🇺🇸":"🇹🇼"} ${esc(a.symbol)} ${esc(a.name)}</span>`).join("");$("chips").querySelectorAll("[data-key]").forEach((chip)=>chip.onclick=()=>{active.has(chip.dataset.key)?active.delete(chip.dataset.key):active.add(chip.dataset.key);renderChips();renderCalendar();renderUpcoming();});}

  function renderUpcoming(){const list=shownEvents().filter((e)=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,12);$("upcoming").innerHTML=list.length?list.map((e)=>{const days=Math.round((new Date(e.date+"T00:00:00")-new Date(today+"T00:00:00"))/86400000);return `<div class="up-row" data-date="${e.date}"><span class="up-date">${e.date.slice(5)}</span><span class="up-in">${days===0?"今天":`還有 ${days} 天`}</span><span class="badge ${e.type}">${e.type==="ex"?"除息":"發放"}</span><span>${e.market==="us"?"🇺🇸":"🇹🇼"} ${esc(e.symbol)} ${esc(e.name)}</span><span class="up-amt">${moneyMark(e.currency)} ${e.amount==null?"—":Number(e.amount).toFixed(4)}</span></div>`;}).join(""):'<div class="empty">目前所選標的沒有已公告的未來配息。</div>';$("upcoming").querySelectorAll("[data-date]").forEach((row)=>row.onclick=()=>{viewY=+row.dataset.date.slice(0,4);viewM=+row.dataset.date.slice(5,7)-1;selected=row.dataset.date;renderCalendar();renderDetail();});}

  function renderCalendar(){$("calTitle").textContent=`${viewY} 年 ${viewM+1} 月`;const byDate={};shownEvents().forEach((e)=>(byDate[e.date]=byDate[e.date]||[]).push(e));holidays.forEach((h)=>(byDate[h.date]=byDate[h.date]||[]).push({...h,type:"holiday"}));let html=["日","一","二","三","四","五","六"].map((d,i)=>`<div class="dow ${i===0?"sun":i===6?"sat":""}">${d}</div>`).join("");const first=new Date(viewY,viewM,1),count=new Date(viewY,viewM+1,0).getDate();for(let i=0;i<first.getDay();i++)html+='<div class="day blank"></div>';for(let day=1;day<=count;day++){const date=`${viewY}-${pad(viewM+1)}-${pad(day)}`,dow=new Date(viewY,viewM,day).getDay(),rows=byDate[date]||[];html+=`<div class="day ${dow===0?"sun":dow===6?"sat":""} ${date===today?"today":""} ${date===selected?"sel":""}" data-date="${date}"><div class="dnum">${day}</div><div class="pills">${rows.slice(0,3).map((e)=>e.type==="holiday"?`<span class="holiday-pill ${e.country==="US"?"us":"tw"}">${e.country==="US"?"🇺🇸":"🇹🇼"} ${esc(e.name)}</span>`:`<span class="pill ${e.type}">${e.market==="us"?"🇺🇸":"🇹🇼"} ${esc(e.symbol)}</span>`).join("")}${rows.length>3?`<span class="more">+${rows.length-3}</span>`:""}</div></div>`;}$("grid").innerHTML=html;$("grid").querySelectorAll(".day[data-date]").forEach((cell)=>cell.onclick=()=>{selected=cell.dataset.date;renderCalendar();renderDetail();});}

  function renderDetail(){if(!selected){$("detailPanel").style.display="none";return;}const rows=shownEvents().filter((e)=>e.date===selected),days=holidays.filter((h)=>h.date===selected);$("detailTitle").textContent=`${selected} 配息明細`;$("detail").innerHTML=days.map((h)=>`<div class="d-row"><span class="badge ${h.country==="US"?"us-holiday":"tw-holiday"}">${h.country==="US"?"美國假日":"台灣假日"}</span> <span class="d-name">${esc(h.name)}</span></div>`).concat(rows.map((e)=>`<div class="d-row"><div class="d-top"><span class="badge ${e.type}">${e.type==="ex"?"除息":"發放"}</span><span class="d-name">${e.market==="us"?"🇺🇸":"🇹🇼"} ${esc(e.symbol)} ${esc(e.name)}</span><span class="asset-badge">${marketText(e.market)} · ${typeText(e.assetType)}</span></div><div class="d-meta">每股／每單位 <b>${moneyMark(e.currency)} ${e.amount==null?"—":Number(e.amount).toFixed(4)}</b>${e.source?`　來源：${esc(e.source)}`:""}</div></div>`)).join("")||'<div class="empty">這天沒有配息或國定假日。</div>';$("detailPanel").style.display="block";}

  function renderAll(){if(!initialized)return;$("sub").textContent="涵蓋台灣 ETF、台股、美股與美國 ETF；發放日僅在來源有公告時顯示。";$("mineWrap").style.display=auth()&&auth().isConfigured()?"inline-flex":"none";renderChips();renderUpcoming();renderCalendar();renderDetail();}
  $("prev").onclick=()=>{if(--viewM<0){viewM=11;viewY--;}renderCalendar();};$("next").onclick=()=>{if(++viewM>11){viewM=0;viewY++;}renderCalendar();};$("todayBtn").onclick=()=>{viewY=todayObj.getFullYear();viewM=todayObj.getMonth();selected=today;renderCalendar();renderDetail();};$("onlyMineDiv").onchange=()=>{if($("onlyMineDiv").checked){active=new Set(holdings);}else{active=new Set(assets.map(keyOf));}renderAll();};
  document.addEventListener("etfwatch:change",loadMemberAssets);
  loadBase().then(loadMemberAssets);
})();
