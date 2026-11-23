(function(root){
  'use strict';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const field=state=>`${state.side}${state.order==='balance'?'Balance':'Delta'}${state.unit==='lots'?'Lots':'Value'}`;
  function valid(p){
    return p?.schemaVersion===1&&p.quoteType==='officialCredit'&&/^\d{4}-\d{2}-\d{2}$/.test(p.asOf)&&p.priceAsOf===p.asOf&&p.valueMethod==='lots-times-1000-times-same-session-close'&&Array.isArray(p.rows)&&
      ['TWSE','TPEX'].every(m=>p.rows.some(r=>r.exchange===m))&&new Set(p.rows.map(r=>r.exchange+':'+r.code)).size===p.rows.length&&
      p.rows.every(r=>['TWSE','TPEX'].includes(r.exchange)&&['stock','etf'].includes(r.kind)&&typeof r.code==='string'&&typeof r.name==='string'&&
        ['marginBalanceLots','marginDeltaLots','shortBalanceLots','shortDeltaLots','marginBalanceValue','marginDeltaValue','shortBalanceValue','shortDeltaValue','close'].every(f=>r[f]===null||finite(r[f])));
  }
  function rank(rows,state){
    const key=field(state),q=state.query.trim().toLowerCase();
    return rows.filter(r=>(state.market==='all'||r.exchange===state.market)&&(state.kind==='all'||r.kind===state.kind)&&(!q||`${r.code} ${r.name}`.toLowerCase().includes(q))&&finite(r[key])&&
      (state.order==='decrease'?r[key]<0:r[key]>0))
      .sort((a,b)=>(state.order==='decrease'?a[key]-b[key]:b[key]-a[key])||a.code.localeCompare(b.code)||a.exchange.localeCompare(b.exchange));
  }
  const api={finite,field,valid,rank};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CreditRankingsCore=api;
})(typeof window==='undefined'?globalThis:window);
