(function(){
  'use strict';
  const $=id=>document.getElementById(id),panel=$('creditRankingsPanel');if(!panel)return;
  const C=window.CreditRankingsCore,state={side:'margin',unit:'lots',order:'increase',market:'all',kind:'all',query:''};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,d=0)=>C.finite(n)?n.toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const signed=(n,d=0)=>C.finite(n)?`${n>0?'+':''}${fmt(n,d)}`:'—';
  const tone=n=>n>0?'up':n<0?'down':'flat';
  let data=null,shown=20,busy=false;
  function controls(){
    for(const group of ['side','unit','market'])panel.querySelectorAll(`[data-credit-${group}]`).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset['credit'+group[0].toUpperCase()+group.slice(1)]===state[group])));
    const side=state.side==='margin'?'融資':'融券',order={increase:'增加',decrease:'減少',balance:'餘額'}[state.order];
    $('creditTableTitle').textContent=`${side}${state.order==='balance'?'':'餘額'}${order}排行 · ${state.unit==='lots'?'張數':'估算市值'}`;
    ['creditBalanceHeader','creditDeltaHeader','creditValueHeader','creditDeltaValueHeader'].forEach((id,i)=>$(id).textContent=side+['餘額（張）','增減（張）','餘額估算市值（億）','增減估算金額（億）'][i]);
    const selected=state.order==='balance'?(state.unit==='lots'?'creditBalanceHeader':'creditValueHeader'):(state.unit==='lots'?'creditDeltaHeader':'creditDeltaValueHeader');
    panel.querySelectorAll('th').forEach(th=>{th.removeAttribute('aria-sort');th.classList.toggle('credit-sort-column',th.id===selected);});
    $(selected).setAttribute('aria-sort',state.order==='decrease'?'ascending':'descending');
  }
  function render(){
    controls();if(!data)return;
    const rows=C.rank(data.rows,state),scope=data.rows.filter(r=>(state.market==='all'||r.exchange===state.market)&&(state.kind==='all'||r.kind===state.kind));
    const missing=scope.filter(r=>r.close===null).length;
    $('creditDate').textContent=`資料日 ${data.asOf} · 盤後公布（非即時）`;
    $('creditCoverage').textContent=`上市 ${fmt(data.rows.filter(r=>r.exchange==='TWSE').length)} 檔、上櫃 ${fmt(data.rows.filter(r=>r.exchange==='TPEX').length)} 檔；搜尋與篩選涵蓋完整資券名單。${missing?` 目前市場／標的篩選內 ${fmt(missing)} 檔缺同日有效收盤價，保留張數、不列金額排行。`:''} 資料由每日排程更新。`;
    $('creditRows').innerHTML=rows.slice(0,shown).map((r,i)=>{const side=state.side,delta=r[side+'DeltaLots'],value=r[side+'DeltaValue'];return `<tr><td class="ranking-position">${i+1}</td><td class="ranking-security"><a href="kline.html?market=TW&amp;symbol=${encodeURIComponent(r.code)}">${esc(r.name)}</a><small>${esc(r.code)} · ${r.exchange==='TWSE'?'上市':'上櫃'}${r.kind==='etf'?' · ETF':''}</small></td><td>${fmt(r.close,2)}</td><td>${fmt(r[side+'BalanceLots'])}</td><td class="${tone(delta)}">${signed(delta)}</td><td>${fmt(C.finite(r[side+'BalanceValue'])?r[side+'BalanceValue']/1e8:null,4)}</td><td class="${tone(value)}">${signed(C.finite(value)?value/1e8:null,4)}</td></tr>`;}).join('')||'<tr><td colspan="7" class="ranking-empty">沒有符合條件的標的；可調整排行方向、市場或搜尋。</td></tr>';
    $('creditCount').textContent=`顯示 ${Math.min(shown,rows.length)}／${fmt(rows.length)} 檔`;$('creditMore').hidden=shown>=rows.length;
  }
  async function load(){
    if(busy)return;busy=true;$('creditRefresh').disabled=true;panel.setAttribute('aria-busy','true');$('creditError').hidden=true;$('creditStatus').textContent='正在取得官方資券資料…';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('price-history/credit-rankings/latest.json',{cache:'no-cache',signal:controller.signal});
      if(!response.ok)throw new Error('unavailable');const next=await response.json();
      if(!C.valid(next)||data&&next.asOf<data.asOf)throw new Error('invalid session');
      data=next;render();$('creditStatus').textContent='官方盤後資料已載入';
    }catch{
      $('creditStatus').textContent=data?'更新失敗，保留前次資料':'資券資料暫缺';$('creditError').hidden=false;
      $('creditError').textContent=data?'更新失敗，保留畫面標示日期的前次資料，可稍後重試。':'資券排行暫時無法取得，請稍後重新整理。';
      if(!data)$('creditRows').innerHTML='<tr><td colspan="7" class="ranking-empty">目前沒有可顯示的資券排行。</td></tr>';
    }finally{clearTimeout(timer);busy=false;$('creditRefresh').disabled=false;panel.setAttribute('aria-busy','false');}
  }
  panel.addEventListener('click',event=>{
    for(const group of ['side','unit','market']){
      const button=event.target.closest(`[data-credit-${group}]`);if(!button)continue;
      state[group]=button.dataset['credit'+group[0].toUpperCase()+group.slice(1)];shown=20;render();break;
    }
  });
  for(const [id,key] of [['creditOrder','order'],['creditKind','kind'],['creditSearch','query']])$(id).addEventListener(id==='creditSearch'?'input':'change',e=>{state[key]=e.target.value;shown=20;render();});
  $('creditRefresh').addEventListener('click',load);$('creditMore').addEventListener('click',()=>{shown+=20;render();});
  const tabs=[...document.querySelectorAll('[data-ranking-category]')];
  function selectTab(tab){
    tabs.forEach(t=>{const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;$(t.getAttribute('aria-controls')).hidden=!selected;});
    if(tab.dataset.rankingCategory==='credit'&&!data)load();
  }
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>selectTab(tab));
    tab.addEventListener('keydown',event=>{
      const target=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(i+1)%tabs.length:event.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:null;
      if(target!==null){event.preventDefault();selectTab(tabs[target]);tabs[target].focus();}
    });
  });
  controls();
})();
