(function () {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const number = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("zh-TW", { maximumFractionDigits:digits, minimumFractionDigits:digits });
  const tone = value => Number(value) > 0 ? "up" : Number(value) < 0 ? "down" : "flat";
  let payload;

  async function loadData() {
    const response = await fetch("market_data.json", { cache:"no-cache" });
    if (!response.ok) throw new Error("市場資料暫時無法載入");
    payload = await response.json();
    document.querySelectorAll("[data-updated]").forEach(el => { el.textContent = `資料更新：${payload.updatedAt || "—"}`; });
    return payload;
  }

  function showError(error) {
    const target = $("pageError");
    if (target) { target.hidden = false; target.textContent = error.message || "資料載入失敗，請稍後再試。"; }
  }

  function lineChart(target, rows, valueKey = "close", label = "") {
    if (!target || !rows.length) { if (target) target.innerHTML = '<div class="chart-empty">目前沒有可顯示的歷史資料</div>'; return; }
    const W=920,H=310,L=62,R=18,T=18,B=36;
    const values=rows.map(row=>Number(row[valueKey])).filter(Number.isFinite);
    if (!values.length) { target.innerHTML='<div class="chart-empty">目前沒有可顯示的歷史資料</div>'; return; }
    let min=Math.min(...values),max=Math.max(...values); const pad=(max-min||Math.abs(max)||1)*.08; min-=pad;max+=pad;
    const x=i=>L+i*(W-L-R)/Math.max(1,rows.length-1), y=v=>T+(max-v)*(H-T-B)/(max-min);
    const path=rows.map((row,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(Number(row[valueKey])).toFixed(1)}`).join(" ");
    const area=`${path} L${x(rows.length-1)},${H-B} L${x(0)},${H-B} Z`;
    const grid=[0,.25,.5,.75,1].map(p=>{const yy=T+p*(H-T-B),v=max-p*(max-min);return `<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text class="chart-label" x="${L-8}" y="${yy+4}" text-anchor="end">${number(v,Math.abs(v)<10?3:2)}</text>`}).join("");
    const dates=[0,Math.floor((rows.length-1)/2),rows.length-1].map(i=>`<text class="chart-label" x="${x(i)}" y="${H-9}" text-anchor="${i===0?"start":i===rows.length-1?"end":"middle"}">${esc(rows[i].date)}</text>`).join("");
    target.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}走勢圖"><defs><linearGradient id="marketArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${grid}<path class="chart-area" d="${area}"/><path class="chart-line" d="${path}"/>${dates}</svg>`;
  }

  function initIndices(data) {
    const cards=$("indexCards"), chart=$("indexChart"), title=$("chartTitle"), meta=$("chartMeta"), facts=$("indexFacts");
    let selected=data.indices[0],range=90;
    cards.innerHTML=data.indices.map((item,index)=>`<button class="market-card${index===0?" active":""}" data-index-id="${esc(item.id)}"><span class="region">${esc(item.region)}</span><h2>${esc(item.name)}</h2><div class="quote">${number(item.latest,item.decimals ?? 2)}</div><div class="change ${tone(item.change)}">${Number(item.change)>0?"+":""}${number(item.change,item.decimals ?? 2)} ・ ${Number(item.changePct)>0?"+":""}${number(item.changePct,2)}%</div></button>`).join("");
    function render() {
      cards.querySelectorAll("button").forEach(btn=>btn.classList.toggle("active",btn.dataset.indexId===selected.id));
      document.querySelectorAll("[data-range]").forEach(btn=>btn.classList.toggle("active",Number(btn.dataset.range)===range));
      const rows=selected.rows.slice(-range); title.textContent=selected.name; meta.textContent=`${selected.symbol}・${selected.currency || ""}・${selected.source}`;
      lineChart(chart,rows,"close",selected.name);
      facts.innerHTML=[["最新值",number(selected.latest,selected.decimals??2)],["今日漲跌",`${selected.change>0?"+":""}${number(selected.change,selected.decimals??2)}`],["今日漲幅",`${selected.changePct>0?"+":""}${number(selected.changePct,2)}%`],["最新資料日",selected.asOf]].map(([k,v])=>`<div class="fact"><span>${k}</span><strong>${esc(v)}</strong></div>`).join("");
    }
    cards.addEventListener("click",event=>{const button=event.target.closest("[data-index-id]");if(!button)return;selected=data.indices.find(item=>item.id===button.dataset.indexId);render();});
    document.querySelector(".range-switch")?.addEventListener("click",event=>{const button=event.target.closest("[data-range]");if(!button)return;range=Number(button.dataset.range);render();});
    render();
  }

  function currencyByCode(data, code) { return data.currencies.find(item=>item.code===code); }
  function crossRows(from,to) {
    if (from.code === "USD") return (to.rows || []).map(row => ({ date:row.date, close:1 / row.usdPerUnit })).filter(row => Number.isFinite(row.close));
    if (to.code === "USD") return (from.rows || []).map(row => ({ date:row.date, close:row.usdPerUnit })).filter(row => Number.isFinite(row.close));
    const a=new Map((from.rows||[]).map(row=>[row.date,row.usdPerUnit])),b=new Map((to.rows||[]).map(row=>[row.date,row.usdPerUnit]));
    return [...a.keys()].filter(date=>b.has(date)).sort().map(date=>({date,close:a.get(date)/b.get(date)})).filter(row=>Number.isFinite(row.close));
  }
  function initForex(data) {
    const from=$("fromCurrency"),to=$("toCurrency"),amount=$("fxAmount"),result=$("conversionResult"),formula=$("conversionFormula"),chartTitle=$("fxChartTitle"),chart=$("fxChart");
    const options=data.currencies.map(item=>`<option value="${item.code}">${item.code}・${esc(item.name)}</option>`).join("");from.innerHTML=options;to.innerHTML=options;from.value="TWD";to.value="USD";
    function render(){const source=currencyByCode(data,from.value),target=currencyByCode(data,to.value),value=Math.max(0,Number(amount.value)||0),rate=source.usdPerUnit/target.usdPerUnit,converted=value*rate;result.textContent=`${number(converted,4)} ${target.code}`;formula.textContent=`${number(value,2)} ${source.code} × ${number(rate,6)} = ${number(converted,4)} ${target.code}`;chartTitle.textContent=`${source.code} / ${target.code} 近一年走勢`;lineChart(chart,crossRows(source,target).slice(-260),"close",`${source.code}兌${target.code}`);}
    [from,to,amount].forEach(el=>el.addEventListener(el===amount?"input":"change",render));
    $("swapCurrency").addEventListener("click",()=>{const value=from.value;from.value=to.value;to.value=value;render();});
    $("fxTableBody").innerHTML=data.currencies.filter(item=>item.code!=="TWD").map(item=>{const twd=currencyByCode(data,"TWD"),rate=item.usdPerUnit/twd.usdPerUnit;return `<tr><td>${item.code}・${esc(item.name)}</td><td>${number(rate,4)}</td><td>${esc(item.asOf)}</td></tr>`}).join("");render();
  }

  function initBonds(data) {
    const rows=data.treasuries,latest=rows.at(-1),previous=rows.at(-2),tenors=data.treasuryTenors;
    $("bondAsOf").textContent=`最新資料日：${latest.date}`;
    $("yieldCards").innerHTML=tenors.map(item=>{const value=latest.rates[item.key],prior=previous?.rates[item.key],bp=value!=null&&prior!=null?(value-prior)*100:null;return `<div class="yield-card"><span>${esc(item.label)}</span><strong>${number(value,2)}%</strong><small class="${tone(bp)}">${bp==null?"—":`${bp>0?"+":""}${number(bp,1)} bp`}</small></div>`}).join("");
    const curve=tenors.map((item,index)=>({date:item.label,close:latest.rates[item.key],index})).filter(row=>Number.isFinite(row.close));lineChart($("yieldCurve"),curve,"close","美國公債殖利率曲線");
    const spread=(a,b)=>latest.rates[a]!=null&&latest.rates[b]!=null?(latest.rates[a]-latest.rates[b])*100:null,s210=spread("10Y","2Y"),s310=spread("10Y","3M");
    $("bondFacts").innerHTML=[["10 年期",`${number(latest.rates["10Y"],2)}%`],["2Y–10Y 利差",`${s210>0?"+":""}${number(s210,1)} bp`],["3M–10Y 利差",`${s310>0?"+":""}${number(s310,1)} bp`],["曲線狀態",s210==null?"—":s210<0?"2Y–10Y 倒掛":Math.abs(s210)<25?"曲線趨平":"正斜率"]].map(([k,v])=>`<div class="fact"><span>${k}</span><strong>${esc(v)}</strong></div>`).join("");
    $("bondTableBody").innerHTML=rows.slice().reverse().slice(0,10).map(row=>`<tr><td>${row.date}</td>${["3M","2Y","5Y","10Y","30Y"].map(key=>`<td>${number(row.rates[key],2)}%</td>`).join("")}</tr>`).join("");
  }

  async function initPage(){try{const data=await loadData(),page=document.body.dataset.marketPage;if(page==="indices")initIndices(data);if(page==="forex")initForex(data);if(page==="bonds")initBonds(data);}catch(error){showError(error);}}
  // 頁面元素都位於此 script 之前；不等待可能受外部會員 CDN 影響的 DOMContentLoaded。
  setTimeout(initPage,0);
})();
