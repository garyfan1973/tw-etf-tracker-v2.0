(function(){
  'use strict';
  const panel=document.getElementById('marketRankingsPanel');if(!panel)return;
  const C=window.MarketRankingsCore,$=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt=(value,digits=2)=>C.finite(value)?value.toLocaleString('zh-TW',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
  const signed=(value,suffix='')=>C.finite(value)?`${value>0?'+':''}${fmt(value)}${suffix}`:'—';
  const tone=value=>value>0?'up':value<0?'down':'flat';
  const state={market:'all',metric:'volume',kind:'all',query:''};
  let data=null,shown=20,busy=false;
  function render(){
    if(!data)return;
    const rows=C.rank(data.rows,state),metric=C.metrics[state.metric];
    panel.querySelectorAll('[data-ranking-metric]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.rankingMetric===state.metric)));
    panel.querySelectorAll('[data-ranking-market]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.rankingMarket===state.market)));
    $('rankingTableTitle').textContent=`${metric.label}排行`;
    $('rankingDate').textContent=`資料日 ${data.asOf} · 官方收盤（非即時）`;
    const counts=market=>data.rows.filter(row=>row.exchange===market).length;
    $('rankingCoverage').textContent=`${data.fallback?'顯示已保存的完整收盤資料；目前無法確認兩市場最新同日資料。':'已取得兩市場同一交易日的官方收盤資料。'} 上市 ${fmt(counts('TWSE'),0)} 檔、上櫃 ${fmt(counts('TPEX'),0)} 檔。`;
    $('rankingCount').textContent=`顯示 ${Math.min(shown,rows.length)}／${fmt(rows.length,0)} 檔${state.query||state.kind!=='all'?'（篩選後排行）':''}`;
    $('rankingRows').innerHTML=rows.slice(0,shown).map((row,index)=>`<tr><td class="ranking-position">${index+1}</td><td class="ranking-security"><a href="kline.html?market=TW&amp;symbol=${encodeURIComponent(row.code)}">${esc(row.name)}</a><small>${esc(row.code)} · ${row.exchange==='TWSE'?'上市':'上櫃'}${row.kind==='etf'?' · ETF':''}</small></td><td class="${tone(row.change)}">${fmt(row.close)}</td><td class="${tone(row.change)}">${row.change==null?esc(row.changeNote||'—'):signed(row.change)}</td><td class="${tone(row.changePct)}">${signed(row.changePct,'%')}</td><td>${fmt(row.high)}</td><td>${fmt(row.low)}</td><td>${fmt(row.spread)}</td><td>${fmt(C.finite(row.volume)?row.volume/1000:null,3)}</td><td>${fmt(C.finite(row.turnover)?row.turnover/1e8:null,4)}</td></tr>`).join('')||'<tr><td colspan="10" class="ranking-empty">沒有符合條件的標的。</td></tr>';
    $('rankingMore').hidden=shown>=rows.length;
  }
  async function read(url){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetch(url,{cache:'no-cache',signal:controller.signal});if(!response.ok)throw new Error('行情載入失敗');const payload=await response.json();if(!C.valid(payload))throw new Error('行情資料不完整');return payload;}finally{clearTimeout(timer);}
  }
  async function load(){
    if(busy)return;busy=true;panel.setAttribute('aria-busy','true');$('rankingRefresh').disabled=true;$('rankingError').hidden=true;
    $('rankingStatus').textContent='正在取得官方收盤資料…';
    try{
      let next;
      try{next=await read('api/market_rankings');}
      catch{next={...await read('price-history/market-rankings/latest.json'),fallback:true};}
      if(data&&next.asOf<data.asOf){$('rankingStatus').textContent='來源回傳較早資料，保留目前較新的收盤資料。';return;}
      data=next;render();
      $('rankingStatus').textContent=next.fallback?'已載入保存資料':'官方收盤資料已更新';
    }catch{
      $('rankingError').hidden=false;$('rankingError').textContent=data?'更新失敗，保留目前顯示的資料日期；請稍後重新整理。':'排行資料暫時無法取得，請稍後重新整理。';
      $('rankingStatus').textContent=data?'更新失敗，顯示前次資料':'資料載入失敗';
      if(!data){$('rankingDate').textContent='尚無可用資料日期';$('rankingRows').innerHTML='<tr><td colspan="10" class="ranking-empty">目前沒有可顯示的排行資料。</td></tr>';}
    }finally{busy=false;panel.setAttribute('aria-busy','false');$('rankingRefresh').disabled=false;}
  }
  panel.addEventListener('click',event=>{
    const metric=event.target.closest('[data-ranking-metric]'),market=event.target.closest('[data-ranking-market]');
    if(metric)state.metric=metric.dataset.rankingMetric;if(market)state.market=market.dataset.rankingMarket;
    if(metric||market){shown=20;render();}
  });
  $('rankingKind').addEventListener('change',event=>{state.kind=event.target.value;shown=20;render();});
  $('rankingSearch').addEventListener('input',event=>{state.query=event.target.value;shown=20;render();});
  $('rankingMore').addEventListener('click',()=>{shown+=20;render();});
  $('rankingRefresh').addEventListener('click',load);
  load();
})();
