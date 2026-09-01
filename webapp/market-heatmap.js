(function(){
  const $=id=>document.getElementById(id),esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const state={market:"TWSE",timer:null,loading:false};
  function split(items,x,y,w,h,out){
    if(!items.length)return;if(items.length===1){out.push({...items[0],x,y,w,h});return;}
    const total=items.reduce((sum,item)=>sum+Math.max(1,Number(item.turnover)||1),0);let acc=0,index=0;
    for(;index<items.length-1;index++){const next=acc+Math.max(1,Number(items[index].turnover)||1);if(next>=total/2){acc=next;index++;break}acc=next;}
    const ratio=Math.max(.18,Math.min(.82,acc/total)),first=items.slice(0,index),second=items.slice(index);
    if(w>=h){split(first,x,y,w*ratio,h,out);split(second,x+w*ratio,y,w*(1-ratio),h,out)}else{split(first,x,y,w,h*ratio,out);split(second,x,y+h*ratio,w,h*(1-ratio),out)}
  }
  function color(value){const v=Math.max(-10,Math.min(10,Number(value)||0)),strength=Math.min(1,Math.abs(v)/7);if(v>0)return `hsl(354 82% ${28+strength*17}%)`;if(v<0)return `hsl(154 78% ${20+strength*8}%)`;return "hsl(215 13% 34%)";}
  function render(data){
    const target=$("marketHeatmap"),rects=[];split(data.items||[],0,0,100,100,rects);target.innerHTML=rects.map(item=>{const small=Math.min(item.w,item.h)<13,tiny=Math.min(item.w,item.h)<8,label=tiny?item.symbol:item.name;return `<a class="market-heat-tile${small?" small":""}${tiny?" tiny":""}" href="kline.html?market=TW&symbol=${encodeURIComponent(item.symbol)}" style="left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%;background:${color(item.changePct)}" title="${esc(item.name)} ${item.symbol}｜${Number(item.changePct)>0?"+":""}${Number(item.changePct).toFixed(2)}%｜成交金額 ${Number(item.turnover).toLocaleString("zh-TW")}"><b>${esc(label)}</b><span>${Number(item.changePct)>0?"+":""}${Number(item.changePct).toFixed(2)}%</span>${small?"":`<small>${esc(item.symbol)}</small>`}</a>`}).join("")||'<div class="heatmap-empty">目前沒有可顯示的行情</div>';
    const updated=new Date(data.updatedAt),live=Number(data.liveCount)||0;$("heatmapStatus").textContent=`${live?`即時 ${live} 檔`:`最近收盤 ${data.asOf||"—"}`}・${Number.isNaN(updated.getTime())?"":updated.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})} 更新・面積依成交金額`;
  }
  async function load(){if(state.loading)return;state.loading=true;$("heatmapStatus").textContent="熱力圖更新中…";try{const response=await fetch(`/api/market_heatmap?market=${state.market}&limit=36`,{cache:"no-store"}),data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"讀取失敗");render(data)}catch(error){$("marketHeatmap").innerHTML=`<div class="heatmap-empty">${esc(error.message||"熱力圖暫時無法載入")}</div>`;$("heatmapStatus").textContent="請稍後重新整理"}finally{state.loading=false}}
  document.querySelectorAll("[data-heat-market]").forEach(button=>button.addEventListener("click",()=>{state.market=button.dataset.heatMarket;document.querySelectorAll("[data-heat-market]").forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-selected",String(active))});load()}));
  load();state.timer=setInterval(()=>{if(!document.hidden)load()},45000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()});
})();
