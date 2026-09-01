(function(){
  const $=id=>document.getElementById(id),fmt=(value,digits=2)=>Number.isFinite(Number(value))?Number(value).toLocaleString("zh-TW",{minimumFractionDigits:digits,maximumFractionDigits:digits}):"—";
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const tone=value=>Number(value)>0?"up":Number(value)<0?"down":"flat",sign=value=>Number(value)>0?"+":"";
  const moveText=item=>`${Number(item.change)>=0?"▲":"▼"} ${sign(item.change)}${fmt(item.change)} (${sign(item.changePct)}${fmt(item.changePct)}%)`;
  const shortDate=value=>{const parts=String(value||"").split("-");return parts.length===3?`${Number(parts[1])}/${Number(parts[2])}`:value||"—";};
  const turnoverText=value=>Number.isFinite(Number(value))?`${fmt(Number(value)/100000000,2)} 億元`:"—";

  function sparkline(rows,item){
    const points=(rows||[]).filter(row=>Number.isFinite(Number(row.close))).slice(-30);if(points.length<2)return '<div class="sparkline"></div>';
    const width=260,height=70,pad=4,values=points.map(row=>Number(row.close)),min=Math.min(...values),max=Math.max(...values),spread=max-min||1;
    const x=index=>pad+index*(width-pad*2)/(points.length-1),y=value=>pad+(max-value)*(height-pad*2)/spread;
    const path=points.map((row,index)=>`${index?"L":"M"}${x(index).toFixed(1)} ${y(Number(row.close)).toFixed(1)}`).join(" "),reference=y(values[values.length-2]).toFixed(1);
    return `<div class="sparkline ${tone(item.change)}"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(item.name)}近 30 個交易日走勢"><line class="spark-reference" x1="${pad}" x2="${width-pad}" y1="${reference}" y2="${reference}"></line><path class="spark-path" d="${path}"></path></svg></div>`;
  }

  function renderHeroChart(item){
    const target=$("twChart"),rows=(item.rows||[]).filter(row=>Number.isFinite(Number(row.close))).slice(-40);if(rows.length<2){target.innerHTML='<div class="home-error">台股走勢資料暫時不足</div>';return;}
    const width=900,height=360,left=18,right=16,top=13,priceBottom=258,volumeTop=276,volumeBottom=327,values=rows.map(row=>Number(row.close)),min=Math.min(...values),max=Math.max(...values),spread=max-min||1;
    const x=index=>left+index*(width-left-right)/(rows.length-1),y=value=>top+(max-value)*(priceBottom-top)/spread;
    const line=rows.map((row,index)=>`${index?"L":"M"}${x(index).toFixed(1)} ${y(Number(row.close)).toFixed(1)}`).join(" "),area=`${line} L${x(rows.length-1).toFixed(1)} ${priceBottom} L${x(0).toFixed(1)} ${priceBottom} Z`;
    const turnovers=rows.map(row=>Number(row.turnover)||0),maxTurnover=Math.max(...turnovers,1),barWidth=Math.max(2,(width-left-right)/rows.length*.58),bars=rows.map((row,index)=>{const value=Number(row.turnover)||0,h=(volumeBottom-volumeTop)*value/maxTurnover;return `<rect class="hero-volume" x="${(x(index)-barWidth/2).toFixed(1)}" y="${(volumeBottom-h).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}"></rect>`;}).join("");
    const previous=Number(rows[rows.length-2].close),baseY=y(previous).toFixed(1),ticks=[0,Math.floor((rows.length-1)/3),Math.floor((rows.length-1)*2/3),rows.length-1],xLabels=ticks.map(index=>`<text class="hero-axis" x="${x(index).toFixed(1)}" y="351" text-anchor="${index===0?"start":index===rows.length-1?"end":"middle"}">${esc(shortDate(rows[index].date))}</text>`).join("");
    target.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="台灣加權指數近 40 個交易日日線走勢"><line class="hero-grid" x1="${left}" x2="${width-right}" y1="${priceBottom}" y2="${priceBottom}"></line><line class="hero-baseline" x1="${left}" x2="${width-right}" y1="${baseY}" y2="${baseY}"></line><path class="hero-area" d="${area}"></path><path class="hero-line" d="${line}"></path>${bars}${xLabels}<g class="hover-layer" hidden><line class="hero-crosshair cross-x" y1="${top}" y2="${volumeBottom}"></line><line class="hero-crosshair cross-y" x1="${left}" x2="${width-right}"></line><circle r="4" fill="var(--chart)" stroke="#fff" stroke-width="2"></circle></g><rect class="chart-hit" x="${left}" y="${top}" width="${width-left-right}" height="${volumeBottom-top}" fill="transparent"></rect></svg><div class="chart-tooltip" hidden></div>`;
    const svg=target.querySelector("svg"),hit=target.querySelector(".chart-hit"),layer=target.querySelector(".hover-layer"),tip=target.querySelector(".chart-tooltip");
    hit.addEventListener("pointermove",event=>{const rect=svg.getBoundingClientRect(),localX=(event.clientX-rect.left)*width/rect.width,index=Math.max(0,Math.min(rows.length-1,Math.round((localX-left)/(width-left-right)*(rows.length-1)))),row=rows[index],px=x(index),py=y(Number(row.close));layer.hidden=false;layer.querySelector(".cross-x").setAttribute("x1",px);layer.querySelector(".cross-x").setAttribute("x2",px);layer.querySelector(".cross-y").setAttribute("y1",py);layer.querySelector(".cross-y").setAttribute("y2",py);layer.querySelector("circle").setAttribute("cx",px);layer.querySelector("circle").setAttribute("cy",py);tip.hidden=false;tip.classList.toggle("left",event.clientX>rect.left+rect.width*.67);tip.style.left=`${event.clientX-rect.left}px`;tip.style.top=`${event.clientY-rect.top}px`;tip.innerHTML=`<strong>${esc(row.date)}</strong>收盤 ${fmt(row.close)}<br>成交 ${turnoverText(row.turnover)}`;});hit.addEventListener("pointerleave",()=>{layer.hidden=true;tip.hidden=true;});
  }

  function render(data){
    const indices=data.indices||[],byId=Object.fromEntries(indices.map(item=>[item.id,item])),highlights=Object.fromEntries((data.taiwanHighlights||[]).map(item=>[item.id,item])),twHistory=byId.twii;if(!twHistory)throw new Error("找不到台灣加權指數資料");
    const tw={...twHistory,...(highlights.twii||{})};$("twLatest").textContent=fmt(tw.latest);$("twMove").textContent=moveText(tw);$("twMove").className=`market-move ${tone(tw.change)}`;$("twTurnover").textContent=turnoverText(twHistory.turnover);$("twAsOf").textContent=tw.asOf||"—";$("twRange").textContent=`${fmt(twHistory.week52Low)} – ${fmt(twHistory.week52High)}`;renderHeroChart(twHistory);
    $("twHighlights").innerHTML=["otc","electronics","finance"].map(id=>{const item=highlights[id],label=id==="otc"?"上櫃":id==="electronics"?"電子":"金融";return item?`<article class="tw-highlight"><span>${esc(item.name)}</span><strong>${fmt(item.latest)}</strong><b class="${tone(item.change)}">${esc(moveText(item))}</b><small>${esc(item.asOf)}・${esc(item.source)}</small></article>`:`<article class="tw-highlight"><span>${label}</span><strong>—</strong><b class="flat">資料更新中</b></article>`;}).join("");
    const globalIds=["dow","nasdaq","sp500","sox","nikkei","kospi","nasdaq100","russell2000"];$("globalGrid").innerHTML=globalIds.map(id=>byId[id]).filter(Boolean).map(item=>`<a class="global-card" href="market-index.html" aria-label="查看${esc(item.name)}完整資訊"><header><h3>${esc(item.name)}</h3><time>${esc(shortDate(item.asOf))}</time></header>${sparkline(item.rows,item)}<strong>${fmt(item.latest)}</strong><div class="market-move ${tone(item.change)}">${esc(moveText(item))}</div></a>`).join("");
    const updated=new Date(data.updatedAt);$("marketStatus").textContent="最新市場資料";$("marketUpdated").textContent=Number.isNaN(updated.getTime())?data.updatedAt||"":updated.toLocaleString("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
  }
  let loading=false;
  async function load(){
    if(loading)return;loading=true;
    try{
      const response=await fetch(`market_data.json?v=${Date.now()}`,{cache:"no-store"});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      render(await response.json());$("homeError").hidden=true;
    }catch(error){$("marketStatus").textContent="資料載入失敗";$("homeError").hidden=false;$("homeError").textContent=`市場資料暫時無法載入，請稍後重新整理。${error.message?`（${error.message}）`:""}`}
    finally{loading=false}
  }
  load();setInterval(()=>{if(!document.hidden)load()},60000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()});
})();
