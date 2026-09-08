(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
  function unpack(rows){return rows.map(r=>Array.isArray(r)?{date:r[0],open:r[1],high:r[2],low:r[3],close:r[4],volume:r[5]}:{...r});}
  function weekly(rows){
    const out=[];let key='';
    for(const r of rows){const d=new Date(r.date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const k=d.toISOString().slice(0,10);
      if(k!==key){out.push({...r,week:k});key=k;}else{const w=out.at(-1);w.high=Math.max(w.high,r.high);w.low=Math.min(w.low,r.low);w.close=r.close;w.volume+=r.volume;w.date=r.date;}}
    return out;
  }
  function indicators(rows){
    const ma20=[],ma60=[],rsi=[],atr=[];let gain=0,loss=0,tr=0;
    rows.forEach((r,i)=>{
      ma20.push(i<19?null:mean(rows.slice(i-19,i+1).map(x=>x.close)));
      ma60.push(i<59?null:mean(rows.slice(i-59,i+1).map(x=>x.close)));
      if(i){const v=r.close-rows[i-1].close,range=Math.max(r.high-r.low,Math.abs(r.high-rows[i-1].close),Math.abs(r.low-rows[i-1].close));
        if(i<=14){gain+=Math.max(0,v)/14;loss+=Math.max(0,-v)/14;tr+=range/14;}
        else{gain=(gain*13+Math.max(0,v))/14;loss=(loss*13+Math.max(0,-v))/14;tr=(tr*13+range)/14;}}
      rsi.push(i<14?null:loss?100-100/(1+gain/loss):gain?100:50);atr.push(i<14?null:tr);
    });return {ma20,ma60,rsi,atr};
  }
  function risk({capital,percent,entry,stop,target,lot=1,cost=0}){
    if(![capital,percent,entry,stop,target,lot,cost].every(Number.isFinite)||capital<=0||percent<=0||percent>100||entry<=stop||stop<=0||target<=entry||lot<1||!Number.isInteger(lot)||cost<0)return null;
    const budget=capital*percent/100,unit=entry-stop+cost;
    const shares=Math.floor(Math.min(budget/unit,capital/(entry+cost))/lot)*lot;
    return {budget,shares,loss:shares*unit,rr:(target-entry-cost)/unit,gapLoss:shares*(2*(entry-stop)+cost),cash:shares*(entry+cost)};
  }
  class Chart{
    constructor(el,options={}){
      this.el=el;this.options=options;this.rows=[];this.lines=[];this.annotations=[];this.period='daily';this.log=false;this.overlays=new Set();this.mode='pan';this.span=100;this.offset=0;this.rsi=false;this.pending=null;
      this.observer=new ResizeObserver(()=>this.render());this.observer.observe(el);
      this.handleMove=e=>this.move(e);this.handleDown=e=>this.down(e);this.handleUp=e=>this.up(e);
      el.addEventListener('pointermove',this.handleMove);el.addEventListener('pointerdown',this.handleDown);el.addEventListener('pointerup',this.handleUp);
      el.addEventListener('pointercancel',()=>{this.drag=null;});
      el.addEventListener('wheel',e=>{if(!this.rows.length)return;e.preventDefault();this.zoom(e.deltaY>0?1.2:.8);},{passive:false});
      el.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();this.cursor=Math.max(0,Math.min((this.g?.data.length||1)-1,(this.cursor??0)+(e.key==='ArrowRight'?1:-1)));this.read(this.cursor);}if(['+','-','='].includes(e.key)){e.preventDefault();this.zoom(e.key==='-'?1.2:.8);}});
    }
    destroy(){this.observer.disconnect();}
    setData(rows,{start,annotations=[],reset=false}={}){this.rows=rows;this.annotations=annotations;this.baseStart=start??rows[0]?.date;if(reset){this.offset=0;this.span=Math.max(12,rows.filter(r=>r.date>=this.baseStart).length);this.pending=null;}this.render();}
    setMode(mode){this.mode=mode;this.pending=null;this.el.classList.toggle('drawing',mode!=='pan');}
    zoom(f){this.span=Math.max(12,Math.min(this.rows.length,Math.round(this.span*f)));this.render();}
    render(){
      if(!this.rows.length){this.el.innerHTML='<p class="empty">尚無資料</p>';return;}
      const all=this.period==='weekly'?weekly(this.rows):this.rows,tech=indicators(all);
      const span=Math.min(all.length,this.period==='weekly'?Math.max(10,Math.round(this.span/5)):this.span);
      this.offset=Math.max(0,Math.min(all.length-span,this.offset));const end=all.length-this.offset,start=Math.max(0,end-span),data=all.slice(start,end);
      const W=1000,H=this.rsi?580:470,L=32,R=84,T=28,B=340,VB=428,VT=367;
      let low=Math.min(...data.map(r=>r.low)),high=Math.max(...data.map(r=>r.high));
      for(const key of this.overlays){const vals=tech[key]?.slice(start,end).filter(Number.isFinite)||[];if(vals.length){low=Math.min(low,...vals);high=Math.max(high,...vals);}}
      const trans=v=>this.log?Math.log(v):v,inv=v=>this.log?Math.exp(v):v;
      let lo=trans(low),hi=trans(high);const pad=Math.max((hi-lo)*.1,this.log?.005:Math.abs(high)*.005);lo-=pad;hi+=pad;
      const x=i=>L+(i+.5)*(W-L-R)/data.length,y=v=>T+(hi-trans(v))/(hi-lo)*(B-T);
      const ix=date=>{let i=data.findIndex(r=>r.date>=date);return i<0?data.length-1:i;};
      const color=r=>r.close>=r.open?'#ef977e':'#65c6b1';
      let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(this.options.label||'K 線與成交量')}，${data[0].date} 至 ${data.at(-1).date}">`;
      for(let i=0;i<5;i++){const yy=T+(B-T)*i/4,v=inv(hi-(hi-lo)*i/4);svg+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="chart-grid"/><text x="${W-R+12}" y="${yy+5}" class="axis-label">${fmt(v)}</text>`;}
      const vmax=Math.max(1,...data.map(r=>r.volume));
      data.forEach((r,i)=>{const w=Math.max(1,Math.min(13,(W-L-R)/data.length*.64));svg+=`<line x1="${x(i)}" x2="${x(i)}" y1="${y(r.high)}" y2="${y(r.low)}" stroke="${color(r)}"/><rect x="${x(i)-w/2}" y="${Math.min(y(r.open),y(r.close))}" width="${w}" height="${Math.max(1.2,Math.abs(y(r.open)-y(r.close)))}" fill="${color(r)}"/><rect x="${x(i)-w/2}" y="${VB-r.volume/vmax*(VB-VT)}" width="${w}" height="${r.volume/vmax*(VB-VT)}" fill="${color(r)}" opacity=".5"/>`;});
      for(const [key,col] of [['ma20','#e8c46e'],['ma60','#9dadec']])if(this.overlays.has(key)){let d='';let pen=false;tech[key].slice(start,end).forEach((v,i)=>{if(!Number.isFinite(v)){pen=false;return;}d+=`${pen?'L':'M'}${x(i)},${y(v)}`;pen=true;});svg+=`<path d="${d}" stroke="${col}" stroke-width="2" fill="none"/>`;}
      const visibleDate=data[0].date,lastDate=data.at(-1).date;
      const lineSVG=(a,col,label)=>{
        if(a.a.date>lastDate||a.b.date>lastDate||a.b.date<visibleDate||a.a.price<=0||a.b.price<=0)return '';
        const ax=x(ix(a.a.date)),bx=x(ix(a.b.date)),ay=y(a.a.price),by=y(a.b.price);
        if(ay<T-10||ay>B+10||by<T-10||by>B+10)return '';
        if(a.mode==='zone')return `<rect x="${Math.min(ax,bx)}" y="${Math.min(ay,by)}" width="${Math.max(2,Math.abs(ax-bx))}" height="${Math.max(2,Math.abs(ay-by))}" fill="${col}" opacity=".17" stroke="${col}"/><text x="${Math.min(ax,bx)+5}" y="${Math.min(ay,by)+15}" class="line-label" fill="${col}">${esc(label)}</text>`;
        return `<line x1="${ax}" x2="${bx}" y1="${ay}" y2="${by}" stroke="${col}" stroke-width="2" stroke-dasharray="6 5"/><text x="${Math.max(L,Math.min(ax,bx))+5}" y="${Math.max(T+15,Math.min(ay,by)-8)}" class="line-label" fill="${col}">${esc(label)}</text>`;
      };
      if(this.showAnnotations){
        for(const a of this.annotations){if(a.knownDate>lastDate)continue;if(a.a){svg+=lineSVG(a,'#e8c46e',a.label);continue;}if(a.date<visibleDate||a.date>lastDate)continue;const xx=x(ix(a.date)),yy=y(a.price);if(yy<T||yy>B)continue;svg+=`<circle cx="${xx}" cy="${yy}" r="12" fill="#e8c46e" stroke="#182824" stroke-width="2"/><text x="${xx}" y="${yy+4}" text-anchor="middle" fill="#162822" font-size="13" font-weight="700">${esc(a.label)}</text>`;}
      }
      for(const a of this.lines)svg+=lineSVG(a,'#c6b1ff',a.label||'我的標記');
      if(this.pending&&this.pending.date>=visibleDate&&this.pending.date<=lastDate)svg+=`<circle cx="${x(ix(this.pending.date))}" cy="${y(this.pending.price)}" r="6" fill="#c6b1ff"/>`;
      if(this.rsi){const yR=v=>540-v*85/100;svg+=`<text x="${L}" y="466" class="axis-label">RSI 14 · Wilder</text>`;for(const v of [30,70])svg+=`<line x1="${L}" x2="${W-R}" y1="${yR(v)}" y2="${yR(v)}" class="chart-grid"/><text x="${W-R+12}" y="${yR(v)+4}" class="axis-label">${v}</text>`;let d='';let pen=false;tech.rsi.slice(start,end).forEach((v,i)=>{if(v===null){pen=false;return;}d+=`${pen?'L':'M'}${x(i)},${yR(v)}`;pen=true;});svg+=`<path d="${d}" stroke="#c6b1ff" fill="none" stroke-width="2"/>`;}
      for(let i=0;i<4;i++){const n=Math.round(i*(data.length-1)/3);svg+=`<text x="${x(n)}" y="${H-10}" text-anchor="${i===0?'start':i===3?'end':'middle'}" class="axis-label">${data[n].date}</text>`;}
      svg+=`<text x="${L}" y="${VT-9}" class="axis-label">VOLUME · ${this.options.schematic?'示意單位':'來源成交股數'}</text><g class="cross" visibility="hidden"><line class="cross-x" y1="${T}" y2="${VB}" stroke="#e6eee5" stroke-dasharray="3 3" opacity=".6"/></g></svg>`;
      this.el.innerHTML=svg;this.g={data,all,tech,start,x,y,L,R,W,H,T,B,lo,hi,inv};
      this.options.onRange?.(data[0].date,data.at(-1).date);
    }
    coords(e){const r=this.el.querySelector('svg').getBoundingClientRect(),g=this.g,scale=Math.min(r.width/g.W,r.height/g.H),ox=(r.width-g.W*scale)/2,oy=(r.height-g.H*scale)/2;const xx=(e.clientX-r.left-ox)/scale,yy=(e.clientY-r.top-oy)/scale;return {i:Math.max(0,Math.min(g.data.length-1,Math.floor((xx-g.L)/(g.W-g.L-g.R)*g.data.length))),price:g.inv(g.hi-(yy-g.T)/(g.B-g.T)*(g.hi-g.lo)),yy};}
    down(e){if(!this.g||e.button!==0)return;this.drag={x:e.clientX,offset:this.offset,moved:false};this.el.setPointerCapture(e.pointerId);}
    move(e){if(!this.g)return;if(this.drag&&this.mode==='pan'&&Math.abs(e.clientX-this.drag.x)>5){this.drag.moved=true;this.offset=Math.round(this.drag.offset+(e.clientX-this.drag.x)/this.el.clientWidth*this.g.data.length);this.render();return;}const p=this.coords(e);this.read(p.i);}
    up(e){if(!this.g)return;const drag=this.drag;this.drag=null;if(this.mode==='pan'||drag?.moved)return;const p=this.coords(e);if(p.yy<this.g.T||p.yy>this.g.B)return;const point={date:this.g.data[p.i].date,price:Number(p.price.toFixed(4))};
      if(!this.pending){this.pending=point;this.options.onHint?.('已選第一點；再點一次完成標記。');}
      else{const a=this.pending,b=point;if(['support','resistance','neckline'].includes(this.mode))b.price=a.price;const names={support:'支撐',resistance:'壓力',neckline:'頸線',trend:'趨勢線',zone:'價格區帶'};this.lines.push({a,b,mode:this.mode,label:names[this.mode]});this.pending=null;this.options.onDraw?.(this.lines);this.options.onHint?.('標記已保存，可撤銷或清除。');}this.render();}
    read(i){const g=this.g,r=g?.data[i];if(!r)return;const group=this.el.querySelector('.cross');group?.setAttribute('visibility','visible');const line=this.el.querySelector('.cross-x');line?.setAttribute('x1',g.x(i));line?.setAttribute('x2',g.x(i));this.options.onHover?.(r,{rsi:g.tech.rsi[g.start+i],atr:g.tech.atr[g.start+i]});}
  }
  const api={Chart,unpack,weekly,indicators,risk,esc,fmt};root.AcademyChart=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
