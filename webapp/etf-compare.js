(function () {
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const core = window.ETFCompareCore;
  let market = "TW", assets = [], overview = {}, profiles = {}, usNameMap = new Map(), selectedRange = "1Y", lastComparison = null;
  const currency = value => value == null ? "—" : new Intl.NumberFormat("zh-TW", { maximumFractionDigits:2 }).format(value);
  const pct = value => value == null || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
  const pp = value => value == null || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)} pp`;
  const compactMoney = (value, unit) => value == null ? "—" : `${unit === "USD" ? "US$" : "NT$"} ${new Intl.NumberFormat("zh-TW", {notation:"compact",maximumFractionDigits:2}).format(value)}`;
  const countText = value => value == null ? "—" : new Intl.NumberFormat("zh-TW", {maximumFractionDigits:2}).format(value);

  function normalizeDividend(item) {
    return { exDate:item.exDate || item.ex || item.date || "", payDate:item.payDate || item.pay || "", amount:Number(item.amount ?? item.cashDividend ?? 0), source:item.source || "" };
  }

  async function getJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || "資料讀取失敗");
    return data;
  }

  function currentCatalog() { return assets.filter(asset => asset.market === market.toLowerCase() && asset.asset_type === "etf"); }
  function findAsset(value) {
    const query = String(value || "").trim().toUpperCase();
    return currentCatalog().find(asset => asset.symbol.toUpperCase() === query) ||
      currentCatalog().find(asset => `${asset.symbol} ${asset.name}`.toUpperCase() === query) ||
      currentCatalog().find(asset => asset.name.toUpperCase() === query);
  }
  function updateCatalog() {
    $("etfOptions").innerHTML = currentCatalog().map(asset => `<option value="${esc(asset.symbol)}">${esc(asset.name)}</option>`).join("");
    ["A","B"].forEach(side => updateInputMeta(side));
  }
  function updateInputMeta(side) {
    const asset = findAsset($("asset" + side).value);
    $("meta" + side).textContent = asset ? `${asset.name} · ${asset.exchange || (market === "TW" ? "台灣" : "美國")}` : "尚未選擇";
  }

  async function loadHistory(asset) {
    if (market === "US") {
      const payload = await getJson(`/api/market?market=US&code=${encodeURIComponent(asset.symbol)}`, {cache:"no-store"});
      return { rows:payload.rows || [], source:payload.source || "Yahoo Finance", updatedAt:(payload.rows || []).at(-1)?.date || "" };
    }
    try {
      const payload = await getJson(`price-history/${market}/${encodeURIComponent(asset.symbol)}.json`, {cache:"no-store"});
      return { rows:payload.rows || [], source:payload.source || "Yahoo Finance", updatedAt:payload.updatedAt || "" };
    } catch (_) {
      const payload = await getJson(`/api/market?market=${market}&code=${encodeURIComponent(asset.symbol)}`, {cache:"no-store"});
      return { rows:payload.rows || [], source:payload.source || "Yahoo Finance", updatedAt:(payload.rows || []).at(-1)?.date || "" };
    }
  }

  async function loadDividends(asset, legacy) {
    const initial = (legacy?.dividends || []).map(normalizeDividend);
    try {
      const payload = await getJson(`/api/dividends?market=${market}&type=etf&code=${encodeURIComponent(asset.symbol)}`, {cache:"no-store"});
      const map = new Map(initial.map(item => [`${item.exDate}:${item.amount}`, item]));
      (payload.events || []).map(normalizeDividend).forEach(item => map.set(`${item.exDate}:${item.amount}`, item));
      return [...map.values()].filter(item => item.exDate).sort((a,b) => b.exDate.localeCompare(a.exDate));
    } catch (_) { return initial.filter(item => item.exDate).sort((a,b) => b.exDate.localeCompare(a.exDate)); }
  }

  function enrichHolding(item) {
    let symbol = item.code || "";
    if (market === "US") symbol = usNameMap.get(core.normalizeName(item.name)) || symbol;
    const profile = profiles[symbol] || {};
    return { ...item, symbol, industry:profile.industry || profile.sector || "未分類" };
  }

  async function loadEtf(asset) {
    const legacy = market === "TW" ? window.DATA?.etfs?.[asset.symbol] : null;
    let payload, latest, info = overview[asset.symbol] || {};
    if (market === "TW") {
      payload = legacy || await getJson(`/api/etf?code=${encodeURIComponent(asset.symbol)}`, {cache:"no-store"});
      latest = (payload.snapshots || []).at(-1);
      if (!latest) throw new Error(`${asset.symbol} 尚無持股快照`);
    } else {
      payload = await getJson(`/api/us_etf_holdings?code=${encodeURIComponent(asset.symbol)}`, {cache:"no-store"});
      latest = { date:payload.date, holdings:payload.holdings || [] };
      info = { issuer:payload.registrantName || "—", index:"SEC N-PORT 未提供", fundSize:payload.fundSize };
    }
    const [history, dividends] = await Promise.all([loadHistory(asset), loadDividends(asset, legacy)]);
    const holdings = (latest.holdings || []).map(enrichHolding);
    const currentPrice = history.rows.at(-1)?.close ?? latest.self?.close ?? null;
    return {
      asset, name:asset.name || payload.name, holdings, date:latest.date || payload.date,
      filedAt:payload.filedAt || "", source:payload.source || {name:"MoneyDJ",url:"https://www.moneydj.com/ETF/"},
      history, dividends, currentPrice, currency:market === "US" ? "USD" : "TWD",
      issuer:info.issuer || "—", index:info.index || "—",
      fundSize:market === "US" ? payload.fundSize : Number(info.fundSizeHundredMillion || 0) * 100000000 || null,
      securityType:info.securityType || "ETF", tags:info.tags || [], beneficiaries:info.beneficiaryTenThousands ?? null,
      premiumPct:(info.navHistory || []).at(-1)?.premiumPct ?? null,
    };
  }

  function metrics(data) {
    const rows = data.history.rows, lastDate = rows.at(-1)?.date;
    return {
      price:data.currentPrice, fundSize:data.fundSize, holdings:data.holdings.length,
      top10:core.topConcentration(data.holdings), month:core.periodReturn(rows,31), quarter:core.periodReturn(rows,92), halfYear:core.periodReturn(rows,183), year:core.periodReturn(rows,366),
      ytd:core.yearToDateReturn(rows), twoYear:core.periodReturn(rows,731,true),
      total:core.totalReturn(rows,data.dividends,252), volatility:core.annualVolatility(rows), drawdown:core.maxDrawdown(rows),
      yield:core.trailingDividendYield(data.dividends,data.currentPrice,lastDate), dividendCount:core.dividendFrequency(data.dividends,lastDate),
      premiumPct:data.premiumPct,
    };
  }

  function renderIdentity(side, data) {
    $("symbol" + side).textContent = data.asset.symbol; $("name" + side).textContent = data.name;
    const tags=data.tags.length?data.tags.join("・"):data.securityType;
    $("facts" + side).innerHTML = [["投資類型",tags],["追蹤指數",data.index],["發行機構",data.issuer],["持股資料日",data.date || "—"],["行情資料日",data.history.updatedAt || data.history.rows.at(-1)?.date || "—"]].map(([label,value]) => `<div><dt>${label}</dt><dd title="${esc(value)}">${esc(value)}</dd></div>`).join("");
  }

  function renderMetrics(a, b) {
    const left=metrics(a), right=metrics(b);
    const rows = [
      ["最新價格",currency(left.price),currency(right.price),a.currency],["基金規模",compactMoney(left.fundSize,a.currency),compactMoney(right.fundSize,b.currency),"資料來源最新值"],
      ["受益人數",a.beneficiaries==null?"—":`${countText(a.beneficiaries)} 萬`,b.beneficiaries==null?"—":`${countText(b.beneficiaries)} 萬`,"台灣 ETF 最新受益人"],
      ["最新折溢價",pct(left.premiumPct),pct(right.premiumPct),"市價相對淨值"],
      ["持股檔數",currency(left.holdings),currency(right.holdings),"依最新持股資料"],["前十大集中度",pct(left.top10),pct(right.top10),"權重合計"],
      ["近 1 個月",pct(left.month),pct(right.month),"價格報酬"],["近 3 個月",pct(left.quarter),pct(right.quarter),"價格報酬"],
      ["近 6 個月",pct(left.halfYear),pct(right.halfYear),"價格報酬"],["今年以來",pct(left.ytd),pct(right.ytd),"價格報酬"],
      ["近 1 年",pct(left.year),pct(right.year),"價格報酬"],["近 2 年年化",pct(left.twoYear),pct(right.twoYear),"資料足夠時顯示"],
      ["近 1 年含息",pct(left.total),pct(right.total),"除息日再投入估算"],
      ["年化波動率",pct(left.volatility),pct(right.volatility),"近 252 交易日"],["最大回撤",pct(left.drawdown),pct(right.drawdown),"近 252 交易日"],
      ["近 12 月配息率",pct(left.yield),pct(right.yield),"配息合計／最新價"],
      ["近 12 月配息次數",left.dividendCount==null?"—":`${left.dividendCount} 次`,right.dividendCount==null?"—":`${right.dividendCount} 次`,"依除息日計算"],
    ];
    $("metricGrid").innerHTML = rows.map(([label,x,y,note]) => `<div class="metric"><b class="value-a">${esc(x)}</b><label>${label}</label><b class="value-b">${esc(y)}</b><small>${esc(note)}</small></div>`).join("");
    return {left,right};
  }

  function renderOverlap(a,b) {
    const value=core.overlap(a.holdings,b.holdings), weight=Math.max(0,Math.min(100,value.weight));
    $("overlapGauge").style.setProperty("--value",weight.toFixed(2)); $("overlapValue").textContent=`${weight.toFixed(1)}%`;
    $("commonCount").textContent=value.commonCount; $("uniqueCount").textContent=value.leftOnly+value.rightOnly;
    return value;
  }

  function rangedRows(rows, range) {
    const days={"1M":31,"3M":92,"6M":183,"1Y":366,"2Y":731}[range]||366,clean=(rows||[]).filter(row=>row.date&&Number(row.close)>0),end=clean.at(-1)?.date;
    if(!end)return [];
    const cutoff=new Date(end+"T00:00:00Z");cutoff.setUTCDate(cutoff.getUTCDate()-days);
    return clean.filter(row=>new Date(row.date+"T00:00:00Z")>=cutoff);
  }
  function normalizedMap(rows, range) {
    const clean=rangedRows(rows,range), first=clean[0]?.close;
    return new Map(clean.map(row=>[row.date,(Number(row.close)/first-1)*100]));
  }
  function renderChart(a,b,range=selectedRange) {
    selectedRange=range;document.querySelectorAll("[data-range]").forEach(button=>button.classList.toggle("active",button.dataset.range===range));
    const ma=normalizedMap(a.history.rows,range), mb=normalizedMap(b.history.rows,range), dates=[...new Set([...ma.keys(),...mb.keys()])].sort();
    if(dates.length<2){$("performanceChart").innerHTML='<div class="empty-state">走勢資料不足</div>';return;}
    const values=[...ma.values(),...mb.values(),0], min=Math.floor(Math.min(...values)-1), max=Math.ceil(Math.max(...values)+1), w=760,h=270,p={l:48,r:12,t:14,b:28};
    const x=i=>p.l+i/(dates.length-1)*(w-p.l-p.r), y=v=>p.t+(max-v)/(max-min)*(h-p.t-p.b);
    const path=map=>dates.map((date,i)=>map.has(date)?`${i===0||!map.has(dates[i-1])?'M':'L'}${x(i).toFixed(1)},${y(map.get(date)).toFixed(1)}`:"").join(" ");
    const ticks=[min,(min+max)/2,max];
    $("performanceChart").innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="兩檔 ETF ${range} 報酬率走勢">${ticks.map(v=>`<line class="chart-grid" x1="${p.l}" x2="${w-p.r}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-axis" x="${p.l-6}" y="${y(v)+3}" text-anchor="end">${v.toFixed(1)}%</text>`).join("")}<path class="chart-a" d="${path(ma)}"/><path class="chart-b" d="${path(mb)}"/><text class="chart-axis" x="${p.l}" y="${h-6}">${dates[0]}</text><text class="chart-axis" x="${w-p.r}" y="${h-6}" text-anchor="end">${dates.at(-1)}</text></svg>`;
  }

  function renderTopHoldings(a,b) {
    const side=data=>[...data.holdings].sort((x,y)=>(Number(y.weight)||0)-(Number(x.weight)||0)).slice(0,10);
    const left=side(a),right=side(b),max=Math.max(1,...left.concat(right).map(item=>Number(item.weight)||0));
    $("topHoldings").innerHTML=[{data:a,rows:left,tone:"a"},{data:b,rows:right,tone:"b"}].map(column=>`<div class="top-column"><h3 class="value-${column.tone}">${esc(column.data.asset.symbol)}<small>權重</small></h3>${column.rows.map((item,index)=>`<div class="top-row"><em>${index+1}</em><div><b>${esc(item.symbol||item.code||item.name)}</b><span title="${esc(item.name)}">${esc(item.name)}</span><i><u style="width:${(Number(item.weight)||0)/max*100}%"></u></i></div><strong>${(Number(item.weight)||0).toFixed(2)}%</strong></div>`).join("")||'<p class="panel-intro">尚無持股資料</p>'}</div>`).join("");
  }

  function renderHeatmap(a,b) {
    const rows=core.holdingDiff(a.holdings,b.holdings).slice(0,40), max=Math.max(1,...rows.map(r=>Math.max(r.left,r.right))), maxDiff=Math.max(1,...rows.map(r=>Math.abs(r.difference)));
    $("holdingsHeatmap").innerHTML='<div class="heat-row header"><span>持股</span><span>ETF A 權重</span><span>A − B</span><span>ETF B 權重</span></div>'+rows.map(row=>{
      const intensity=Math.min(1,Math.abs(row.difference)/maxDiff), bg=row.difference>0?`color-mix(in srgb,var(--a) ${Math.round(10+intensity*35)}%,transparent)`:row.difference<0?`color-mix(in srgb,var(--b) ${Math.round(10+intensity*35)}%,transparent)`:"var(--bg)";
      return `<div class="heat-row"><div class="holding-name"><b>${esc(row.symbol||row.key)}</b><span>${esc(row.name)}</span></div><div class="heat-cell"><i style="width:${row.left/max*100}%"></i><span>${row.left.toFixed(2)}%</span></div><div class="heat-diff" style="background:${bg}">${pp(row.difference)}</div><div class="heat-cell b"><i style="width:${row.right/max*100}%"></i><span>${row.right.toFixed(2)}%</span></div></div>`;
    }).join("");
  }

  function groupIndustry(holdings) {
    const out=new Map();let classified=0,total=0;
    holdings.forEach(item=>{const weight=Number(item.weight)||0,name=item.industry||"未分類";out.set(name,(out.get(name)||0)+weight);total+=weight;if(name!=="未分類")classified+=weight;});
    return {map:out,coverage:total?classified/total*100:0};
  }
  function renderIndustries(a,b) {
    const ga=groupIndustry(a.holdings),gb=groupIndustry(b.holdings),names=[...new Set([...ga.map.keys(),...gb.map.keys()])].sort((x,y)=>Math.max(gb.map.get(y)||0,ga.map.get(y)||0)-Math.max(gb.map.get(x)||0,ga.map.get(x)||0)).slice(0,12),max=Math.max(1,...names.flatMap(n=>[ga.map.get(n)||0,gb.map.get(n)||0]));
    $("industryCoverage").textContent=`分類覆蓋 A ${ga.coverage.toFixed(0)}%／B ${gb.coverage.toFixed(0)}%`;
    $("industryBars").innerHTML=names.map(name=>{const x=ga.map.get(name)||0,y=gb.map.get(name)||0;return `<div class="allocation-row"><b title="${esc(name)}">${esc(name)}</b><div class="allocation-track"><i style="width:${x/max*100}%"></i></div><span>${x.toFixed(1)}%</span><div class="allocation-track b"><i style="width:${y/max*100}%"></i></div><span>${y.toFixed(1)}%</span></div>`}).join("")||'<p class="panel-intro">尚無可分類的產業資料。</p>';
  }

  function renderDividends(a,b) {
    $("dividendTables").innerHTML=[a,b].map((data,index)=>`<div class="dividend-table"><h3 style="color:var(--${index?'b':'a'})">${esc(data.asset.symbol)}</h3><table><thead><tr><th>除息日</th><th>發放日</th><th>每單位</th></tr></thead><tbody>${data.dividends.slice(0,6).map(d=>`<tr><td>${esc(d.exDate||'—')}</td><td>${esc(d.payDate||'—')}</td><td>${currency(d.amount)}</td></tr>`).join("")||'<tr><td colspan="3">尚無近期資料</td></tr>'}</tbody></table></div>`).join("");
  }

  function renderSummary(a,b,m,o) {
    const compare=(label,x,y)=>x==null||y==null?null:`${label}：${a.asset.symbol} ${pct(x)}，${b.asset.symbol} ${pct(y)}，差距 ${Math.abs(x-y).toFixed(2)} 個百分點。`;
    const list=[`兩檔持股權重重疊 ${o.weight.toFixed(2)}%，共有 ${o.commonCount} 筆相同持股識別項目。`,compare("前十大集中度",m.left.top10,m.right.top10),compare("近一年價格報酬",m.left.year,m.right.year),compare("近一年含息報酬",m.left.total,m.right.total),compare("年化波動率",m.left.volatility,m.right.volatility),compare("近一年最大回撤",m.left.drawdown,m.right.drawdown)].filter(Boolean);
    $("differenceSummary").innerHTML=list.map(item=>`<li>${esc(item)}</li>`).join("");
  }

  function renderSources(a,b) {
    const line=data=>`${data.asset.symbol} 持股：${data.source?.url?`<a href="${esc(data.source.url)}" target="_blank" rel="noopener">${esc(data.source.name||'來源')}</a>`:esc(data.source?.name||'MoneyDJ')}，基準日 ${esc(data.date||'—')}${data.filedAt?`，申報日 ${esc(data.filedAt)}`:""}；行情：${esc(data.history.source)}（${esc(data.history.updatedAt||'—')}）。`;
    $("sourcePanel").innerHTML=`<b>資料來源與口徑</b><br>${line(a)}<br>${line(b)}<br>美國 ETF 持股來自 SEC N-PORT 定期申報，並非即時部位；持股重疊以代號／CUSIP／ISIN 等識別值比對。報酬、波動與回撤均由本頁行情序列計算，僅呈現數據差異。`;
  }

  function renderAll(a,b) {
    renderIdentity("A",a);renderIdentity("B",b);$("legendA").textContent=a.asset.symbol;$("legendB").textContent=b.asset.symbol;
    lastComparison=[a,b];const o=renderOverlap(a,b),m=renderMetrics(a,b);renderChart(a,b);renderTopHoldings(a,b);renderHeatmap(a,b);renderIndustries(a,b);renderDividends(a,b);renderSummary(a,b,m,o);renderSources(a,b);
    $("emptyState").hidden=true;$("results").hidden=false;
  }

  async function run() {
    const a=findAsset($("assetA").value),b=findAsset($("assetB").value);
    if(!a||!b){$("compareStatus").className="status error";$("compareStatus").textContent="請從目前市場各選擇一檔有效 ETF。";return;}
    if(a.symbol===b.symbol){$("compareStatus").className="status error";$("compareStatus").textContent="請選擇兩檔不同的 ETF。";return;}
    $("runCompare").disabled=true;$("compareStatus").className="status";$("compareStatus").textContent=`正在整合 ${a.symbol} 與 ${b.symbol} 的持股、行情及配息資料…`;
    try{
      const [left,right]=await Promise.all([loadEtf(a),loadEtf(b)]);renderAll(left,right);
      const url=new URL(location.href);url.searchParams.set("market",market);url.searchParams.set("a",a.symbol);url.searchParams.set("b",b.symbol);history.replaceState(null,"",url);
      $("compareStatus").textContent=`完成比較｜持股資料日：${left.date}／${right.date}`;
    }catch(error){$("compareStatus").className="status error";$("compareStatus").textContent=error.message||"比較資料載入失敗";}
    finally{$("runCompare").disabled=false;}
  }

  function setMarket(next,clear=true) {
    market=next;document.querySelectorAll("[data-market]").forEach(button=>{const active=button.dataset.market===market;button.classList.toggle("active",active);button.setAttribute("aria-checked",String(active));});
    if(clear){$("assetA").value="";$("assetB").value="";$("results").hidden=true;$("emptyState").hidden=false;}
    updateCatalog();$("compareStatus").textContent="";
  }

  async function init() {
    try{
      const [assetPayload,overviewPayload,profilePayload]=await Promise.all([getJson("trade_assets.json"),getJson("etf_overview.json").catch(()=>({})),getJson("company_profiles.json").catch(()=>({}))]);
      assets=assetPayload.assets||[];overview=overviewPayload;profiles=profilePayload;
      assets.filter(a=>a.market==="us"&&a.asset_type==="stock").forEach(asset=>usNameMap.set(core.normalizeName(asset.name),asset.symbol));
      const params=new URLSearchParams(location.search),requested=(params.get("market")||"TW").toUpperCase();setMarket(requested==="US"?"US":"TW",false);
      $("assetA").value=params.get("a")||"";$("assetB").value=params.get("b")||"";updateInputMeta("A");updateInputMeta("B");
      if($("assetA").value&&$("assetB").value)run();
    }catch(error){$("compareStatus").className="status error";$("compareStatus").textContent="ETF 清單載入失敗，請重新整理。";}
  }
  document.querySelectorAll("[data-market]").forEach(button=>button.addEventListener("click",()=>setMarket(button.dataset.market)));
  ["A","B"].forEach(side=>$("asset"+side).addEventListener("input",()=>updateInputMeta(side)));
  $("swapAssets").onclick=()=>{const a=$("assetA").value;$("assetA").value=$("assetB").value;$("assetB").value=a;updateInputMeta("A");updateInputMeta("B");};
  $("runCompare").onclick=run;$("themeToggle").onclick=()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("etf-theme",next);$("themeToggle").textContent=next==="dark"?"☀️":"🌙";};
  document.querySelectorAll("[data-range]").forEach(button=>button.addEventListener("click",()=>{if(lastComparison)renderChart(lastComparison[0],lastComparison[1],button.dataset.range);}));
  document.addEventListener("DOMContentLoaded",init);
})();
