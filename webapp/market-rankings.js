(function(){
  'use strict';
  const panel=document.getElementById('marketRankingsPanel');if(!panel)return;
  const C=window.MarketRankingsCore,$=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt=(value,digits=2)=>C.finite(value)?value.toLocaleString('zh-TW',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
  const signed=(value,suffix='')=>C.finite(value)?`${value>0?'+':''}${fmt(value)}${suffix}`:'—';
  const tone=value=>value>0?'up':value<0?'down':'flat';
  const state={mode:'live',market:'all',metric:'volume',kind:'all',query:''};
  let data=null,shown=20,busy=false,sequence=0,active=null,lastAttempt=0;
  function controls(){
    panel.querySelectorAll('[data-ranking-metric]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.rankingMetric===state.metric)));
    panel.querySelectorAll('[data-ranking-market]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.rankingMarket===state.market)));
    $('rankingTableTitle').textContent=`${C.metrics[state.metric].label}排行`;
    $('rankingAuto').disabled=state.mode!=='live';
  }
  function freshness(){
    const live=data?.quoteType==='intradaySnapshot',age=live?Math.max(0,Math.floor((Date.now()-Date.parse(data.sourceTime))/1000)):0;
    $('rankingAge').textContent=live?`來源快照約 ${age<60?`${age} 秒`:`${Math.floor(age/60)} 分鐘`}前${age>300?' · 資料可能已過時':''}`:'';
    $('rankingAge').classList.toggle('ranking-stale',live&&age>300);
  }
  function render(){
    controls();if(!data)return;
    const rows=C.rank(data.rows,state),live=data.quoteType==='intradaySnapshot';
    $('rankingPriceHeader').textContent=live?'成交價':'收盤價';
    const time=live?new Date(data.sourceTime).toLocaleString('sv-SE',{timeZone:'Asia/Taipei',hour12:false}):data.asOf;
    $('rankingDate').textContent=live?`${time} · ${data.sessionState==='open'?'盤中':'交易'}快照（可能延遲）`:`資料日 ${data.asOf} · 官方收盤（非即時）`;
    const counts=market=>data.rows.filter(row=>row.exchange===market).length;
    $('rankingCoverage').textContent=live?`Yahoo 股市來源前 ${data.sourceRows} 名，本頁 ${data.rows.length} 檔符合股票／ETF 條件；搜尋與標的篩選限於此榜。切換市場或指標會重新取得該榜。`:
      `${data.intradayUnavailable?'盤中快照暫缺或已過時，改顯示官方收盤。 ':''}${data.fallback?'目前顯示已保存的完整收盤資料。':'已取得兩市場同一交易日的官方收盤資料。'} 上市 ${fmt(counts('TWSE'),0)} 檔、上櫃 ${fmt(counts('TPEX'),0)} 檔。`;
    $('rankingSourceNote').textContent=live?'盤中模式每 30 秒嘗試更新，來源為 Yahoo 股市公開排行快照，並非逐筆行情。實際新舊以來源時間為準；盤中超過 5 分鐘的來源快照會退回官方收盤。需要完整標的篩選時可切換「官方收盤」。':'官方收盤模式提供完整上市、上櫃有成交股票與 ETF；資料日不一定是今天。除權息等無可比較漲跌者保留官方註記，不列入漲跌幅排行。';
    $('rankingSourceLink').hidden=!live;
    if(live)$('rankingSourceLink').href=data.sourceUrl;
    $('rankingCount').textContent=`顯示 ${Math.min(shown,rows.length)}／${fmt(rows.length,0)} 檔${live?'（來源榜單內）':state.query||state.kind!=='all'?'（篩選後排行）':''}`;
    $('rankingRows').innerHTML=rows.slice(0,shown).map((row,index)=>{
      const limit=C.limitState(row),limitClass=limit?` ranking-limit-${limit}`:'',badge=limit?`<span class="ranking-limit-badge ranking-limit-${limit}">${limit==='up'?'漲停':'跌停'}</span>`:'';
      return `<tr><td class="ranking-position">${index+1}</td><td class="ranking-security"><a href="kline.html?market=TW&amp;symbol=${encodeURIComponent(row.code)}">${esc(row.name)}</a>${badge}<small>${esc(row.code)} · ${row.exchange==='TWSE'?'上市':'上櫃'}${row.kind==='etf'?' · ETF':''}</small></td><td class="${tone(row.change)}${limitClass}">${fmt(row.close)}</td><td class="${tone(row.change)}${limitClass}">${row.change==null?esc(row.changeNote||'—'):signed(row.change)}</td><td class="${tone(row.changePct)}${limitClass}">${signed(row.changePct,'%')}</td><td>${fmt(row.high)}</td><td>${fmt(row.low)}</td><td>${fmt(row.spread)}</td><td>${fmt(C.finite(row.volume)?row.volume/1000:null,3)}</td><td>${fmt(C.finite(row.turnover)?row.turnover/1e8:null,4)}</td></tr>`;
    }).join('')||'<tr><td colspan="10" class="ranking-empty">沒有符合條件的標的；盤中搜尋僅限來源榜單。</td></tr>';
    $('rankingMore').hidden=shown>=rows.length;freshness();
  }
  async function read(url,signal){
    const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,25000);
    signal.addEventListener('abort',abort,{once:true});
    try{if(signal.aborted)controller.abort();const response=await fetch(url,{cache:'no-cache',signal:controller.signal});if(!response.ok)throw new Error('行情載入失敗');const payload=await response.json();if(!C.valid(payload))throw new Error('行情資料不完整');return payload;}
    finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  async function load(reset=false){
    const ticket=++sequence;active?.abort();active=new AbortController();const signal=active.signal,request={...state};
    busy=true;lastAttempt=Date.now();controls();panel.setAttribute('aria-busy','true');$('rankingRefresh').disabled=true;$('rankingError').hidden=true;
    if(reset){data=null;$('rankingRows').innerHTML='<tr><td colspan="10" class="ranking-empty">正在取得所選市場與指標…</td></tr>';$('rankingDate').textContent='資料時間確認中…';$('rankingCoverage').textContent='';$('rankingCount').textContent='';$('rankingAge').textContent='';$('rankingMore').hidden=true;}
    $('rankingStatus').textContent=request.mode==='live'?'正在取得盤中快照…':'正在取得官方收盤…';
    try{
      let next;
      try{next=await read(`api/market_rankings?${new URLSearchParams({mode:request.mode,metric:request.metric,market:request.market})}`,signal);if(!C.matches(next,request))throw new Error('排行範圍不符');}
      catch(error){if(signal.aborted)throw error;next={...await read('price-history/market-rankings/latest.json',signal),fallback:true,intradayUnavailable:request.mode==='live'};}
      if(ticket!==sequence)return;
      if(C.older(next,data)){$('rankingStatus').textContent='來源回傳較早快照，保留目前較新的資料。';return;}
      data=next;render();$('rankingStatus').textContent=next.quoteType==='intradaySnapshot'?'盤中快照已更新':next.intradayUnavailable?'盤中暫缺 · 顯示官方收盤':next.fallback?'已載入保存資料':'官方收盤資料已更新';
    }catch{
      if(ticket!==sequence)return;
      $('rankingError').hidden=false;$('rankingError').textContent=data?'更新失敗，保留畫面上標示時間的前次資料；可重新整理或切換官方收盤。':'排行資料暫時無法取得，請稍後重新整理。';
      $('rankingStatus').textContent=data?'更新失敗，顯示前次資料':'資料載入失敗';
      if(!data){$('rankingDate').textContent='尚無可用資料日期';$('rankingRows').innerHTML='<tr><td colspan="10" class="ranking-empty">目前沒有可顯示的排行資料。</td></tr>';}
    }finally{if(ticket===sequence){busy=false;panel.setAttribute('aria-busy','false');$('rankingRefresh').disabled=false;}}
  }
  panel.addEventListener('click',event=>{
    const metric=event.target.closest('[data-ranking-metric]'),market=event.target.closest('[data-ranking-market]');
    if(!metric&&!market)return;
    if(metric)state.metric=metric.dataset.rankingMetric;if(market)state.market=market.dataset.rankingMarket;shown=20;
    if(state.mode==='live'||busy)load(true);else render();
  });
  $('rankingMode').addEventListener('change',event=>{state.mode=event.target.value;shown=20;load(true);});
  $('rankingKind').addEventListener('change',event=>{state.kind=event.target.value;shown=20;render();});
  $('rankingSearch').addEventListener('input',event=>{state.query=event.target.value;shown=20;render();});
  $('rankingMore').addEventListener('click',()=>{shown+=20;render();});
  $('rankingRefresh').addEventListener('click',()=>load());
  const refresh=()=>{if(!document.hidden&&!busy&&state.mode==='live'&&$('rankingAuto').checked)load();};
  setInterval(refresh,30000);setInterval(freshness,5000);document.addEventListener('visibilitychange',()=>{if(Date.now()-lastAttempt>=30000)refresh();});
  load();
})();
