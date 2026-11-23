(function(root){
  'use strict';
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const metrics={volume:{field:'volume',label:'成交量'},gain:{field:'changePct',label:'漲幅'},loss:{field:'changePct',label:'跌幅'},spread:{field:'spread',label:'價差'},price:{field:'close',label:'股價'},turnover:{field:'turnover',label:'成交金額'}};
  function rank(rows,state){
    const metric=metrics[state.metric]||metrics.volume,q=String(state.query||'').trim().toLowerCase();
    return rows.filter(row=>(state.market==='all'||row.exchange===state.market)&&
      (state.kind==='all'||row.kind===state.kind)&&(!q||`${row.code} ${row.name}`.toLowerCase().includes(q))&&
      finite(row[metric.field])&&(state.metric!=='gain'||row.changePct>0)&&(state.metric!=='loss'||row.changePct<0))
      .sort((a,b)=>(state.mode==='live'&&finite(a.sourceRank)&&finite(b.sourceRank)?a.sourceRank-b.sourceRank:(state.metric==='loss'?a[metric.field]-b[metric.field]:b[metric.field]-a[metric.field]))||a.code.localeCompare(b.code)||a.exchange.localeCompare(b.exchange));
  }
  function valid(payload){
    if(payload?.schemaVersion!==1||!/^\d{4}-\d{2}-\d{2}$/.test(payload.asOf)||!Array.isArray(payload.rows))return false;
    if(payload.quoteType==='officialClose')return payload.rows.length>0&&['TWSE','TPEX'].every(exchange=>payload.rows.some(row=>row.exchange===exchange));
    return payload.quoteType==='intradaySnapshot'&&payload.rankingScope==='providerTop100'&&!!metrics[payload.metric]&&
      ['all','TWSE','TPEX'].includes(payload.market)&&Number.isFinite(Date.parse(payload.sourceTime))&&
      finite(payload.sourceRows)&&payload.sourceRows>=payload.rows.length&&payload.sourceRows<=100&&
      payload.rows.every(row=>['TWSE','TPEX'].includes(row.exchange)&&(payload.market==='all'||payload.market===row.exchange));
  }
  const matches=(payload,state)=>payload.quoteType==='officialClose'||state.mode==='live'&&payload.metric===state.metric&&payload.market===state.market;
  const older=(next,previous)=>previous&&next.quoteType===previous.quoteType&&(next.asOf<previous.asOf||next.quoteType==='intradaySnapshot'&&next.metric===previous.metric&&next.market===previous.market&&Date.parse(next.sourceTime)<Date.parse(previous.sourceTime));
  // Only explicit current-price flags count; dayHigh/dayLow flags can describe
  // an earlier touch and percentages differ across instrument types.
  const limitState=row=>row.limitUp===true&&row.limitDown!==true?'up':row.limitDown===true&&row.limitUp!==true?'down':'';
  const api={finite,metrics,rank,valid,matches,older,limitState};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MarketRankingsCore=api;
})(typeof window==='undefined'?globalThis:window);
