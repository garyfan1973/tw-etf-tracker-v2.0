(function () {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const number = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("zh-TW", { maximumFractionDigits:digits, minimumFractionDigits:digits });
  const turnover = value => {
    const amount=Number(value);
    if(!Number.isFinite(amount))return "—";
    return Math.abs(amount)>=1e12?`${number(amount/1e12,2)} 兆元`:`${number(amount/1e8,2)} 億元`;
  };
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

  function periodWindow(rows, period) {
    const counts={"5D":5,"1M":22,"3M":66,"6M":132,"1Y":260};
    let start=Math.max(0,rows.length-(counts[period]||rows.length));
    if(period==="YTD"&&rows.length){const year=rows.at(-1).date.slice(0,4);start=Math.max(0,rows.findIndex(row=>row.date>=`${year}-01-01`));}
    return {start,end:rows.length};
  }

  function clampWindow(total,start,end,minimumSize=5) {
    const minimum=Math.min(minimumSize,total),span=Math.max(minimum,Math.min(total,Math.round(end-start)));
    let nextStart=Math.round(start),nextEnd=nextStart+span;
    if(nextStart<0){nextEnd-=nextStart;nextStart=0;}
    if(nextEnd>total){nextStart-=nextEnd-total;nextEnd=total;}
    return {start:Math.max(0,nextStart),end:Math.max(minimum,nextEnd)};
  }

  function interactiveIndexChart(target, allRows, view, label, chartType, volumeLabel, onViewChange) {
    const rows=allRows.slice(view.start,view.end);
    if(!rows.length){target.innerHTML='<div class="chart-empty">目前沒有可顯示的歷史資料</div>';return;}
    const narrow=target.clientWidth<600,W=narrow?Math.max(340,Math.round(target.clientWidth||360)):1000,H=narrow?300:390,L=narrow?10:18,R=narrow?58:76,T=20,B=narrow?34:38;
    const lows=rows.map(row=>Number(row.low??row.close)).filter(Number.isFinite),highs=rows.map(row=>Number(row.high??row.close)).filter(Number.isFinite);
    let min=Math.min(...lows),max=Math.max(...highs);const pad=(max-min||Math.abs(max)||1)*.07;min-=pad;max+=pad;
    const x=i=>L+i*(W-L-R)/Math.max(1,rows.length-1),y=value=>T+(max-value)*(H-T-B)/(max-min);
    const path=rows.map((row,index)=>`${index?"L":"M"}${x(index).toFixed(1)},${y(Number(row.close)).toFixed(1)}`).join(" ");
    const area=`${path} L${x(rows.length-1)},${H-B} L${x(0)},${H-B} Z`;
    const candles=rows.map((row,index)=>{const open=Number(row.open??row.close),close=Number(row.close),high=Number(row.high??row.close),low=Number(row.low??row.close),cx=x(index),width=Math.max(1.5,Math.min(9,(W-L-R)/Math.max(1,rows.length)*.62)),color=close>=open?"var(--up)":"var(--down)",bodyY=Math.min(y(open),y(close)),bodyH=Math.max(1.2,Math.abs(y(open)-y(close)));return `<line x1="${cx}" x2="${cx}" y1="${y(high)}" y2="${y(low)}" stroke="${color}" stroke-width="1.2" vector-effect="non-scaling-stroke"/><rect x="${cx-width/2}" y="${bodyY}" width="${width}" height="${bodyH}" rx=".6" fill="${color}"/>`;}).join("");
    const horizontal=[0,.2,.4,.6,.8,1].map(p=>{const yy=T+p*(H-T-B),value=max-p*(max-min);return `<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text class="chart-label" x="${W-R+7}" y="${yy+4}">${number(value,Math.abs(value)<10?3:2)}</text>`}).join("");
    const vertical=(narrow?[0,.5,1]:[0,.2,.4,.6,.8,1]).map(p=>{const index=Math.min(rows.length-1,Math.round(p*(rows.length-1))),xx=x(index);return `<line class="chart-grid" x1="${xx}" x2="${xx}" y1="${T}" y2="${H-B}"/><text class="chart-label" x="${xx}" y="${H-9}" text-anchor="${p===0?"start":p===1?"end":"middle"}">${esc(rows[index].date.slice(0,7))}</text>`}).join("");
    const last=allRows.at(-1),lastY=Number(last?.close)>=min&&Number(last?.close)<=max?y(Number(last.close)):null;
    const lastLine=lastY==null?"":`<line class="chart-last-line" x1="${L}" x2="${W-R}" y1="${lastY}" y2="${lastY}"/><text class="chart-last-label" x="${W-R+7}" y="${lastY+4}">${number(last.close,2)}</text>`;
    const priceGraphic=chartType==="candle"?candles:`<path fill="url(#indexArea)" d="${area}"/><path class="chart-line" d="${path}"/>`;
    target.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}${chartType==="candle"?" K 線圖":"收盤價線圖"}"><defs><linearGradient id="indexArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".34"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".02"/></linearGradient></defs>${horizontal}${vertical}${priceGraphic}${lastLine}<g id="indexHover" visibility="hidden"><line id="indexCrossV" class="chart-crosshair" y1="${T}" y2="${H-B}"/><line id="indexCrossH" class="chart-crosshair" x1="${L}" x2="${W-R}"/><circle id="indexPoint" class="chart-point" r="4"/></g><rect id="indexHitArea" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/></svg><div class="chart-tooltip" hidden></div>`;
    const svg=target.querySelector("svg"),hit=target.querySelector("#indexHitArea"),hover=target.querySelector("#indexHover"),vLine=target.querySelector("#indexCrossV"),hLine=target.querySelector("#indexCrossH"),point=target.querySelector("#indexPoint"),tip=target.querySelector(".chart-tooltip");
    const coords=event=>{const rect=svg.getBoundingClientRect();return {x:(event.clientX-rect.left)*W/rect.width,y:(event.clientY-rect.top)*H/rect.height,rect};};
    let drag=null;
    hit.addEventListener("pointermove",event=>{
      const pos=coords(event),ratio=Math.max(0,Math.min(1,(pos.x-L)/(W-L-R))),index=Math.min(rows.length-1,Math.round(ratio*(rows.length-1))),row=rows[index],cx=x(index),cy=y(Number(row.close)),hy=Math.max(T,Math.min(H-B,pos.y));
      hover.setAttribute("visibility","visible");vLine.setAttribute("x1",cx);vLine.setAttribute("x2",cx);hLine.setAttribute("y1",hy);hLine.setAttribute("y2",hy);point.setAttribute("cx",cx);point.setAttribute("cy",cy);
      const hasTurnover=Boolean(volumeLabel),metricLabel=volumeLabel||"成交量",metricValue=hasTurnover?turnover(row.turnover):(row.volume==null?"—":Number(row.volume).toLocaleString("en-US")),metricRow=volumeLabel===null?"":`<div class="chart-tooltip-row"><span>${esc(metricLabel)}</span><span>${metricValue}</span></div>`;
      tip.hidden=false;tip.classList.toggle("left",ratio>.68);tip.style.left=`${cx/W*pos.rect.width}px`;tip.style.top=`${cy/H*pos.rect.height}px`;tip.innerHTML=`<strong>${esc(row.date)}</strong>${[["收盤",row.close],["開盤",row.open??row.close],["最高",row.high??row.close],["最低",row.low??row.close]].map(([key,value])=>`<div class="chart-tooltip-row"><span>${key}</span><span>${number(value,2)}</span></div>`).join("")}${metricRow}`;
    });
    hit.addEventListener("pointerleave",()=>{if(!drag){hover.setAttribute("visibility","hidden");tip.hidden=true;}});
    hit.addEventListener("pointerdown",event=>{drag={clientX:event.clientX,start:view.start,end:view.end};hit.setPointerCapture?.(event.pointerId);});
    hit.addEventListener("pointerup",event=>{if(!drag)return;const rect=svg.getBoundingClientRect(),span=drag.end-drag.start,shift=Math.round(-(event.clientX-drag.clientX)/Math.max(1,rect.width)*span);if(Math.abs(event.clientX-drag.clientX)>4)onViewChange(clampWindow(allRows.length,drag.start+shift,drag.end+shift));drag=null;});
    hit.addEventListener("pointercancel",()=>{drag=null;});
    hit.addEventListener("wheel",event=>{event.preventDefault();const pos=coords(event),anchor=Math.max(0,Math.min(1,(pos.x-L)/(W-L-R))),span=view.end-view.start,nextSpan=Math.max(5,Math.min(allRows.length,Math.round(span*(event.deltaY>0?1.22:.82)))),anchorIndex=view.start+span*anchor;onViewChange(clampWindow(allRows.length,anchorIndex-nextSpan*anchor,anchorIndex+nextSpan*(1-anchor)));},{passive:false});
  }

  function interactiveLineChart(target, allRows, view, label, options, onViewChange) {
    const rows=allRows.slice(view.start,view.end),minimum=options.minimum??3;
    if(!rows.length){target.innerHTML='<div class="chart-empty">目前沒有可顯示的歷史資料</div>';return;}
    const narrow=target.clientWidth<600,W=narrow?Math.max(340,Math.round(target.clientWidth||360)):1000,H=narrow?300:390,L=narrow?12:20,R=narrow?58:76,T=20,B=narrow?38:42;
    const values=rows.map(row=>Number(row.close)).filter(Number.isFinite);
    let min=Math.min(...values),max=Math.max(...values);const pad=(max-min||Math.abs(max)||1)*.08;min-=pad;max+=pad;
    const x=i=>L+i*(W-L-R)/Math.max(1,rows.length-1),y=value=>T+(max-value)*(H-T-B)/(max-min);
    const path=rows.map((row,index)=>`${index?"L":"M"}${x(index).toFixed(1)},${y(Number(row.close)).toFixed(1)}`).join(" "),area=`${path} L${x(rows.length-1)},${H-B} L${x(0)},${H-B} Z`;
    const horizontal=[0,.2,.4,.6,.8,1].map(p=>{const yy=T+p*(H-T-B),value=max-p*(max-min);return `<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text class="chart-label" x="${W-R+7}" y="${yy+4}">${number(value,options.digits??3)}${esc(options.ySuffix||"")}</text>`}).join("");
    const tickRatios=rows.length<=6?rows.map((_,index)=>rows.length===1?0:index/(rows.length-1)):(narrow?[0,.5,1]:[0,.2,.4,.6,.8,1]);
    const vertical=tickRatios.map(p=>{const index=Math.min(rows.length-1,Math.round(p*(rows.length-1))),xx=x(index),text=options.xLabel?options.xLabel(rows[index]):rows[index].date;return `<line class="chart-grid" x1="${xx}" x2="${xx}" y1="${T}" y2="${H-B}"/><text class="chart-label" x="${xx}" y="${H-10}" text-anchor="${p===0?"start":p===1?"end":"middle"}">${esc(text)}</text>`}).join("");
    target.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><defs><linearGradient id="seriesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".3"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".02"/></linearGradient></defs>${horizontal}${vertical}<path fill="url(#seriesArea)" d="${area}"/><path class="chart-line" d="${path}"/><g id="seriesHover" visibility="hidden"><line id="seriesCrossV" class="chart-crosshair" y1="${T}" y2="${H-B}"/><line id="seriesCrossH" class="chart-crosshair" x1="${L}" x2="${W-R}"/><circle id="seriesPoint" class="chart-point" r="4"/></g><rect id="seriesHitArea" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/></svg><div class="chart-tooltip" hidden></div>`;
    const svg=target.querySelector("svg"),hit=target.querySelector("#seriesHitArea"),hover=target.querySelector("#seriesHover"),vLine=target.querySelector("#seriesCrossV"),hLine=target.querySelector("#seriesCrossH"),point=target.querySelector("#seriesPoint"),tip=target.querySelector(".chart-tooltip");
    const coords=event=>{const rect=svg.getBoundingClientRect();return{x:(event.clientX-rect.left)*W/rect.width,y:(event.clientY-rect.top)*H/rect.height,rect};};let drag=null;
    hit.addEventListener("pointermove",event=>{const pos=coords(event),ratio=Math.max(0,Math.min(1,(pos.x-L)/(W-L-R))),index=Math.min(rows.length-1,Math.round(ratio*(rows.length-1))),row=rows[index],cx=x(index),cy=y(Number(row.close)),hy=Math.max(T,Math.min(H-B,pos.y)),rowLabel=options.tooltipLabel?options.tooltipLabel(row):row.date;hover.setAttribute("visibility","visible");vLine.setAttribute("x1",cx);vLine.setAttribute("x2",cx);hLine.setAttribute("y1",hy);hLine.setAttribute("y2",hy);point.setAttribute("cx",cx);point.setAttribute("cy",cy);tip.hidden=false;tip.classList.toggle("left",ratio>.68);tip.style.left=`${cx/W*pos.rect.width}px`;tip.style.top=`${cy/H*pos.rect.height}px`;tip.innerHTML=`<strong>${esc(rowLabel)}</strong><div class="chart-tooltip-row"><span>${esc(options.valueLabel||"數值")}</span><span>${number(row.close,options.digits??3)}${esc(options.ySuffix||"")}</span></div>`;});
    hit.addEventListener("pointerleave",()=>{if(!drag){hover.setAttribute("visibility","hidden");tip.hidden=true;}});
    hit.addEventListener("pointerdown",event=>{drag={clientX:event.clientX,start:view.start,end:view.end};hit.setPointerCapture?.(event.pointerId);});
    hit.addEventListener("pointerup",event=>{if(!drag)return;const rect=svg.getBoundingClientRect(),span=drag.end-drag.start,shift=Math.round(-(event.clientX-drag.clientX)/Math.max(1,rect.width)*span);if(Math.abs(event.clientX-drag.clientX)>4)onViewChange(clampWindow(allRows.length,drag.start+shift,drag.end+shift,minimum));drag=null;});
    hit.addEventListener("pointercancel",()=>{drag=null;});
    hit.addEventListener("wheel",event=>{event.preventDefault();const pos=coords(event),anchor=Math.max(0,Math.min(1,(pos.x-L)/(W-L-R))),span=view.end-view.start,nextSpan=Math.max(minimum,Math.min(allRows.length,Math.round(span*(event.deltaY>0?1.22:.82)))),anchorIndex=view.start+span*anchor;onViewChange(clampWindow(allRows.length,anchorIndex-nextSpan*anchor,anchorIndex+nextSpan*(1-anchor),minimum));},{passive:false});
  }

  function bindExpandedPanel(panel,button,onChange) {
    button.addEventListener("click",()=>{const expanded=panel.classList.toggle("chart-expanded");document.body.style.overflow=expanded?"hidden":"";button.setAttribute("aria-pressed",String(expanded));onChange?.();});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&panel.classList.contains("chart-expanded")){panel.classList.remove("chart-expanded");document.body.style.overflow="";button.setAttribute("aria-pressed","false");onChange?.();}});
  }

  function initIndices(data) {
    const cards=$("indexCards"),chart=$("indexChart"),title=$("chartTitle"),meta=$("chartMeta"),latest=$("indexLatest"),move=$("indexMove"),volume=$("indexVolume"),weekRange=$("indexWeekRange"),asOf=$("quoteAsOf"),panel=$("indexChartPanel");
    let selected=data.indices[0],period="1Y",chartType="line",view=periodWindow(selected.rows,period);
    const groupFor=item=>item.region==="商品"?"commodities":item.region.startsWith("美國")?"us":"asia",groups=[{id:"asia",title:"亞洲市場",description:"台灣、日本與韓國主要股價指數"},{id:"us",title:"美股指數",description:"大型股、科技、半導體、小型股與市場波動"},{id:"commodities",title:"商品市場",description:"國際原油價格參考"}];
    cards.innerHTML=groups.map(group=>{const rows=data.indices.filter(item=>groupFor(item)===group.id);return `<div class="index-group"><div class="index-group-head"><div><span>${esc(group.title)}</span><small>${esc(group.description)}</small></div><b>${rows.length} 項</b></div><div class="index-group-grid">${rows.map((item,index)=>`<button class="market-card${item.id===selected.id?" active":""}" data-index-id="${esc(item.id)}"><span class="region">${esc(item.region)}</span><h2>${esc(item.name)}</h2><div class="quote">${number(item.latest,item.decimals ?? 2)}</div><div class="change ${tone(item.change)}">${Number(item.change)>0?"+":""}${number(item.change,item.decimals ?? 2)} ・ ${Number(item.changePct)>0?"+":""}${number(item.changePct,2)}%</div><small class="quote-basis">${esc(item.quoteLabel||"最近收盤")}・${esc(item.asOf)}</small></button>`).join("")}</div></div>`;}).join("");
    function renderChart(){interactiveIndexChart(chart,selected.rows,view,selected.name,chartType,selected.turnoverLabel||selected.volumeLabel||"",next=>{view=next;renderChart();});}
    function render() {
      cards.querySelectorAll("button").forEach(btn=>btn.classList.toggle("active",btn.dataset.indexId===selected.id));
      document.querySelectorAll("[data-period]").forEach(btn=>btn.classList.toggle("active",btn.dataset.period===period));
      title.textContent=selected.name;meta.textContent=`${selected.symbol}・${selected.currency||""}・${selected.source}`;asOf.textContent=`${selected.quoteLabel||"最近收盤"}｜${selected.asOf}`;latest.textContent=number(selected.latest,selected.decimals??2);
      move.className=tone(selected.change);move.textContent=`${selected.change>0?"▲ +":selected.change<0?"▼ ":""}${number(selected.change,selected.decimals??2)} (${selected.changePct>0?"+":""}${number(selected.changePct,2)}%)`;
      const lastRow=selected.rows.at(-1),lows=selected.rows.slice(-260).map(row=>Number(row.low??row.close)).filter(Number.isFinite),highs=selected.rows.slice(-260).map(row=>Number(row.high??row.close)).filter(Number.isFinite);
      document.querySelectorAll("[data-index-chart-type]").forEach(btn=>btn.classList.toggle("active",btn.dataset.indexChartType===chartType));
      volume.previousElementSibling.textContent=selected.turnoverLabel||selected.volumeLabel||"成交量";
      volume.textContent=selected.turnoverLabel?turnover(lastRow?.turnover):(lastRow?.volume==null?"—":Number(lastRow.volume).toLocaleString("en-US"));weekRange.textContent=`${number(selected.week52Low??Math.min(...lows),2)} – ${number(selected.week52High??Math.max(...highs),2)}`;
      renderChart();
    }
    function zoom(factor){const span=view.end-view.start,nextSpan=Math.max(5,Math.min(selected.rows.length,Math.round(span*factor))),center=(view.start+view.end)/2;view=clampWindow(selected.rows.length,center-nextSpan/2,center+nextSpan/2);renderChart();}
    cards.addEventListener("click",event=>{const button=event.target.closest("[data-index-id]");if(!button)return;selected=data.indices.find(item=>item.id===button.dataset.indexId);period="1Y";view=periodWindow(selected.rows,period);render();});
    document.querySelector(".range-switch")?.addEventListener("click",event=>{const button=event.target.closest("[data-period]");if(!button)return;period=button.dataset.period;view=periodWindow(selected.rows,period);render();});
    document.querySelector(".index-chart-type")?.addEventListener("click",event=>{const button=event.target.closest("[data-index-chart-type]");if(!button)return;chartType=button.dataset.indexChartType;render();});
    $("zoomIn").addEventListener("click",()=>zoom(.75));$("zoomOut").addEventListener("click",()=>zoom(1.3));$("resetZoom").addEventListener("click",()=>{view=periodWindow(selected.rows,period);renderChart();});
    $("fullscreenChart").addEventListener("click",()=>{const expanded=panel.classList.toggle("chart-expanded");document.body.style.overflow=expanded?"hidden":"";$("fullscreenChart").setAttribute("aria-pressed",String(expanded));});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"){panel.classList.remove("chart-expanded");document.body.style.overflow="";$("fullscreenChart").setAttribute("aria-pressed","false");}});
    render();
  }

  function currencyByCode(data, code) { return data.currencies.find(item=>item.code===code); }
  function crossRows(from,to) {
    if (from.code === "USD") return (to.rows || []).map(row => ({ date:row.date, close:1 / row.usdPerUnit })).filter(row => Number.isFinite(row.close));
    if (to.code === "USD") return (from.rows || []).map(row => ({ date:row.date, close:row.usdPerUnit })).filter(row => Number.isFinite(row.close));
    const a=new Map((from.rows||[]).map(row=>[row.date,row.usdPerUnit])),b=new Map((to.rows||[]).map(row=>[row.date,row.usdPerUnit]));
    return [...a.keys()].filter(date=>b.has(date)).sort().map(date=>({date,close:a.get(date)/b.get(date)})).filter(row=>Number.isFinite(row.close));
  }
  function initDollarIndex(data) {
    const item=data.dollarIndex,panel=$("dxyChartPanel"),chart=$("dxyChart");
    if(!item||!item.rows?.length){if(panel)panel.hidden=true;return;}
    const latest=item.rows.at(-1),previous=item.rows.at(-2),change=latest.close-(previous?.close??latest.close),changePct=previous?.close?change/previous.close*100:0,lows=item.rows.slice(-260).map(row=>Number(row.low??row.close)).filter(Number.isFinite),highs=item.rows.slice(-260).map(row=>Number(row.high??row.close)).filter(Number.isFinite);
    $("dxyAsOf").textContent=`美元指數每日參考行情｜${item.asOf}`;$("dxyLatest").textContent=number(item.latest,2);$("dxyMove").className=tone(change);$("dxyMove").textContent=`${change>0?"▲ +":change<0?"▼ ":""}${number(change,2)} (${changePct>0?"+":""}${number(changePct,2)}%)`;$("dxyMeta").textContent=`${item.symbol}・${item.source}`;
    $("dxyFacts").innerHTML=[["開盤",latest.open],["最高",latest.high],["昨收",previous?.close],["最低",latest.low],["52 週區間",`${number(item.week52Low??Math.min(...lows),2)} – ${number(item.week52High??Math.max(...highs),2)}`]].map(([label,value],index)=>`<div class="dxy-fact${index===4?" wide":""}"><span>${label}</span><strong>${typeof value==="number"?number(value,2):esc(value)}</strong></div>`).join("");
    const tech=window.TechnicalChartCore.create(chart,{label:"美元指數技術分析",chartType:"candle",mas:[5,10,20],indicators:["kd"],defaultRange:60,onStateChange:updateControls});
    function updateControls(){const state=tech.state();document.querySelectorAll("[data-dxy-chart-type]").forEach(btn=>btn.classList.toggle("active",btn.dataset.dxyChartType===state.chartType));document.querySelectorAll("[data-dxy-ma]").forEach(btn=>btn.classList.toggle("active",state.mas.includes(Number(btn.dataset.dxyMa))));document.querySelectorAll("[data-dxy-indicator]").forEach(btn=>btn.classList.toggle("active",state.indicators.includes(btn.dataset.dxyIndicator)));document.querySelectorAll("[data-dxy-days]").forEach(btn=>{const days=btn.dataset.dxyDays==="all"?item.rows.length:Number(btn.dataset.dxyDays);btn.classList.toggle("active",state.span===Math.min(days,item.rows.length));});const first=item.rows[tech.view.start],last=item.rows[tech.view.end-1];$("dxyVisibleRange").textContent=first&&last?`${first.date} ～ ${last.date}・${state.span} 日`:"";}
    $("dxyChartTypes").addEventListener("click",event=>{const button=event.target.closest("[data-dxy-chart-type]");if(button)tech.setChartType(button.dataset.dxyChartType);});$("dxyMaLegend").addEventListener("click",event=>{const button=event.target.closest("[data-dxy-ma]");if(button)tech.toggleMa(Number(button.dataset.dxyMa));});$("dxyIndicators").addEventListener("click",event=>{const button=event.target.closest("[data-dxy-indicator]");if(button)tech.toggleIndicator(button.dataset.dxyIndicator);});$("dxyPeriods").addEventListener("click",event=>{const button=event.target.closest("[data-dxy-days]");if(button)tech.setRange(button.dataset.dxyDays==="all"?"all":Number(button.dataset.dxyDays));});$("dxyZoomIn").addEventListener("click",()=>tech.zoom(.75));$("dxyZoomOut").addEventListener("click",()=>tech.zoom(1.3));$("dxyResetZoom").addEventListener("click",()=>tech.reset());bindExpandedPanel(panel,$("dxyFullscreen"),()=>tech.render());tech.setRows(item.rows);
  }
  function initForex(data) {
    initDollarIndex(data);
    const from=$("fromCurrency"),to=$("toCurrency"),amount=$("fxAmount"),result=$("conversionResult"),formula=$("conversionFormula"),chartTitle=$("fxChartTitle"),chart=$("fxChart"),panel=$("fxChartPanel");
    const options=data.currencies.map(item=>`<option value="${item.code}">${item.code}・${esc(item.name)}</option>`).join("");from.innerHTML=options;to.innerHTML=options;from.value="TWD";to.value="USD";
    let period="1Y",series=[],view={start:0,end:0};
    function renderChart(){const source=currencyByCode(data,from.value),target=currencyByCode(data,to.value);interactiveLineChart(chart,series,view,`${source.code}兌${target.code}匯率走勢`,{digits:Math.max(source.code==="JPY"||target.code==="JPY"?2:4,2),valueLabel:`1 ${source.code} 可兌 ${target.code}`},next=>{view=next;renderChart();});}
    function render(resetView=false){const source=currencyByCode(data,from.value),target=currencyByCode(data,to.value),value=Math.max(0,Number(amount.value)||0),rate=source.usdPerUnit/target.usdPerUnit,converted=value*rate;result.textContent=`${number(converted,4)} ${target.code}`;formula.textContent=`${number(value,2)} ${source.code} × ${number(rate,6)} = ${number(converted,4)} ${target.code}`;series=crossRows(source,target).slice(-260);if(resetView||view.end>series.length||!view.end)view=periodWindow(series,period);chartTitle.textContent=`${source.code} / ${target.code} 匯率走勢`;document.querySelectorAll("#fxPeriods [data-period]").forEach(btn=>btn.classList.toggle("active",btn.dataset.period===period));renderChart();}
    function zoom(factor){const span=view.end-view.start,nextSpan=Math.max(5,Math.min(series.length,Math.round(span*factor))),center=(view.start+view.end)/2;view=clampWindow(series.length,center-nextSpan/2,center+nextSpan/2);renderChart();}
    [from,to].forEach(el=>el.addEventListener("change",()=>{period="1Y";render(true);}));amount.addEventListener("input",()=>render(false));
    $("swapCurrency").addEventListener("click",()=>{const value=from.value;from.value=to.value;to.value=value;period="1Y";render(true);});
    $("fxPeriods").addEventListener("click",event=>{const button=event.target.closest("[data-period]");if(!button)return;period=button.dataset.period;view=periodWindow(series,period);render();});
    $("fxZoomIn").addEventListener("click",()=>zoom(.75));$("fxZoomOut").addEventListener("click",()=>zoom(1.3));$("fxResetZoom").addEventListener("click",()=>{view=periodWindow(series,period);renderChart();});bindExpandedPanel(panel,$("fxFullscreen"),renderChart);
    $("fxTableBody").innerHTML=data.currencies.filter(item=>item.code!=="TWD").map(item=>{const twd=currencyByCode(data,"TWD"),rate=item.usdPerUnit/twd.usdPerUnit;return `<tr><td>${item.code}・${esc(item.name)}</td><td>${number(rate,4)}</td><td>${esc(item.asOf)}</td></tr>`}).join("");render(true);
  }

  function initBonds(data) {
    const rows=data.treasuries,latest=rows.at(-1),previous=rows.at(-2),tenors=data.treasuryTenors,panel=$("bondChartPanel"),chart=$("yieldCurve");
    $("bondAsOf").textContent=`最新資料日：${latest.date}`;
    $("yieldCards").innerHTML=tenors.map(item=>{const value=latest.rates[item.key],prior=previous?.rates[item.key],bp=value!=null&&prior!=null?(value-prior)*100:null;return `<div class="yield-card"><span>${esc(item.label)}</span><strong>${number(value,2)}%</strong><small class="${tone(bp)}">${bp==null?"—":`${bp>0?"+":""}${number(bp,1)} bp`}</small></div>`}).join("");
    const curve=tenors.map((item,index)=>({date:item.label,close:latest.rates[item.key],index})).filter(row=>Number.isFinite(row.close));let range="ALL",view={start:0,end:curve.length};
    const ranges={ALL:[0,curve.length],SHORT:[0,Math.min(7,curve.length)],MID:[Math.min(7,curve.length),Math.min(11,curve.length)],LONG:[Math.min(11,Math.max(0,curve.length-3)),curve.length]};
    function renderChart(){interactiveLineChart(chart,curve,view,"美國公債殖利率曲線",{digits:3,ySuffix:"%",valueLabel:"殖利率",minimum:3,xLabel:row=>row.date,tooltipLabel:row=>row.date},next=>{view=next;range="CUSTOM";document.querySelectorAll("#bondRanges [data-bond-range]").forEach(btn=>btn.classList.remove("active"));renderChart();});}
    function setRange(next){range=next;const [start,end]=ranges[next];view=clampWindow(curve.length,start,end,3);document.querySelectorAll("#bondRanges [data-bond-range]").forEach(btn=>btn.classList.toggle("active",btn.dataset.bondRange===range));renderChart();}
    function zoom(factor){const span=view.end-view.start,nextSpan=Math.max(3,Math.min(curve.length,Math.round(span*factor))),center=(view.start+view.end)/2;view=clampWindow(curve.length,center-nextSpan/2,center+nextSpan/2,3);range="CUSTOM";document.querySelectorAll("#bondRanges [data-bond-range]").forEach(btn=>btn.classList.remove("active"));renderChart();}
    $("bondRanges").addEventListener("click",event=>{const button=event.target.closest("[data-bond-range]");if(button)setRange(button.dataset.bondRange);});$("bondZoomIn").addEventListener("click",()=>zoom(.75));$("bondZoomOut").addEventListener("click",()=>zoom(1.3));$("bondResetZoom").addEventListener("click",()=>setRange("ALL"));bindExpandedPanel(panel,$("bondFullscreen"),renderChart);renderChart();
    const spread=(a,b)=>latest.rates[a]!=null&&latest.rates[b]!=null?(latest.rates[a]-latest.rates[b])*100:null,s210=spread("10Y","2Y"),s310=spread("10Y","3M");
    $("bondFacts").innerHTML=[["10 年期",`${number(latest.rates["10Y"],2)}%`],["2Y–10Y 利差",`${s210>0?"+":""}${number(s210,1)} bp`],["3M–10Y 利差",`${s310>0?"+":""}${number(s310,1)} bp`],["曲線狀態",s210==null?"—":s210<0?"2Y–10Y 倒掛":Math.abs(s210)<25?"曲線趨平":"正斜率"]].map(([k,v])=>`<div class="fact"><span>${k}</span><strong>${esc(v)}</strong></div>`).join("");
    $("bondTableBody").innerHTML=rows.slice().reverse().slice(0,10).map(row=>`<tr><td>${row.date}</td>${["3M","2Y","5Y","10Y","30Y"].map(key=>`<td>${number(row.rates[key],2)}%</td>`).join("")}</tr>`).join("");
  }

  async function initPage(){try{const data=await loadData(),page=document.body.dataset.marketPage;if(page==="indices")initIndices(data);if(page==="forex")initForex(data);if(page==="bonds")initBonds(data);}catch(error){showError(error);}}
  // 頁面元素都位於此 script 之前；不等待可能受外部會員 CDN 影響的 DOMContentLoaded。
  setTimeout(initPage,0);
})();
