(function(){
  const $=id=>document.getElementById(id), fmt=(n,d=0)=>n==null?"—":Number(n).toLocaleString("zh-TW",{minimumFractionDigits:d,maximumFractionDigits:d});
  let data, active="TX";
  const tone=n=>n>0?"up":n<0?"down":"flat";
  function sessionCard(row,title){
    if(!row)return `<article class="futures-session-card"><span>${title}</span><strong>—</strong><small>此契約時段無成交資料</small></article>`;
    const move=`${row.change>0?"▲ +":row.change<0?"▼ ":""}${fmt(row.change,0)} (${row.changePct>0?"+":""}${fmt(row.changePct,2)}%)`;
    return `<article class="futures-session-card"><div><span>${title}</span><b>${row.month}</b></div><strong>${fmt(row.last,0)}</strong><em class="${tone(row.change)}">${move}</em><dl><div><dt>開高低</dt><dd>${fmt(row.open)} / ${fmt(row.high)} / ${fmt(row.low)}</dd></div><div><dt>成交量</dt><dd>${fmt(row.volume)}</dd></div><div><dt>未平倉</dt><dd>${fmt(row.openInterest)}</dd></div><div><dt>最佳買／賣</dt><dd>${fmt(row.bid)} / ${fmt(row.ask)}</dd></div></dl></article>`;
  }
  function renderProduct(){
    const product=data.products[active]; if(!product)return;
    $("sessionCards").innerHTML=sessionCard(product.day,"一般交易")+sessionCard(product.night,"盤後交易");
    $("termRows").innerHTML=product.termStructure.map(r=>`<tr><td>${r.month}</td><td>${fmt(r.last)}</td><td class="${tone(r.change)}">${r.change>0?"+":""}${fmt(r.change)} (${fmt(r.changePct,2)}%)</td><td>${fmt(r.settlement)}</td><td>${fmt(r.volume)}</td><td>${fmt(r.openInterest)}</td></tr>`).join("")||'<tr><td colspan="6">暫無期限結構資料</td></tr>';
    document.querySelectorAll("[data-product]").forEach(b=>b.classList.toggle("active",b.dataset.product===active));
  }
  function renderInstitutions(){
    const block=data.institutional||{}; $("instDate").textContent=`${block.asOfDate||"—"} 未平倉淨部位`;
    $("institutionRows").innerHTML=(block.rows||[]).map(r=>`<div><span>${r.name}</span><strong class="${tone(r.openInterestNet)}">${r.openInterestNet>0?"淨多 +":"淨空 "}${fmt(r.openInterestNet)} 口</strong><small>多 ${fmt(r.openInterestLong)}／空 ${fmt(r.openInterestShort)}・當日交易淨額 ${r.tradingNet>0?"+":""}${fmt(r.tradingNet)}</small></div>`).join("")||"暫無法人資料";
  }
  function renderPutCall(){
    const rows=(data.putCall||[]).slice(0,10).reverse(), max=Math.max(150,...rows.flatMap(r=>[r.volumeRatio||0,r.openInterestRatio||0]));
    $("putCallChart").innerHTML=`<div class="pc-legend"><span><i></i>成交量比</span><span><i></i>未平倉量比</span></div>`+rows.map(r=>`<div class="pc-row"><time>${r.date.slice(5)}</time><div><i style="width:${(r.volumeRatio/max*100).toFixed(1)}%"></i><b>${fmt(r.volumeRatio,1)}%</b></div><div><i style="width:${(r.openInterestRatio/max*100).toFixed(1)}%"></i><b>${fmt(r.openInterestRatio,1)}%</b></div></div>`).join("");
  }
  async function init(){
    try{const response=await fetch("api/taiwan_futures",{cache:"no-store"});data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"資料載入失敗");
      $("futuresUpdated").textContent=`${data.asOfDate} 最近完整交易資料`;renderProduct();renderInstitutions();renderPutCall();
    }catch(error){$("futuresError").hidden=false;$("futuresError").textContent=error.message;$("futuresUpdated").textContent="資料暫時無法取得";}
  }
  document.querySelectorAll("[data-product]").forEach(b=>b.addEventListener("click",()=>{active=b.dataset.product;renderProduct();}));init();
})();
