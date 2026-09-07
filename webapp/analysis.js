(function () {
  'use strict';
  const C=window.AnalysisCore, $=id=>document.getElementById(id), path=window.AnalysisChartPath;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(v,d=2)=>C.finite(v)?v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const pct=v=>C.finite(v)?`${v>0?'+':''}${number(v)}%`:'—';
  const tone=v=>!C.finite(v)||v===0?'neutral':v>0?'positive':'negative';
  const regions={TW:'台灣',US:'美國',JP:'日本',KS:'韓國'};
  const indexBenchmarks={TW:[['twii','台灣加權指數']],US:[['sp500','S&P 500'],['nasdaq100','Nasdaq 100'],['sox','費城半導體指數']],JP:[['nikkei','日經 225']],KS:[['kospi','韓國綜合指數']]};
  let catalog=[], current=null, benchmarkRows=[], requestId=0, scanLimit=10, toastTimer, dataReady=false;
  const cache=new Map(), params=new URLSearchParams(location.search);
  let saved={}; try {saved=JSON.parse(localStorage.getItem('research-analysis-v1')||'{}')||{};} catch (_) {}
  let pins=Array.isArray(saved.pins)?saved.pins.filter(s=>typeof s==='string').slice(0,12):['TW:2330','TW:0050','TW:00981A','US:NVDA'];
  const getSetting=(key,fallback)=>params.get(key)||saved[key]||fallback;
  const initialMarket=getSetting('market','TW'); $('market').value=regions[initialMarket]?initialMarket:'TW';
  let selectedSymbol=String(getSetting('symbol','2330')), selectedBenchmark=String(getSetting('benchmark',''));
  let selectedRange=['21','63','126','252','all'].includes(String(getSetting('range','63')))?String(getSetting('range','63')):'63';
  const chart=new window.AnalysisChart($('mainChart'),onWindow,readout);
  chart.mode=['candle','line','compare'].includes(getSetting('mode','candle'))?getSetting('mode','candle'):'candle';
  chart.sub=['rsi','macd','kd'].includes(getSetting('sub','rsi'))?getSetting('sub','rsi'):'rsi';
  const rawOverlays=params.has('overlays')?params.get('overlays').split(','):Array.isArray(saved.overlays)?saved.overlays:['ma20','ma60'];
  chart.overlays=new Set(rawOverlays.filter(v=>['ma20','ma60','bollinger'].includes(v)));
  function persist() {
    const value={market:$('market').value,symbol:selectedSymbol,benchmark:selectedBenchmark,range:selectedRange,mode:chart.mode,sub:chart.sub,overlays:[...chart.overlays],pins};
    try {localStorage.setItem('research-analysis-v1',JSON.stringify(value));} catch (_) {}
  }
  function toast(message) {$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
  function marketAssets() {return catalog.filter(a=>a.market===$('market').value);}
  function key(asset) {return `${asset.market}:${asset.symbol}`;}
  function syncButtons() {
    [['chartModes','mode',chart.mode],['subIndicators','sub',chart.sub],['ranges','range',selectedRange]].forEach(([id,attr,value])=>$(id).querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[attr]===value))));
    $('overlays').querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(chart.overlays.has(b.dataset.overlay)));b.disabled=chart.mode==='compare';});
    $('pin').setAttribute('aria-pressed',String(current&&pins.includes(key(current))));$('pin').textContent=current&&pins.includes(key(current))?'★':'☆';
    $('pin').setAttribute('aria-label',current&&pins.includes(key(current))?'移出本機觀察清單':'加入本機觀察清單');
  }
  async function fetchJSON(url) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try {const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error(`資料載入失敗（${response.status}）`);return await response.json();} finally {clearTimeout(timer);}
  }
  async function history(asset) {
    const id=key(asset);if(cache.has(id))return cache.get(id);
    const promise=fetchJSON(`price-history/${encodeURIComponent(asset.market)}/${encodeURIComponent(asset.symbol)}.json`).then(data=>{const rows=C.clean(data.rows);if(!rows.length)throw Error('此標的沒有有效歷史行情');return rows;}).catch(e=>{cache.delete(id);throw e;});cache.set(id,promise);return promise;
  }
  function benchmarkOptions() {return [...indexBenchmarks[$('market').value].map(([id,name])=>({market:'INDEX',symbol:'@'+id,name})),...marketAssets()];}
  function populateBenchmark() {
    const list=benchmarkOptions(), defaultSymbol=$('market').value==='TW'?'0050':list[0]?.symbol;
    if(!list.some(a=>a.symbol===selectedBenchmark))selectedBenchmark=defaultSymbol;
    $('benchmark').innerHTML=list.map(a=>`<option value="${esc(a.symbol)}">${a.market==='INDEX'?'指數':esc(a.symbol)} · ${esc(a.name)}</option>`).join('');$('benchmark').value=selectedBenchmark;
  }
  async function benchmarkHistory(asset) {
    if(asset.market!=='INDEX')return history(asset);
    if(!cache.has('market-indices'))cache.set('market-indices',fetchJSON('market_data.json').catch(e=>{cache.delete('market-indices');throw e;}));
    const data=await cache.get('market-indices'),item=data.indices?.find(a=>'@'+a.id===asset.symbol),rows=C.clean(item?.rows);
    if(!rows.length)throw Error('比較指數沒有有效歷史資料');return rows;
  }
  async function loadAsset(symbol,restore=false) {
    const asset=marketAssets().find(a=>a.symbol===symbol);if(!asset)return;
    const previousView=dataReady&&current&&key(current)===key(asset)?chart.visible():null;
    const run=++requestId; selectedSymbol=symbol; current=null;dataReady=false;$('researchLink').hidden=true;$('dashboard').setAttribute('aria-busy','true');$('error').hidden=true;$('status').textContent=`正在載入 ${asset.symbol} ${asset.name}…`;$('searchResults').hidden=true;$('search').setAttribute('aria-expanded','false');$('search').value=`${asset.symbol} ${asset.name}`;
    const benchmark=benchmarkOptions().find(a=>a.symbol===selectedBenchmark);
    try {
      const results=await Promise.allSettled([history(asset),benchmark?benchmarkHistory(benchmark):Promise.resolve([])]);if(run!==requestId)return;
      if(results[0].status==='rejected')throw results[0].reason;
      const rows=results[0].value;benchmarkRows=results[1].status==='fulfilled'?results[1].value:[];
      current=asset;chart.setData(rows,benchmarkRows);dataReady=true;$('researchLink').href=`tracker.html?view=kline&market=${encodeURIComponent(asset.market)}&symbol=${encodeURIComponent(asset.symbol)}`;$('researchLink').hidden=false;
      $('assetName').textContent=asset.name;$('assetSymbol').textContent=asset.symbol;$('assetAvatar').textContent=asset.market;
      $('assetMeta').textContent=`${regions[asset.market]} · ${asset.currency||'—'} · ${asset.industry||'已收錄歷史標的'}`;
      const last=rows.at(-1),prev=rows.at(-2),change=prev?(last.close/prev.close-1)*100:null;
      $('price').textContent=number(last.close);$('dailyChange').textContent=`${C.finite(change)&&change>=0?'↗':'↘'} ${pct(change)}`;$('dailyChange').className=tone(change);
      $('quoteDate').textContent=`${last.date} 收盤 · ${asset.currency||'—'}`;
      $('status').textContent=`${rows[0].date} — ${last.date} · ${rows.length} 筆有效日線${benchmarkRows.length?` · 基準 ${benchmark.name} 截至 ${benchmarkRows.at(-1).date}`:' · 比較基準載入失敗，可重新選擇或重試'}${rows.length<60?' · 歷史較短，部分指標尚未形成':''}`;
      if(results[1].status==='rejected') {$('error').hidden=false;$('error').querySelector('span').textContent='主標的已載入；比較基準暫時無法取得。';}
      if(restore&&params.has('from')&&params.has('to')) {
        const start=rows.findIndex(r=>r.date>=params.get('from')),end=rows.findLastIndex(r=>r.date<=params.get('to'));
        if(start>=0&&end>=start){selectedRange='custom';chart.setWindow(start,end+1);}else chart.range(selectedRange);
      }else if(previousView?.length){const start=rows.findIndex(r=>r.date>=previousView[0].date),end=rows.findLastIndex(r=>r.date<=previousView.at(-1).date);if(start>=0&&end>=start)chart.setWindow(start,end+1);else chart.range('63');}
      else {if(selectedRange==='custom')selectedRange='63';chart.range(selectedRange);}
      renderMonthly(rows);renderWatchlist();syncButtons();persist();$('dashboard').setAttribute('aria-busy','false');
    } catch (e) {
      if(run!==requestId)return;
      current=null;dataReady=false;chart.setData([],[]);chart.render();$('assetName').textContent=asset.name;$('assetSymbol').textContent=asset.symbol;$('price').textContent='—';$('dailyChange').textContent='—';$('quoteDate').textContent='行情未載入';$('assetMeta').textContent='無法取得歷史行情';$('metrics').innerHTML='';$('gauge').innerHTML='';$('signals').innerHTML='';$('signalDate').textContent='';$('drawdownChart').innerHTML='';$('drawdownValue').textContent='—';$('monthlyHeatmap').innerHTML='';$('chartLegend').textContent='';$('visibleDates').textContent='—';$('status').textContent='行情載入失敗，請重新嘗試。';$('error').hidden=false;$('error').querySelector('span').textContent=e.name==='AbortError'?'資料請求逾時，請重試。':e.message;$('dashboard').setAttribute('aria-busy','false');syncButtons();
    }
  }
  function spark(values,color='var(--accent)') {
    if(values.length<2)return '';
    const min=Math.min(...values),max=Math.max(...values),x=i=>i/(values.length-1)*110,y=v=>26-(v-min)/(max-min||1)*22;
    return `<svg viewBox="0 0 112 30" aria-hidden="true"><path d="${path(values,x,y)}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  }
  function onWindow() {
    if(!current||!dataReady)return;
    const rows=chart.visible(),m=C.metrics(rows),span=chart.end-chart.start;
    $('visibleDates').textContent=`${rows[0]?.date} → ${rows.at(-1)?.date} · ${span} 筆`;
    $('timeline').max=String(Math.max(0,chart.rows.length-span));$('timeline').value=String(chart.start);$('timeline').disabled=span===chart.rows.length;
    const cards=[['區間價格報酬',pct(m.returnPct),tone(m.returnPct),`${span} 筆收盤 · 未含息`,'↗',rows.map(r=>r.close)],['年化波動率',C.finite(m.volatility)?`${number(m.volatility)}%`:'—','',`日對數報酬 · √252 年化`,'≈',[]],['最大回撤',pct(m.maxDrawdown),'negative','自區間內收盤高點計算','↘',m.drawdown],['上漲日比例',C.finite(m.positiveDays)?`${number(m.positiveDays,1)}%`:'—','','區間內上漲日 / 漲跌樣本數','◴',[]]];
    $('metrics').innerHTML=cards.map(([label,value,t,caption,icon,values])=>`<article class="metric-card"><div><span>${label}</span><span class="mini-icon" aria-hidden="true">${icon}</span></div><strong class="${t}">${value}</strong><small>${caption}</small>${spark(values,t==='negative'?'var(--down)':'var(--up)')}</article>`).join('');
    renderGauge(chart.end-1);renderDrawdown(rows,m);readout(null);syncButtons();
    const pairs=chart.mode==='compare'?C.compare(rows,benchmarkRows):[];
    $('chartLegend').innerHTML=chart.mode==='compare'?`<i class="dot green"></i>${esc(selectedSymbol)} <i class="dot purple"></i>${esc(benchmarkOptions().find(a=>a.symbol===selectedBenchmark)?.name||selectedBenchmark)} · ${pairs.length} 共同日`:'';
    persist();
  }
  function readout(row) {
    if(!row)row=chart.visible().at(-1);if(!row){$('hoverReadout').textContent='移動游標檢視當日行情';return;}
    $('hoverReadout').textContent=`${row.date}　開 ${number(row.open)}　高 ${number(row.high)}　低 ${number(row.low)}　收 ${number(row.close)}　量 ${number(row.volume,0)}`;
  }
  function renderGauge(index) {
    const t=chart.tech,r=chart.rows[index],value=t.rsi[index],angle=Math.PI+Math.PI*Math.max(0,Math.min(100,value??50))/100,cx=100+73*Math.cos(angle),cy=91+73*Math.sin(angle);
    const verdict=!C.finite(value)?'資料不足，尚未形成 RSI14':value>=70?'RSI 進入高檔區':value<=30?'RSI 進入低檔區':value>=50?'動能位於中線之上':'動能位於中線之下';
    $('gauge').innerHTML=`<svg viewBox="0 0 200 117" role="img" aria-label="RSI14 ${number(value,1)}，${verdict}"><path d="M27 91 A73 73 0 0 1 173 91" fill="none" stroke="#2a3644" stroke-width="9" stroke-linecap="round"/><path d="M27 91 A73 73 0 0 1 57.1 31.9" fill="none" stroke="#4eaa97" stroke-width="9"/><path d="M142.9 31.9 A73 73 0 0 1 173 91" fill="none" stroke="#db7784" stroke-width="9"/>${C.finite(value)?`<circle cx="${cx}" cy="${cy}" r="5" fill="#e3f9f1" stroke="#111923" stroke-width="2"/>`:''}<text class="gauge-value" x="100" y="81" text-anchor="middle">${number(value,1)}</text><text class="gauge-label" x="100" y="102" text-anchor="middle">RSI 14</text><text class="gauge-label" x="23" y="113">0</text><text class="gauge-label" x="161" y="113">100</text></svg><p class="gauge-verdict">${verdict}</p>`;
    const volumes=chart.rows.slice(index-20,index).map(x=>x.volume),avg=volumes.length===20&&volumes.every(C.finite)?C.mean(volumes):null,ratio=C.finite(r.volume)&&avg>0?r.volume/avg:null;
    const ma=C.finite(t.ma20[index])?r.close>=t.ma20[index]?'收盤在均線上':'收盤在均線下':'週期不足';
    const signals=[['MA20',number(t.ma20[index]),ma],['MA60',number(t.ma60[index]),C.finite(t.ma60[index])?(r.close>=t.ma60[index]?'收盤在均線上':'收盤在均線下'):'週期不足'],['MACD 柱體',number(t.histogram[index]),C.finite(t.histogram[index])?(t.histogram[index]>=0?'DIF > 訊號':'DIF < 訊號'):'週期不足'],['KD (9)',`${number(t.kd[index]?.k,1)} / ${number(t.kd[index]?.d,1)}`,'K / D'],['成交量比',C.finite(ratio)?`${number(ratio)}×`:'—','相對前 20 日']];
    $('signals').innerHTML=signals.map(([label,v,note])=>`<div class="signal-row"><span>${label}</span><b>${v}<em>${note}</em></b></div>`).join('');
    $('signalDate').textContent=`截至可視區間末日 ${r.date}。指標描述歷史狀態，並非買賣訊號。`;
  }
  function renderDrawdown(rows,m) {
    $('drawdownValue').textContent=pct(m.maxDrawdown);const W=600,H=155,left=4,right=50,top=12,bottom=125,min=Math.min(-1,m.maxDrawdown??0),x=i=>left+i/Math.max(1,rows.length-1)*(W-right-left),y=v=>top+v/min*(bottom-top),d=path(m.drawdown,x,y);
    let svg=`<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="所選區間回撤曲線，最大回撤 ${pct(m.maxDrawdown)}">`;
    [0,min/2,min].forEach(v=>svg+=`<line class="grid" x1="${left}" y1="${y(v)}" x2="${W-right}" y2="${y(v)}"/><text x="${W-right+7}" y="${y(v)+4}">${number(v,1)}%</text>`);
    svg+=`<path d="${d}L${x(rows.length-1)},${top}L${x(0)},${top}Z" fill="#57ceb0" opacity=".12"/><path d="${d}" stroke="#57ceb0" stroke-width="1.7" fill="none"/><text x="${left}" y="148">${rows[0].date}</text><text x="${W-right}" y="148" text-anchor="end">${rows.at(-1).date}</text></svg>`;$('drawdownChart').innerHTML=svg;
  }
  function renderMonthly(rows) {
    const months=C.monthly(rows),map=new Map(months.map(m=>[m.month,m.value])),years=[...new Set(months.map(m=>m.month.slice(0,4)))];
    $('monthlyHeatmap').innerHTML=`<div class="heat-row heat-head"><span>年 / 月</span>${Array.from({length:12},(_,i)=>`<span>${String(i+1).padStart(2,'0')}</span>`).join('')}</div>`+years.map(year=>`<div class="heat-row"><span>${year}</span>${Array.from({length:12},(_,i)=>{const month=`${year}-${String(i+1).padStart(2,'0')}`,v=map.get(month),opacity=C.finite(v)?Math.min(.68,.1+Math.abs(v)/25):0,color=v>=0?'255,120,133':'87,206,176',label=`${month} ${C.finite(v)?pct(v):'資料不足或無資料'}${month===rows.at(-1).date.slice(0,7)?`，截至 ${rows.at(-1).date}`:''}`;return C.finite(v)?`<button class="heat-cell ${tone(v)}" data-month="${month}" style="background:rgba(${color},${opacity})" title="${esc(label)}；點擊查看當月走勢" aria-label="${esc(label)}；查看當月走勢">${v>0?'+':''}${number(v,1)}</button>`:`<div class="heat-cell neutral" title="${esc(label)}">—</div>`;}).join('')}</div>`).join('');
  }
  $('monthlyHeatmap').addEventListener('click',e=>{const b=e.target.closest('[data-month]');if(!b||!dataReady)return;const start=chart.rows.findIndex(r=>r.date.startsWith(b.dataset.month)),end=chart.rows.findLastIndex(r=>r.date.startsWith(b.dataset.month));if(start<0)return;selectedRange='custom';chart.setWindow(start,end+1);$('mainChart').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});toast(`${b.dataset.month} · ${b.textContent}% 月度價格報酬`);});
  function renderWatchlist() {
    const assets=pins.map(id=>catalog.find(a=>key(a)===id)).filter(Boolean);
    $('watchlist').innerHTML=assets.length?assets.map(a=>`<button class="watch-row ${current&&key(a)===key(current)?'active':''}" data-key="${esc(key(a))}" aria-label="分析 ${esc(a.name)} ${esc(a.symbol)}"><span>${esc(a.symbol)}<small>${esc(a.name)}</small></span>${spark(a.spark||[],a.changePct>=0?'var(--up)':'var(--down)')}<b class="${tone(a.changePct)}">${pct(a.changePct)}<small>${esc(a.asOf.slice(5))}</small></b></button>`).join(''):'<p class="panel-note">按標的旁的 ☆，建立自己的觀察清單。</p>';
  }
  function renderScanner() {
    const market=marketAssets(),filter=$('scanFilter').value,sort=$('scanSort').value;
    let list=market.filter(a=>filter==='positive'?a.return20>0:filter==='negative'?a.return20<0:filter==='pinned'?pins.includes(key(a)):true);
    list.sort((a,b)=>sort==='symbol'?a.symbol.localeCompare(b.symbol):(!C.finite(a.return20)?1:!C.finite(b.return20)?-1:(sort==='fall'?a.return20-b.return20:b.return20-a.return20)));
    const shown=list.slice(0,scanLimit);
    $('scanner').innerHTML=shown.length?shown.map(a=>`<tr><td><button data-symbol="${esc(a.symbol)}"><b>${esc(a.symbol)}</b><span>${esc(a.name)}</span></button></td><td>${number(a.close)} <small>${esc(a.currency)}</small></td><td class="${tone(a.changePct)}">${pct(a.changePct)}</td><td class="${tone(a.return20)}">${pct(a.return20)}</td><td>${spark(a.spark||[],a.return20>=0?'var(--up)':'var(--down)')}</td><td class="muted">${esc(a.asOf)}</td><td><button data-symbol="${esc(a.symbol)}" aria-label="分析 ${esc(a.symbol)}">研究 ↗</button></td></tr>`).join(''):'<tr><td colspan="7" style="text-align:center;padding:35px;color:var(--muted)">目前條件沒有符合的標的，請切換篩選條件。</td></tr>';
    $('scannerCaption').textContent=`${regions[$('market').value]} · 已收錄 ${market.length} 檔歷史行情（非全市場）· 點擊標的直接切換分析`;
    $('scanCount').textContent=`顯示 ${shown.length} / ${list.length} 檔 · 20 日報酬需要至少 21 筆收盤`;$('more').hidden=shown.length>=list.length;
  }
  function search() {
    const query=$('search').value.trim().toLowerCase(),results=marketAssets().filter(a=>`${a.symbol} ${a.name}`.toLowerCase().includes(query)).slice(0,12);
    $('searchResults').innerHTML=results.length?results.map(a=>`<button data-symbol="${esc(a.symbol)}"><span><b>${esc(a.symbol)}</b>　${esc(a.name)}</span><small>${esc(a.currency)}</small></button>`).join(''):'<p>找不到已收錄的標的，請更換代號或市場。</p>';$('searchResults').hidden=false;$('search').setAttribute('aria-expanded','true');
  }
  $('search').addEventListener('input',search);$('search').addEventListener('focus',()=>{$('search').select();});
  $('search').addEventListener('keydown',e=>{if(['ArrowDown','Enter'].includes(e.key)){e.preventDefault();if($('searchResults').hidden)search();const first=$('searchResults').querySelector('button');if(e.key==='Enter')first?.click();else first?.focus();}if(e.key==='Escape'){$('searchResults').hidden=true;$('search').setAttribute('aria-expanded','false');$('search').blur();}});
  $('searchResults').addEventListener('keydown',e=>{const buttons=[...$('searchResults').querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(e.key==='Escape'){$('searchResults').hidden=true;$('search').setAttribute('aria-expanded','false');$('search').focus();}});
  document.addEventListener('click',e=>{if(!e.target.closest('.search-field')){$('searchResults').hidden=true;$('search').setAttribute('aria-expanded','false');}});
  for(const id of ['searchResults','scanner'])$(id).addEventListener('click',e=>{const b=e.target.closest('[data-symbol]');if(b)loadAsset(b.dataset.symbol);});
  $('market').addEventListener('change',()=>{selectedBenchmark='';populateBenchmark();const list=marketAssets(),preferred=$('market').value==='TW'?'2330':$('market').value==='US'?'NVDA':list[0]?.symbol;selectedRange='63';scanLimit=10;renderScanner();if(preferred)loadAsset(preferred);});
  $('benchmark').addEventListener('change',()=>{selectedBenchmark=$('benchmark').value;loadAsset(selectedSymbol);});
  $('ranges').addEventListener('click',e=>{const b=e.target.closest('[data-range]');if(!b||!dataReady)return;selectedRange=b.dataset.range;chart.range(selectedRange);});
  $('chartModes').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(!b||!dataReady)return;chart.mode=b.dataset.mode;chart.render();onWindow();});
  $('overlays').addEventListener('click',e=>{const b=e.target.closest('[data-overlay]');if(!b||!dataReady)return;const v=b.dataset.overlay;chart.overlays.has(v)?chart.overlays.delete(v):chart.overlays.add(v);chart.render();syncButtons();persist();});
  $('subIndicators').addEventListener('click',e=>{const b=e.target.closest('[data-sub]');if(!b||!dataReady)return;chart.sub=b.dataset.sub;chart.render();syncButtons();persist();});
  $('mainChart').addEventListener('wheel',()=>{if(dataReady){selectedRange='custom';syncButtons();persist();}});
  $('mainChart').addEventListener('pointermove',()=>{if(chart.drag&&dataReady&&(chart.start!==chart.drag.start||chart.end!==chart.drag.end)){selectedRange='custom';syncButtons();persist();}});
  $('mainChart').addEventListener('keydown',e=>{if(dataReady&&['+','=','-'].includes(e.key)){selectedRange='custom';syncButtons();persist();}});
  function zoom(factor){if(!dataReady)return;selectedRange='custom';chart.zoom(factor);}
  $('zoomIn').addEventListener('click',()=>zoom(.75));$('zoomOut').addEventListener('click',()=>zoom(1.33));
  function reset(){if(!dataReady)return;selectedRange='63';chart.range('63');}
  $('reset').addEventListener('click',reset);
  $('timeline').addEventListener('input',()=>{if(!dataReady)return;const span=chart.end-chart.start,start=Number($('timeline').value);selectedRange='custom';chart.setWindow(start,start+span);});
  function focus(){document.body.classList.toggle('focus-mode');$('focus').setAttribute('aria-pressed',String(document.body.classList.contains('focus-mode')));$('focus').textContent=document.body.classList.contains('focus-mode')?'⛶ 返回全貌':'⛶ 專注模式';}
  $('focus').addEventListener('click',focus);
  $('pin').addEventListener('click',()=>{if(!current)return;const id=key(current);if(pins.includes(id))pins=pins.filter(p=>p!==id);else {if(pins.length>=12){toast('觀察清單最多 12 檔，請先移除一檔。');return;}pins.push(id);}persist();syncButtons();renderWatchlist();renderScanner();});
  $('watchlist').addEventListener('click',e=>{const b=e.target.closest('[data-key]');if(!b)return;const [market,symbol]=b.dataset.key.split(':');if($('market').value!==market){$('market').value=market;selectedBenchmark='';populateBenchmark();renderScanner();}loadAsset(symbol);});
  ['scanFilter','scanSort'].forEach(id=>$(id).addEventListener('change',()=>{scanLimit=10;renderScanner();}));$('more').addEventListener('click',()=>{scanLimit+=15;renderScanner();});
  const help=()=>$('helpDialog').showModal();$('help').addEventListener('click',help);document.querySelectorAll('[data-explain]').forEach(b=>b.addEventListener('click',help));$('closeHelp').addEventListener('click',()=>$('helpDialog').close());
  document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||$('helpDialog').open||e.target.closest('input,select,textarea,button'))return;if(e.key==='/'){e.preventDefault();$('search').focus();}if(e.key.toLowerCase()==='r')reset();if(e.key.toLowerCase()==='f')focus();});
  $('share').addEventListener('click',async()=>{if(!dataReady){toast('請先載入有效行情。');return;}const p=new URLSearchParams({market:current.market,symbol:current.symbol,benchmark:selectedBenchmark,range:selectedRange==='custom'?'63':selectedRange,mode:chart.mode,sub:chart.sub,overlays:[...chart.overlays].join(','),from:chart.visible()[0].date,to:chart.visible().at(-1).date});const url=new URL(location.href);url.search=p.toString();url.hash='';window.history.replaceState(null,'',url.href);try{await navigator.clipboard.writeText(url.href);toast('分析連結已複製，包含標的、指標與時間區間。');}catch(_){toast('瀏覽器無法複製，已將分析設定更新至網址列。');}});
  $('export').addEventListener('click',()=>{if(!dataReady){toast('請先載入有效行情。');return;}const headers=['market','symbol','currency','date','open','high','low','close','volume','MA20','MA60','RSI14','MACD_DIF','MACD_signal','MACD_histogram','KD_K','KD_D'];const cell=v=>`"${String(typeof v==='string'&&/^[=+@\t\r-]/.test(v)?"'"+v:(v??'')).replace(/"/g,'""')}"`;const rows=chart.visible().map((r,i)=>{const idx=chart.start+i,t=chart.tech;return [current.market,current.symbol,current.currency,r.date,r.open,r.high,r.low,r.close,r.volume,t.ma20[idx],t.ma60[idx],t.rsi[idx],t.dif[idx],t.signal[idx],t.histogram[idx],t.kd[idx]?.k,t.kd[idx]?.d].map(cell).join(',');});const blob=new Blob(['\uFEFF'+headers.join(',')+'\r\n'+rows.join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`analysis-${current.market}-${current.symbol}-${chart.visible()[0].date}-${chart.visible().at(-1).date}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`已匯出 ${rows.length} 筆行情與技術指標。`);});
  $('retry').addEventListener('click',()=>{cache.clear();if(catalog.length)loadAsset(selectedSymbol);else init();});
  async function init() {
    try {const data=await fetchJSON('price-history/catalog.json');catalog=Array.isArray(data.assets)?data.assets:[];if(!catalog.length)throw Error('歷史行情目錄目前沒有標的');const list=marketAssets();if(!list.some(a=>a.symbol===selectedSymbol))selectedSymbol=list.find(a=>a.symbol===($('market').value==='TW'?'2330':'NVDA'))?.symbol||list[0]?.symbol;populateBenchmark();renderScanner();renderWatchlist();await loadAsset(selectedSymbol,true);}catch(e){$('status').textContent='無法載入標的目錄';$('error').hidden=false;$('error').querySelector('span').textContent='歷史行情目錄載入失敗，請重試。';$('dashboard').setAttribute('aria-busy','false');}
  }
  syncButtons();init();
})();
