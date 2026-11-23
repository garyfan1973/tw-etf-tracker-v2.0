(function(root){
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const key = r => `${r.exchange}:${r.code}`;
  function aggregate(days, navs, meta) {
    if (!days.length) return [];
    const latest = days.at(-1), maps = days.map(day => new Map(day.rows.map(row => [key(row), row])));
    return latest.rows.map(row => {
      const history = maps.map(map => map.get(key(row)));
      const sum = field => history.every(r => r && finite(r[field])) ? history.reduce((n,r) => n+r[field],0) : null;
      const amounts = history.map(r => r && r.currency === 'TWD' && finite(r.foreign) && finite(r.close) && r.close>0 ? r.foreign*r.close : null);
      const nav = navs[row.code]?.[latest.date] || {};
      const premium = finite(nav.premium) ? nav.premium : finite(nav.nav) && nav.nav > 0 && finite(row.close) ? (row.close/nav.nav-1)*100 : null;
      const foreign = sum('foreign'), volume = sum('volume');
      let streak = 0;
      for (let i = history.length-1; i >= 0; i--) {
        const v=history[i]?.foreign;
        if (!finite(v) || v === 0 || (streak && Math.sign(v)!==Math.sign(streak))) break;
        streak += Math.sign(v);
      }
      const metadata = meta[row.code] || {};
      const signals = [foreign < 0 && finite(foreign) ? '外資賣超' : null,
        row.kind==='etf' && finite(premium) && premium<0 ? '收盤折價' : null,
        finite(row.shortChange) && row.shortChange>0 ? '借券賣出餘額增加' : null].filter(Boolean);
      return {...row,foreign,trust:sum('trust'),dealer:sum('dealer'),
        amount:amounts.every(finite) ? amounts.reduce((a,b)=>a+b,0) : null,
        flowRatio:finite(foreign) && finite(volume) && volume>0 ? foreign/volume*100 : null,
        nav:finite(nav.nav) ? nav.nav : null,premium,active:metadata.active ?? row.name.includes('主動'),
        domestic:metadata.domestic,signals,streak,days:history.filter(r=>r&&finite(r.foreign)).length};
    });
  }
  function filter(rows, state) {
    const q=String(state.query||'').trim().toLowerCase();
    return rows.filter(r => (!q || `${r.code} ${r.name}`.toLowerCase().includes(q)) &&
      (state.market==='all'||r.exchange===state.market) &&
      (state.kind==='all'||r.kind===state.kind||state.kind==='active'&&r.kind==='etf'&&r.active||state.kind==='domesticEtf'&&r.kind==='etf'&&r.domestic===true||state.kind==='activeDomestic'&&r.kind==='etf'&&r.active&&r.domestic===true) &&
      (!state.watch||r.kind==='etf'&&r.signals.length===3));
  }
  function rank(rows, metric, direction) {
    return rows.filter(r=>finite(r[metric]) && (direction==='buy'?r[metric]>0:direction==='sell'?r[metric]<0:true))
      .sort((a,b)=>(direction==='buy'?b[metric]-a[metric]:a[metric]-b[metric])||a.code.localeCompare(b.code));
  }
  function csv(rows) {
    const safe = v => {let s=String(v??'');if(/^[=+@\-\t\r]/.test(s)&&!finite(v))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    return '\uFEFF'+[['代號','名稱','市場','外資淨股數(單位)','外資估算淨額(TWD)','投信淨股數','自營商淨股數','收盤','同日NAV','折溢價(%)','借券賣出餘額','借券賣出餘額增減'],
      ...rows.map(r=>[r.code,r.name,r.exchange,r.foreign,r.amount,r.trust,r.dealer,r.close,r.nav,r.premium,r.shortBalance,r.shortChange])].map(row=>row.map(safe).join(',')).join('\r\n');
  }
  const api={finite,key,aggregate,filter,rank,csv};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MarketFlowCore=api;
})(typeof window==='undefined'?globalThis:window);
