(async function(){
  'use strict';
  const C=window.MarketFlowCore,$=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,d=1)=>C.finite(v)?v.toLocaleString('zh-TW',{maximumFractionDigits:d}):'—';
  const tone=v=>C.finite(v)?v>0?'flow-positive':v<0?'flow-negative':'':'';
  const base='price-history/market-flow/',cache=new Map();
  let index,navs,meta,days=[],ranked=[],shown=50,request=0;
  async function json(path){const r=await fetch(base+path,{cache:'no-cache'});if(!r.ok)throw new Error('資料暫時無法載入，請稍後重新整理。');return r.json();}
  async function day(date){if(!cache.has(date))cache.set(date,json(date+'.json').catch(e=>{cache.delete(date);throw e;}));return cache.get(date);}
  const state=()=>({market:$('flowMarket').value,kind:$('flowKind').value,query:$('flowSearch').value,watch:$('flowWatch').checked});
  async function load(){
    const id=++request; $('flowCoverage').textContent='正在讀取指定交易日…';$('flowError').hidden=true;
    days=[];ranked=[];$('exportFlow').disabled=true;$('flowRows').innerHTML='';$('flowSummary').innerHTML='';$('flowSignals').innerHTML='';$('flowCount').textContent='';$('flowMore').hidden=true;
    try{
      const end=$('flowDate').value, count=Number($('flowPeriod').value), eligible=index.dates.filter(d=>d.date<=end).slice(-count);
      if(eligible.length<count)throw new Error(`目前只有 ${eligible.length} 個已保存交易日，尚不足 ${count} 日累計。`);
      const gaps=(index.calendarGaps||[]).filter(d=>d>=eligible[0].date&&d<=end);
      if(count>1&&gaps.length)throw new Error(`此區間缺少已知交易日 ${gaps.join('、')}，暫不計算跨缺口累計。`);
      const values=await Promise.all(eligible.map(d=>day(d.date)));
      if(id!==request)return;
      days=values;shown=50;$('flowDetail').hidden=true;$('exportFlow').disabled=false;render();
    }catch(e){if(id===request){$('flowError').textContent=e.message;$('flowError').hidden=false;$('flowCoverage').textContent='未更新排行；請調整期間或重新整理。';$('flowRows').innerHTML='';$('flowSummary').innerHTML='';$('flowSignals').innerHTML='';$('flowCount').textContent='';ranked=[];}}
  }
  function render(){
    if(!days.length)return;
    const rows=C.filter(C.aggregate(days,navs,meta),state()),metric=$('flowMetric').value,direction=$('flowDirection').value;
    ranked=C.rank(rows,metric,direction);
    const date=days.at(-1).date,missing=days.flatMap(d=>d.missingSources.map(s=>`${d.date} ${s}`));
    const complete=rows.filter(r=>C.finite(r.foreign)).length,etfs=rows.filter(r=>r.kind==='etf'),navCount=etfs.filter(r=>C.finite(r.premium)).length;
    $('updated').textContent=`盤後資料 ${date} · 非即時`;
    $('flowCoverage').textContent=`${days[0].date} ～ ${date} · ${days.length} 交易日｜篩選 ${rows.length} 檔，完整外資累計 ${complete} 檔｜同日 ETF 折溢價 ${navCount}/${etfs.length} 檔${missing.length?'｜缺漏來源：'+missing.join('、'):''}。未提供的欄位不補零；缺少排序值不列入排名。`;
    const amounts=rows.map(r=>r.amount).filter(C.finite),buy=amounts.filter(v=>v>0).reduce((a,b)=>a+b,0),sell=amounts.filter(v=>v<0).reduce((a,b)=>a+b,0);
    $('flowSummary').innerHTML=[['目前篩選標的',fmt(rows.length,0)+' 檔'],['買超淨額估算',fmt(buy/1e8)+' 億'],['賣超淨額估算',fmt(sell/1e8)+' 億'],['三訊號交會 ETF',fmt(etfs.filter(r=>r.signals.length===3).length,0)+' 檔']].map(([a,b])=>`<article><span>${a}</span><strong>${b}</strong></article>`).join('');
    const watches=etfs.filter(r=>r.signals.length===3).sort((a,b)=>a.foreign-b.foreign);
    $('flowSignals').innerHTML=watches.slice(0,10).map(r=>`<button data-detail="${esc(C.key(r))}" type="button"><strong>${esc(r.code)} ${esc(r.name)}</strong>折價 ${fmt(r.premium,2)}% · 借券餘額增 ${fmt(r.shortChange/1000)} 千</button>`).join('')||(etfs.length?'目前篩選沒有同時出現三項訊號的 ETF。':'請切換 ETF 篩選查看；股票本身不計算 ETF 折溢價。');
    $('flowSignals').querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>detail(b.dataset.detail)));
    $('flowCount').textContent=`${ranked.length} 檔可排名 · 顯示前 ${Math.min(shown,ranked.length)} 檔`;
    $('flowRows').innerHTML=ranked.slice(0,shown).map((r,i)=>`<tr><td><button type="button" data-detail="${esc(C.key(r))}">${i+1}. ${esc(r.code)} ${esc(r.name)}</button><small>${r.exchange} · ${r.kind==='etf'?(r.active?'主動式 ETF':'ETF'):'股票'}${r.currency==='FX'?' · 外幣計價':''} · 外資 ${r.days}/${days.length} 日</small></td>${[[r.amount===null?null:r.amount/1e6,1],[r.foreign===null?null:r.foreign/1000,1],[r.trust===null?null:r.trust/1000,1],[r.dealer===null?null:r.dealer/1000,1],[r.flowRatio,2],[r.close,2],[r.nav,2],[r.premium,2],[C.finite(r.shortBalance)?r.shortBalance/1000:null,1],[C.finite(r.shortChange)?r.shortChange/1000:null,1]].map(([v,d],j)=>`<td class="${[0,1,2,3,4,7,9].includes(j)?tone(v):''}">${fmt(v,d)}</td>`).join('')}<td>${r.signals.map(s=>`<span class="flow-badge">${s}</span>`).join('')||'—'}</td></tr>`).join('')||'<tr><td colspan="12">此篩選沒有可排名資料。請改變方向、指標或篩選條件。</td></tr>';
    $('flowRows').querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>detail(b.dataset.detail)));
    $('flowMore').hidden=shown>=ranked.length;
  }
  function chart(series,title,unit){
    const valid=series.filter(p=>C.finite(p.value));if(!valid.length)return `<div class="flow-chart"><h3>${title}</h3><p>此期間尚無可用資料。</p></div>`;
    const W=480,H=200,L=65,R=12,T=15,B=30,lo=Math.min(0,...valid.map(p=>p.value)),hi=Math.max(0,...valid.map(p=>p.value)),span=hi-lo||1;
    const x=i=>L+i/Math.max(1,series.length-1)*(W-L-R),y=v=>T+(hi-v)/span*(H-T-B);
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><line x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}"/>`;
    [lo,hi].forEach(v=>{svg+=`<text x="${L-5}" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`;});
    series.forEach((p,i)=>{if(C.finite(p.value)){const yy=Math.min(y(0),y(p.value));svg+=`<rect x="${x(i)-3}" y="${yy}" width="6" height="${Math.max(1,Math.abs(y(p.value)-y(0)))}" fill="${p.value<0?'var(--down)':'var(--up)'}"><title>${p.date}：${fmt(p.value,2)} ${unit}</title></rect>`;}});
    svg+=`<text x="${L}" y="${H-5}">${series[0].date.slice(5)}</text><text x="${W-R}" y="${H-5}" text-anchor="end">${series.at(-1).date.slice(5)}</text></svg>`;
    return `<div class="flow-chart"><h3>${title} · ${unit}</h3>${svg}</div>`;
  }
  async function detail(k){
    const current=++detail.token,date=days.at(-1).date,range=index.dates.filter(d=>d.date<=date).slice(-20),panel=$('flowDetail');
    panel.hidden=false;panel.textContent='正在讀取近 20 個已保存交易日…';panel.scrollIntoView({behavior:'smooth',block:'start'});
    try{
      const history=await Promise.all(range.map(d=>day(d.date)));if(current!==detail.token)return;
      const row=history.at(-1).rows.find(r=>C.key(r)===k);if(!row)return;
      const code=row.code,series=history.map(d=>({date:d.date,row:d.rows.find(r=>C.key(r)===k)}));
      panel.innerHTML=`<div class="flow-section-head"><h2>${esc(code)} ${esc(row.name)} · 籌碼變化</h2><a href="tracker.html?view=overview&market=TW&symbol=${encodeURIComponent(code)}">查看個股／持股資訊 →</a></div><p class="flow-note">${range[0].date} ～ ${date}，${range.length} 個已保存交易日；缺值不補零。下列欄位可有不同缺漏，詳見明細。</p><div class="flow-summary"><article><span>${date} 外資持有量（千）</span><strong>${fmt(C.finite(row.foreignHolding)?row.foreignHolding/1000:null)}</strong></article><article><span>官方外資持有比例</span><strong>${fmt(row.foreignHoldingPct,2)}%</strong></article><article><span>發行股數／單位數（百萬）</span><strong>${fmt(C.finite(row.issuedUnits)?row.issuedUnits/1e6:null)}</strong></article><article><span>借券賣出餘額／發行量</span><strong>${fmt(C.finite(row.shortBalance)&&row.issuedUnits>0?row.shortBalance/row.issuedUnits*100:null,2)}%</strong></article></div><div class="flow-detail-grid">${chart(series.map(p=>({date:p.date,value:C.finite(p.row?.foreign)?p.row.foreign/1000:null})),'外資每日買賣超','千股／單位')}${chart(series.map(p=>({date:p.date,value:C.finite(p.row?.shortChange)?p.row.shortChange/1000:null})),'借券賣出餘額每日增減','千股／單位')}${row.kind==='etf'?chart(series.map(p=>({date:p.date,value:navs[code]?.[p.date]?.premium})),'ETF 收盤折溢價','%')+chart(series.map(p=>({date:p.date,value:C.finite(p.row?.issuedUnits)?p.row.issuedUnits/1e6:null})),'ETF 發行單位數','百萬單位'):''}${chart(series.map(p=>({date:p.date,value:C.finite(p.row?.foreignHolding)?p.row.foreignHolding/1000:null})),'官方外資持有量','千股／單位')}</div><p class="flow-note">外資持有量依持股統計，不用累計買賣超反推；可能受交割、申贖與統計口徑影響。發行單位變化也可能涉及拆併或其他異動，不能僅憑此圖認定投信被迫賣股。<a href="taiwan-futures.html">搭配台指期法人部位觀察 →</a></p><div class="flow-scroll"><table class="flow-table"><thead><tr><th>日期</th><th>外資淨量（千）</th><th>借券餘額增減（千）</th><th>折溢價 %</th></tr></thead><tbody>${series.slice().reverse().map(p=>`<tr><td>${p.date}</td><td>${fmt(C.finite(p.row?.foreign)?p.row.foreign/1000:null)}</td><td>${fmt(C.finite(p.row?.shortChange)?p.row.shortChange/1000:null)}</td><td>${row.kind==='etf'?fmt(navs[code]?.[p.date]?.premium,2):'不適用'}</td></tr>`).join('')}</tbody></table></div>`;
    }catch(e){if(current===detail.token)panel.textContent=e.message;}
  }
  detail.token=0;
  try{
    [index,navs,meta]=await Promise.all([json('index.json'),json('nav.json'),json('etf-meta.json')]);
    $('flowDate').innerHTML=index.dates.slice().reverse().map(d=>`<option value="${d.date}">${d.date}${d.missingSources.length?'（部分來源缺漏）':''}</option>`).join('');
    $('flowDate').value=index.latest;
    ['flowDate','flowPeriod'].forEach(id=>$(id).addEventListener('change',()=>{detail.token++;load();}));
    ['flowMarket','flowKind','flowMetric','flowDirection','flowWatch'].forEach(id=>$(id).addEventListener('change',()=>{shown=50;render();}));
    $('flowSearch').addEventListener('input',()=>{shown=50;render();});$('flowMore').addEventListener('click',()=>{shown+=50;render();});
    $('exportFlow').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([C.csv(ranked)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`market-flow-${$('flowDate').value}-${$('flowPeriod').value}d.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    await load();
    let estimates=[],estimateShown=50;
    function renderEstimates(){
      const q=$('estimateSearch').value.trim().toLowerCase(),active=$('estimateKind').value==='active',desc=$('estimateDirection').value==='premium';
      const rows=estimates.filter(r=>(!q||`${r.code} ${r.name}`.toLowerCase().includes(q))&&(!active||(meta[r.code]?.active??r.name.includes('主動')))).sort((a,b)=>(a.estimatedPremium-b.estimatedPremium)*(desc?-1:1));
      $('estimateRows').innerHTML=rows.slice(0,estimateShown).map(r=>`<tr><td><a href="tracker.html?view=overview&market=TW&symbol=${encodeURIComponent(r.code)}">${esc(r.code)} ${esc(r.name)}</a><small>${r.date} ${r.time}</small></td><td>${fmt(r.price,3)}</td><td>${fmt(r.estimatedNav,4)}</td><td class="${tone(r.estimatedPremium)}">${fmt(r.estimatedPremium,2)}</td><td>${fmt(C.finite(r.issuedUnits)?r.issuedUnits/1e6:null)}</td><td>${fmt(C.finite(r.unitsChange)?r.unitsChange/1000:null)}</td></tr>`).join('')||'<tr><td colspan="6">沒有符合條件的預估值。</td></tr>';
      $('estimateMore').hidden=estimateShown>=rows.length;
    }
    async function loadEstimates(){
      $('refreshEstimates').disabled=true;$('estimateStatus').textContent='正在查詢投信揭露預估值…';
      try{const response=await fetch('/api/etf-estimates',{cache:'no-cache'}),p=await response.json();if(!response.ok||!p.ok)throw new Error(p.error||'預估值暫時無法取得');estimates=p.rows;estimateShown=50;renderEstimates();const dates=[...new Set(estimates.map(r=>r.date))].sort();$('estimateStatus').textContent=`${estimates.length} 檔可用預估值 · 揭露日期 ${dates[0]} ～ ${dates.at(-1)} · 伺服器查詢 ${p.fetchedAt}。請逐列核對揭露時間；日期不同不合併推論。`;}catch(e){$('estimateStatus').textContent=e.message+(estimates.length?'（保留上次顯示值，請核對時間）':'');}finally{$('refreshEstimates').disabled=false;}
    }
    ['estimateKind','estimateDirection'].forEach(id=>$(id).addEventListener('change',()=>{estimateShown=50;renderEstimates();}));$('estimateSearch').addEventListener('input',()=>{estimateShown=50;renderEstimates();});$('estimateMore').addEventListener('click',()=>{estimateShown+=50;renderEstimates();});$('refreshEstimates').addEventListener('click',loadEstimates);loadEstimates();
  }catch(e){$('flowError').textContent=e.message;$('flowError').hidden=false;$('updated').textContent='資料暫時無法取得';}
})();
