/* Responsive SVG chart; all indicators use the complete history before windowing. */
(function () {
  'use strict';
  const C = window.AnalysisCore;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = v => C.finite(v) ? v.toLocaleString('en-US', {maximumFractionDigits:2}) : '—';
  const path = (values, x, y) => { let drawing = false; return values.map((v, i) => {if (!C.finite(v)) {drawing = false; return '';} const command = `${drawing ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`; drawing = true; return command;}).join(''); };
  class AnalysisChart {
    constructor(target, onChange, onHover) {
      this.target = target; this.onChange = onChange; this.onHover = onHover;
      this.rows = []; this.benchmark = []; this.mode = 'candle'; this.sub = 'rsi'; this.overlays = new Set(['ma20','ma60']); this.start = 0; this.end = 0; this.cursor = -1;
      this.observer = new ResizeObserver(() => this.render()); this.observer.observe(target);
      target.addEventListener('wheel', e => {if (!this.rows.length) return; e.preventDefault(); this.zoom(Math.exp(Math.max(-250, Math.min(250, e.deltaY)) * .003), (e.clientX - target.getBoundingClientRect().left) / target.clientWidth);}, {passive:false});
      target.addEventListener('pointerdown', e => {if (e.button !== 0 || !this.rows.length) return; this.drag = {x:e.clientX, start:this.start, end:this.end}; target.setPointerCapture(e.pointerId); this.hover(e);});
      target.addEventListener('pointermove', e => {if (this.drag && Math.abs(e.clientX - this.drag.x) > 4) {const shift = Math.round((this.drag.x - e.clientX) / this.geometry.plotW * (this.drag.end - this.drag.start)); this.setWindow(this.drag.start + shift, this.drag.end + shift);} else this.hover(e);});
      for (const type of ['pointerup','pointercancel']) target.addEventListener(type, () => {this.drag = null;});
      target.addEventListener('pointerleave', () => {if (!this.drag) this.clearHover();});
      target.addEventListener('keydown', e => {
        if (['ArrowLeft','ArrowRight'].includes(e.key)) {e.preventDefault(); const length = this.geometry?.display.length || 0; this.cursor = Math.max(0, Math.min(length - 1, (this.cursor < 0 ? length - 1 : this.cursor) + (e.key === 'ArrowLeft' ? -1 : 1))); this.showHover(this.cursor);}
        if (['+','=','-'].includes(e.key)) {e.preventDefault(); this.zoom(e.key === '-' ? 1.25 : .8);}
      });
    }
    setData(rows, benchmark) {this.rows = rows; this.benchmark = benchmark; this.tech = C.indicators(rows);}
    range(count) {const size = count === 'all' ? this.rows.length : Math.min(this.rows.length, Number(count)); this.setWindow(this.rows.length - size, this.rows.length);}
    setWindow(start, end, notify = true) {
      const n = this.rows.length, size = Math.min(n, Math.max(1, Math.round(end - start)));
      this.start = Math.max(0, Math.min(n - size, Math.round(start))); this.end = this.start + size; this.cursor = -1; this.render(); if (notify) this.onChange(this);
    }
    zoom(factor, ratio = .5) {ratio = Math.max(0, Math.min(1, ratio)); const span = this.end - this.start, next = Math.max(Math.min(8, this.rows.length), Math.min(this.rows.length, Math.round(span * factor))), anchor = this.start + span * ratio; this.setWindow(anchor - next * ratio, anchor + next * (1 - ratio));}
    visible() {return this.rows.slice(this.start, this.end);}
    render() {
      if (!this.rows.length || !this.target.clientWidth) {this.target.innerHTML = '<div class="chart-empty">尚無可用歷史行情</div>'; return;}
      const rows = this.visible(); if (!rows.length) return;
      const comparing = this.mode === 'compare', display = comparing ? C.compare(rows, this.benchmark) : rows;
      if (!display.length) {this.target.innerHTML = '<div class="chart-empty">此區間沒有足夠共同交易日，請切換基準或擴大區間。</div>'; this.geometry = null; return;}
      const W = this.target.clientWidth, H = this.target.clientHeight, left = 13, right = W < 500 ? 51 : 65, plotW = W - left - right;
      const top = 12, priceBottom = H * .56, volumeTop = H * .59, volumeBottom = H * .72, subTop = H * .79, subBottom = H - 25;
      const x = i => left + (i + .5) * plotW / display.length;
      const offsetByDate = new Map(this.rows.map((r,i) => [r.date,i]));
      const indexes = display.map(r => offsetByDate.get(r.date));
      const lows = [], highs = [];
      display.forEach((r, i) => {
        if (comparing) {lows.push(r.a,r.b); highs.push(r.a,r.b);return;}
        lows.push(C.finite(r.low) && this.mode === 'candle' ? r.low : r.close); highs.push(C.finite(r.high) && this.mode === 'candle' ? r.high : r.close);
        ['ma20','ma60'].forEach(key => {const v = this.tech[key][indexes[i]]; if (this.overlays.has(key) && C.finite(v)) {lows.push(v); highs.push(v);}});
        const band = this.tech.bands[indexes[i]]; if (this.overlays.has('bollinger') && band) {lows.push(band.lower); highs.push(band.upper);}
      });
      if (comparing) {lows.push(0);highs.push(0);}
      let low = Math.min(...lows), high = Math.max(...highs); const pad = Math.max((high-low)*.09, Math.abs(high)*.002, .01); low -= pad; high += pad;
      const y = v => top + (high - v) / (high - low) * (priceBottom - top);
      const color = r => r.close >= (C.finite(r.open) ? r.open : r.close) ? 'var(--up)' : 'var(--down)';
      let svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${comparing ? '共同交易日相對報酬' : '日線價格'}、成交量及 ${this.sub.toUpperCase()} 指標"><defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#68d9c2" stop-opacity=".22"/><stop offset="1" stop-color="#68d9c2" stop-opacity="0"/></linearGradient><clipPath id="plotClip"><rect x="${left}" y="0" width="${plotW}" height="${H}"/></clipPath></defs>`;
      for (let i = 0; i < 5; i++) {const v = high - (high-low)*i/4, yy = y(v); svg += `<line class="grid" x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}"/><text x="${W-right+8}" y="${yy+3}">${fmt(v)}${comparing ? '%' : ''}</text>`;}
      const labelCount = W < 500 ? 4 : 6;
      for (let i=0; i<labelCount; i++) {const index = Math.round(i*(display.length-1)/(labelCount-1)), xx = x(index); svg += `<line class="grid" x1="${xx}" y1="${top}" x2="${xx}" y2="${subBottom}" opacity=".55"/><text x="${xx}" y="${H-7}" text-anchor="${i === 0 ? 'start' : i === labelCount-1 ? 'end' : 'middle'}">${esc(display[index].date.slice(5))}</text>`;}
      svg += '<g clip-path="url(#plotClip)">';
      if (comparing) {
        svg += `<line x1="${left}" y1="${y(0)}" x2="${W-right}" y2="${y(0)}" stroke="#64758a" stroke-dasharray="4 4"/>`;
        ['a','b'].forEach((key,i) => {svg += `<path class="line" d="${path(display.map(r => r[key]),x,y)}" stroke="${i ? 'var(--purple)' : 'var(--accent)'}"/>`;});
      } else {
        if (this.overlays.has('bollinger')) ['upper','lower'].forEach(key => {svg += `<path class="line" d="${path(indexes.map(i => this.tech.bands[i]?.[key]),x,y)}" stroke="var(--purple)" stroke-dasharray="3 3" opacity=".7"/>`;});
        if (this.mode === 'line') {
          const d = path(rows.map(r => r.close),x,y); svg += `<path d="${d}L${x(rows.length-1)},${priceBottom}L${x(0)},${priceBottom}Z" fill="url(#priceFill)"/><path class="line" d="${d}" stroke="var(--accent)"/>`;
        } else rows.forEach((r,i) => {
          if (![r.open,r.high,r.low].every(C.finite)) {svg += `<circle cx="${x(i)}" cy="${y(r.close)}" r="2" fill="var(--muted)"/>`;return;}
          const width = Math.max(1,Math.min(12,plotW / rows.length*.62)); svg += `<line x1="${x(i)}" y1="${y(r.high)}" x2="${x(i)}" y2="${y(r.low)}" stroke="${color(r)}"/><rect x="${x(i)-width/2}" y="${Math.min(y(r.open),y(r.close))}" width="${width}" height="${Math.max(1,Math.abs(y(r.close)-y(r.open)))}" fill="${color(r)}" rx=".6"/>`;
        });
        ['ma20','ma60'].forEach((key,i) => {if(this.overlays.has(key)) svg += `<path class="line" d="${path(indexes.map(idx => this.tech[key][idx]),x,y)}" stroke="${i ? 'var(--blue)' : 'var(--amber)'}"/>`;});
      }
      svg += '</g>';
      const last = display.at(-1), latest = comparing ? last.a : last.close;
      svg += `<line x1="${left}" y1="${y(latest)}" x2="${W-right}" y2="${y(latest)}" stroke="#68d9c2" opacity=".35" stroke-dasharray="3 4"/><rect x="${W-right+2}" y="${y(latest)-8}" width="${right-3}" height="16" rx="3" fill="#244039"/><text class="latest-label" x="${W-right+6}" y="${y(latest)+3}">${fmt(latest)}${comparing?'%':''}</text>`;
      const actualRows = indexes.map(i => this.rows[i]), vols = actualRows.map(r => r.volume), vmax = Math.max(1,...vols.filter(C.finite));
      svg += `<text x="${left}" y="${volumeTop-4}">VOLUME · 股</text>`;
      if (!vols.some(C.finite)) svg += `<text x="${left+85}" y="${volumeTop-4}">無成交量資料</text>`;
      actualRows.forEach((r,i) => {if (!C.finite(r.volume))return; const height = r.volume/vmax*(volumeBottom-volumeTop); svg += `<rect x="${x(i)-Math.max(1,plotW/display.length*.58)/2}" y="${volumeBottom-height}" width="${Math.max(1,plotW/display.length*.58)}" height="${height}" fill="${color(r)}" opacity=".38"/>`;});
      svg += `<line class="grid" x1="${left}" y1="${volumeBottom+8}" x2="${W-right}" y2="${volumeBottom+8}"/><text x="${left}" y="${subTop-7}">${this.sub === 'rsi' ? 'RSI 14' : this.sub === 'kd' ? 'KD 9 · K / D' : 'MACD 12, 26, 9'}</text>`;
      const subY = v => subBottom - v/100*(subBottom-subTop);
      if (this.sub === 'rsi' || this.sub === 'kd') {
        [this.sub === 'rsi' ? 30 : 20, this.sub === 'rsi' ? 70 : 80].forEach(v => {svg += `<line class="grid" x1="${left}" y1="${subY(v)}" x2="${W-right}" y2="${subY(v)}" stroke-dasharray="3 4"/><text x="${W-right+8}" y="${subY(v)+3}">${v}</text>`;});
        if(this.sub === 'rsi') svg += `<path class="line" d="${path(indexes.map(i=>this.tech.rsi[i]),x,subY)}" stroke="var(--purple)"/>`;
        else ['k','d'].forEach((key,j) => {svg += `<path class="line" d="${path(indexes.map(i=>this.tech.kd[i]?.[key]),x,subY)}" stroke="${j ? 'var(--amber)' : 'var(--purple)'}"/>`;});
      } else {
        const max = Math.max(.001,...indexes.flatMap(i => [this.tech.dif[i],this.tech.signal[i],this.tech.histogram[i]]).filter(C.finite).map(Math.abs));
        const my = v => (subTop+subBottom)/2 - v/max*(subBottom-subTop)*.45;
        svg += `<line class="grid" x1="${left}" y1="${my(0)}" x2="${W-right}" y2="${my(0)}"/><text x="${W-right+8}" y="${my(0)+3}">0</text>`;
        indexes.forEach((idx,i) => {const v = this.tech.histogram[idx]; if (!C.finite(v))return; svg += `<rect x="${x(i)-2}" y="${Math.min(my(0),my(v))}" width="4" height="${Math.max(.5,Math.abs(my(v)-my(0)))}" fill="${v>=0?'var(--up)':'var(--down)'}" opacity=".65"/>`;});
        ['dif','signal'].forEach((key,j) => {svg += `<path class="line" d="${path(indexes.map(i=>this.tech[key][i]),x,my)}" stroke="${j?'var(--amber)':'var(--purple)'}"/>`;});
      }
      svg += `<g id="crosshair" visibility="hidden"><line class="crosshair" id="crossX" y1="${top}" y2="${subBottom}"/><circle id="crossDot" r="3" fill="var(--accent)"/><rect id="crossLabelBg" y="${H-19}" width="78" height="17" rx="3" fill="#354958"/><text id="crossLabel" y="${H-7}" text-anchor="middle" style="fill:#eef5fa"></text></g></svg><div class="chart-tooltip" hidden></div>`;
      this.target.innerHTML = svg; this.geometry = {W,H,left,plotW,display,indexes,x,y,comparing};
      this.onHover(null);
    }
    hover(event) {if (!this.geometry) return; const rect=this.target.getBoundingClientRect(), g=this.geometry, index=Math.max(0,Math.min(g.display.length-1,Math.floor((event.clientX-rect.left-g.left)/g.plotW*g.display.length))); this.cursor=index; this.showHover(index);}
    showHover(index) {
      const g=this.geometry; if (!g || !g.display[index])return;
      const row=g.display[index], global=g.indexes[index], xx=g.x(index), yy=g.y(g.comparing?row.a:row.close), group=this.target.querySelector('#crosshair'); if (!group)return;
      group.setAttribute('visibility','visible'); const line=this.target.querySelector('#crossX'); line.setAttribute('x1',xx);line.setAttribute('x2',xx);
      const dot=this.target.querySelector('#crossDot');dot.setAttribute('cx',xx);dot.setAttribute('cy',yy);
      const labelX=Math.max(40,Math.min(g.W-40,xx));this.target.querySelector('#crossLabelBg').setAttribute('x',labelX-39);this.target.querySelector('#crossLabel').setAttribute('x',labelX);this.target.querySelector('#crossLabel').textContent=row.date;
      const tip=this.target.querySelector('.chart-tooltip');tip.hidden=false;tip.style.left=xx>g.W*.55?'16px':'auto';tip.style.right=xx>g.W*.55?'auto':`${g.W-g.left-g.plotW+8}px`;
      const r=this.rows[global]; tip.innerHTML=`<b>${esc(row.date)}</b><br>${g.comparing ? `標的 ${fmt(row.a)}% · 基準 ${fmt(row.b)}%` : `收 ${fmt(r.close)} · 量 ${fmt(r.volume)}`}<br>${this.sub==='rsi'?`RSI14 ${fmt(this.tech.rsi[global])}`:this.sub==='macd'?`DIF ${fmt(this.tech.dif[global])} / DEA ${fmt(this.tech.signal[global])}`:`K ${fmt(this.tech.kd[global]?.k)} / D ${fmt(this.tech.kd[global]?.d)}`}`;
      this.onHover(r);
    }
    clearHover() {this.target.querySelector('#crosshair')?.setAttribute('visibility','hidden'); const tip=this.target.querySelector('.chart-tooltip');if(tip)tip.hidden=true;this.onHover(null);}
  }
  window.AnalysisChart = AnalysisChart;
  window.AnalysisChartPath = path;
})();
