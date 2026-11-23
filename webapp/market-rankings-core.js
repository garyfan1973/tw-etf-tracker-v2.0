(function(root){
  'use strict';
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const metrics={volume:{field:'volume',label:'成交量'},gain:{field:'changePct',label:'漲幅'},loss:{field:'changePct',label:'跌幅'},spread:{field:'spread',label:'價差'},price:{field:'close',label:'股價'},turnover:{field:'turnover',label:'成交金額'}};
  function rank(rows,state){
    const metric=metrics[state.metric]||metrics.volume,q=String(state.query||'').trim().toLowerCase();
    return rows.filter(row=>(state.market==='all'||row.exchange===state.market)&&
      (state.kind==='all'||row.kind===state.kind)&&(!q||`${row.code} ${row.name}`.toLowerCase().includes(q))&&
      finite(row[metric.field])&&(state.metric!=='gain'||row.changePct>0)&&(state.metric!=='loss'||row.changePct<0))
      .sort((a,b)=>(state.metric==='loss'?a[metric.field]-b[metric.field]:b[metric.field]-a[metric.field])||a.code.localeCompare(b.code)||a.exchange.localeCompare(b.exchange));
  }
  function valid(payload){
    return payload?.schemaVersion===1&&payload.quoteType==='officialClose'&&/^\d{4}-\d{2}-\d{2}$/.test(payload.asOf)&&
      Array.isArray(payload.rows)&&payload.rows.length>0&&['TWSE','TPEX'].every(exchange=>payload.rows.some(row=>row.exchange===exchange));
  }
  const api={finite,metrics,rank,valid};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MarketRankingsCore=api;
})(typeof window==='undefined'?globalThis:window);
