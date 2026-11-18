(function () {
  'use strict';
  const C = window.ValuationRiverCore, box = document.getElementById('valuationRiver');
  const accordion = document.getElementById('valuationAccordion');
  if (!box || !accordion || !C) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => C.positive(value) ? value.toLocaleString('zh-TW', {maximumFractionDigits:2}) : '—';
  const colors = ['#6f9e95', '#8ba8b6', '#baac80', '#bb9696', '#a48daa'];
  const cache = new Map();
  let asset = null, payload = null, request = 0, loading = false, mode = 'pe', years = 5, multiples = [], rows = [], selected = -1;
  let viewport = null, drag = null, geometry = null;
  const modeLabel = () => mode === 'pe' ? '本益比' : '股價淨值比';
  function status(message, retry = false) {
    box.innerHTML = `<div class="river-empty" role="status">${esc(message)}${retry ? '<button type="button" data-river-retry>重新載入</button>' : ''}</div>`;
    box.querySelector('[data-river-retry]')?.addEventListener('click', () => load(true));
  }
  function setAsset(next) {
    const changed = !asset || asset.symbol !== next.symbol || asset.market !== next.market || asset.assetType !== next.assetType;
    if (!changed) return;
    asset = {...next}; request++; payload = null; loading = false; viewport = null;
    if (asset.market !== 'TW' || asset.assetType !== 'stock' || !/^[1-9]\d{3}$/.test(asset.symbol)) {
      status('估值河流圖目前支援台灣上市、上櫃普通股；ETF 與海外標的暫不適用。'); return;
    }
    status('展開後載入近五年官方歷史估值與收盤價。');
    if (accordion.open) load();
  }
  async function load(force = false) {
    if (!asset || asset.market !== 'TW' || asset.assetType !== 'stock' || !/^[1-9]\d{3}$/.test(asset.symbol) || loading || (payload && !force)) return;
    const current = ++request, symbol = asset.symbol;
    loading = true;
    status(`正在整理 ${asset.name || symbol} 的估值河流…首次查詢需讀取五年歷史，可能需要一分鐘。`);
    try {
      let data = force ? null : cache.get(symbol);
      if (!data) {
        const response = await fetch(`/api/valuation?code=${encodeURIComponent(symbol)}&market=TW`, {cache:force ? 'reload' : 'default'});
        data = await response.json();
        if (!response.ok || !data.ok || !data.rows?.length) throw new Error(data.error || '目前查無可用歷史估值');
        if (!data.failedMonths?.length) cache.set(symbol, data);
      }
      if (current !== request) return;
      payload = data;
      mode = data.rows.some(row => C.positive(row.pe)) ? 'pe' : 'pb';
      multiples = C.defaultMultiples(data.rows, mode); render();
    } catch (error) {
      if (current === request) status(error.message || '歷史估值暫時無法取得', true);
    } finally { if (current === request) loading = false; }
  }
  function render() {
    if (!payload) return;
    const latest = payload.rows.at(-1), valid = payload.rows.filter(row => C.positive(row[mode]));
    const middle = C.quantile(valid.map(row => row[mode]), .5);
    const comparison = C.positive(latest[mode]) && C.positive(middle) ? `${((latest[mode] / middle - 1) * 100).toFixed(1)}%` : '—';
    box.innerHTML = `<div class="river-head"><div><span class="river-kicker">VALUATION RIVER</span><h3>估值河流圖</h3><p>${esc(asset.name || asset.symbol)} · ${esc(asset.symbol)} · ${esc(payload.exchange)} · 新台幣</p></div><span class="river-asof">資料至 ${esc(payload.asOf)}</span></div>
      <div class="river-toolbar"><div class="river-segment" role="group" aria-label="河流圖估值指標">${[['pe','本益比 P/E'],['pb','股價淨值比 P/B']].map(([key,label]) => `<button type="button" data-river-mode="${key}" aria-pressed="${key === mode}">${label}</button>`).join('')}</div><div class="river-segment" role="group" aria-label="河流圖期間">${[1,3,5].map(value => `<button type="button" data-river-years="${value}" aria-pressed="${value === years}">${value} 年</button>`).join('')}</div></div>
      <div class="river-stats"><div><span>收盤價</span><strong>${fmt(latest.close)}</strong></div><div><span>最新${modeLabel()}</span><strong>${fmt(latest[mode])}<small> 倍</small></strong></div><div><span>可用歷史中位數</span><strong>${fmt(middle)}<small> 倍</small></strong></div><div><span>較歷史中位數</span><strong>${comparison.startsWith('-') || comparison === '—' ? comparison : '+' + comparison}</strong></div></div>
      <form class="river-multiples"><label for="riverMultiples">五條倍數線</label><input id="riverMultiples" name="multiples" value="${multiples.join(', ')}" aria-describedby="riverMultipleHelp riverInputError" autocomplete="off"><button type="submit">套用</button><button type="button" data-river-default>歷史分位數</button><small id="riverMultipleHelp">由小到大輸入五個正數，以逗號分隔。</small><span id="riverInputError" role="alert"></span></form>
      <div class="river-legend"><span><i class="river-price-dot"></i>實際收盤價</span>${multiples.map((v,i) => `<span><i style="background:${colors[i]}"></i>${fmt(v)} 倍</span>`).join('')}</div>
      <div class="river-chart" tabindex="0" role="group" aria-label="${modeLabel()}河流圖；左右鍵查看日期，加減鍵縮放，Home 重設"></div>
      <div class="river-readout" aria-live="polite"></div><div class="river-navigation"><span class="river-dates"></span><button type="button" data-river-zoom="in" aria-label="放大河流圖">＋</button><button type="button" data-river-zoom="out" aria-label="縮小河流圖">−</button><button type="button" data-river-reset>重設範圍</button></div>
      ${!valid.length ? `<p class="river-warning">此標的沒有有效${modeLabel()}，僅顯示股價；不以零或負值建立色帶。</p>` : ''}
      ${payload.failedMonths?.length ? `<p class="river-warning">${payload.failedMonths.length} 個月份查詢未完成，可能保留較早資料或出現缺口。<button type="button" data-river-retry>重試缺漏資料</button></p>` : ''}
      <details class="river-method"><summary>計算方式與資料來源</summary><p>參考盈餘／每股淨值＝同日官方收盤價 ÷ 官方${modeLabel()}；各倍數價格＝參考數值 × 倍數。推算值受官方倍數四捨五入影響，不等同財報原始 EPS。使用當時官方已公告資料，不以最新財報回填歷史。</p><p>預設五條線取全部可用歷史${modeLabel()}的第 10／30／50／70／90 百分位；整張圖採固定倍數。切換顯示期間不會重算倍數。歷史中位數與色帶是回顧統計，不是當時可用的回測訊號，也不代表合理價或買賣建議。</p><p>股價使用官方未還原權息收盤價；除權息、拆併股、面額或股本變更可能造成跳動。缺值不補零、不延用其他日期估值，長缺口中斷連線。虧損或每股參考盈餘非正數時，本益比帶不繪製。</p><p>來源：<a href="${esc(payload.source.url)}" target="_blank" rel="noopener noreferrer">${esc(payload.source.name)}</a> · 實際可用期間 ${esc(payload.rows[0].date)} ～ ${esc(payload.asOf)} · 查核日 ${esc(payload.checkedAt)}</p></details>`;
    box.querySelectorAll('[data-river-mode]').forEach(button => button.addEventListener('click', () => {
      mode = button.dataset.riverMode; multiples = C.defaultMultiples(payload.rows, mode); render();
    }));
    box.querySelectorAll('[data-river-years]').forEach(button => button.addEventListener('click', () => {
      years = Number(button.dataset.riverYears); viewport = null; render();
    }));
    box.querySelector('form').addEventListener('submit', event => {
      event.preventDefault(); const parsed = C.parseMultiples(box.querySelector('input').value);
      if (!parsed) {box.querySelector('#riverInputError').textContent = '請輸入五個遞增、不重複且不超過 10,000 的正數。'; return;}
      multiples = parsed; render();
    });
    box.querySelector('[data-river-default]').addEventListener('click', () => {multiples = C.defaultMultiples(payload.rows, mode); render();});
    box.querySelector('[data-river-retry]')?.addEventListener('click', () => load(true));
    box.querySelector('[data-river-reset]').addEventListener('click', () => {viewport = null; draw();});
    box.querySelectorAll('[data-river-zoom]').forEach(button => button.addEventListener('click', () => zoom(button.dataset.riverZoom === 'in' ? .7 : 1.4)));
    const chart = box.querySelector('.river-chart');
    chart.addEventListener('pointermove', event => {
      if (drag && event.buttons) {
        const all = C.periodRows(payload.rows, years), offset = Math.round((drag.x - event.clientX) / chart.clientWidth * drag.span);
        const start = Math.max(0, Math.min(all.length - drag.span, drag.start + offset));
        viewport = {start, end:start + drag.span}; draw(); return;
      }
      const svg = chart.querySelector('svg'); if (!svg) return;
      const rect = svg.getBoundingClientRect(), ratio = (event.clientX - rect.left) / rect.width;
      if (geometry) highlight(Math.round((ratio * geometry.W - geometry.L) / (geometry.W - geometry.L - geometry.R) * (rows.length - 1)));
    });
    chart.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const all = C.periodRows(payload.rows, years), view = viewport || {start:0,end:all.length};
      drag = {x:event.clientX, start:view.start, span:view.end - view.start}; chart.setPointerCapture(event.pointerId);
    });
    chart.addEventListener('pointerup', () => {drag = null;});
    chart.addEventListener('pointercancel', () => {drag = null;});
    chart.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); highlight(selected + (event.key === 'ArrowLeft' ? -1 : 1));}
      if (event.key === '+' || event.key === '=') {event.preventDefault(); zoom(.7);}
      if (event.key === '-') {event.preventDefault(); zoom(1.4);}
      if (event.key === 'Home') {event.preventDefault(); viewport = null; draw();}
    });
    draw();
  }
  function zoom(factor) {
    const all = C.periodRows(payload.rows, years), view = viewport || {start:0,end:all.length};
    const size = Math.min(all.length, Math.max(Math.min(20, all.length), Math.round((view.end - view.start) * factor)));
    const center = (view.start + view.end) / 2, start = Math.max(0, Math.min(all.length - size, Math.round(center - size / 2)));
    viewport = {start, end:start + size}; draw();
  }
  function draw() {
    const chart = box.querySelector('.river-chart'); if (!chart) return;
    const all = C.periodRows(payload.rows, years);
    rows = viewport ? all.slice(viewport.start, viewport.end) : all;
    if (!rows.length) {chart.textContent = '此期間沒有可用資料。'; return;}
    const W = Math.max(300, Math.min(1000, chart.clientWidth)), H = W < 600 ? 300 : 400;
    const L = W < 600 ? 53 : 65, R = W < 600 ? 65 : 100, T = 25, B = 42;
    const values = rows.flatMap(row => [row.close, ...multiples.map(m => C.bandValue(row, mode, m))]).filter(C.positive);
    const low = Math.min(...values), high = Math.max(...values), pad = Math.max((high - low) * .08, high * .02, .01);
    const minimum = Math.max(0, low - pad), maximum = high + pad;
    geometry = {W, H, L, R, T, B, minimum, maximum};
    const x = index => L + index / Math.max(1, rows.length - 1) * (W - L - R);
    const y = value => T + (maximum - value) / (maximum - minimum) * (H - T - B);
    const points = group => group.map(p => `${x(p.index).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${modeLabel()}估值河流與實際收盤價"><title>${esc(asset.name || asset.symbol)} ${modeLabel()}河流圖</title>`;
    for (let i = 0; i < 5; i++) {
      const value = minimum + (maximum - minimum) * i / 4, yy = y(value);
      svg += `<line class="river-grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text x="${L-9}" y="${yy+4}" text-anchor="end">${fmt(value)}</text>`;
    }
    const labelCount = W < 600 ? 3 : 5;
    for (let i = 0; i < labelCount; i++) {
      const index = Math.round((rows.length - 1) * i / (labelCount - 1));
      svg += `<text x="${x(index)}" y="${H-12}" text-anchor="middle">${rows[index].date.slice(0,7)}</text>`;
    }
    const groups = C.segments(rows, row => C.positive(row[mode]) ? row.close : null);
    for (let band = 0; band < multiples.length - 1; band++) {
      for (const group of groups) {
        const lower = group.map(p => ({...p, value:C.bandValue(p.row, mode, multiples[band])}));
        const upper = group.map(p => ({...p, value:C.bandValue(p.row, mode, multiples[band+1])}));
        svg += `<polygon points="${points(lower)} ${points(upper.slice().reverse())}" fill="${colors[band]}" fill-opacity=".25"/>`;
      }
    }
    multiples.forEach((multiple, i) => {
      C.segments(rows, row => C.bandValue(row, mode, multiple)).forEach(group => {
        svg += `<polyline class="river-line" points="${points(group)}" stroke="${colors[i]}" stroke-width="1.4"/>`;
      });
      const last = rows.at(-1), value = C.bandValue(last, mode, multiple);
      if (C.positive(value)) svg += `<text x="${W-R+9}" y="${y(value)+4}" fill="${colors[i]}">${fmt(multiple)} 倍</text>`;
    });
    C.segments(rows, row => row.close).forEach(group => {
      svg += `<polyline class="river-line river-price" points="${points(group)}" stroke-width="2.5"/>`;
    });
    svg += `<line class="river-crosshair" y1="${T}" y2="${H-B}" visibility="hidden"/><circle class="river-selected" r="4" visibility="hidden"/></svg>`;
    chart.innerHTML = svg;
    box.querySelector('.river-dates').textContent = `${rows[0].date} ～ ${rows.at(-1).date} · ${rows.length} 筆日線`;
    highlight(rows.length - 1);
  }
  function highlight(index) {
    if (!rows.length) return;
    selected = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[selected], svg = box.querySelector('.river-chart svg'); if (!svg) return;
    const {W,H,L,R,T,B,minimum,maximum} = geometry;
    const xx = L + selected / Math.max(1, rows.length-1) * (W-L-R);
    const yy = T+(maximum-row.close)/(maximum-minimum)*(H-T-B);
    const line = svg.querySelector('.river-crosshair'), dot = svg.querySelector('.river-selected');
    line.setAttribute('x1',xx); line.setAttribute('x2',xx); line.setAttribute('visibility','visible');
    dot.setAttribute('cx',xx); dot.setAttribute('cy',yy); dot.setAttribute('visibility','visible');
    box.querySelector('.river-readout').innerHTML = `<strong>${row.date}</strong><span>收盤 ${fmt(row.close)}</span><span>${modeLabel()} ${fmt(row[mode])} 倍</span><span>${mode === 'pe' ? '參考每股盈餘' : '參考每股淨值'}（估算） ${fmt(mode === 'pe' ? row.eps : row.bookValue)}</span>${row.reportPeriod ? `<span>財報期 ${esc(row.reportPeriod)}</span>` : ''}<span class="river-band-prices">${multiples.map(m => `${fmt(m)} 倍：${fmt(C.bandValue(row,mode,m))}`).join(' · ')}</span>`;
  }
  accordion.addEventListener('toggle', () => {if (accordion.open) load();});
  let lastWidth = 0;
  new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (width > 0 && width !== lastWidth) {lastWidth = width; if (payload) draw();}
  }).observe(box);
  window.ValuationRiver = {setAsset};
})();
