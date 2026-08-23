(function () {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const fmt = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("zh-TW", {minimumFractionDigits:digits, maximumFractionDigits:digits});
  const dateFmt = value => value ? new Intl.DateTimeFormat("zh-TW", {year:"numeric",month:"short",day:"numeric",timeZone:"Asia/Taipei"}).format(new Date(`${value.slice(0,10)}T12:00:00Z`)) : "—";
  const dateTimeFmt = value => value ? new Intl.DateTimeFormat("zh-TW", {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Taipei"}).format(new Date(value)) : "—";
  const colors = {targetUpper:"#3b5bdb", targetLower:"#8aa1ff", effectiveRate:"#e4a400"};
  let data, rateRange = "1Y", balanceRange = "1Y", balanceId = "totalAssets";

  function windowRows(rows, range) {
    if (!rows.length) return [];
    const years = {"1Y":1,"3Y":3,"5Y":5}[range] || 5;
    const end = new Date(`${rows.at(-1).date}T00:00:00Z`);
    const cutoff = new Date(end); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
    return rows.filter(row => new Date(`${row.date}T00:00:00Z`) >= cutoff);
  }

  function daysUntil(value) {
    if (!value) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(`${value}T00:00:00`);
    return Math.ceil((target - today) / 86400000);
  }

  function renderSummary() {
    const summary = data.summary || {}, lower = summary.targetLower?.value, upper = summary.targetUpper?.value;
    const previous = summary.previousTargetUpper, move = upper == null || previous == null ? "—" : upper < previous ? `較前次調降 ${fmt((previous-upper)*100,0)} bp` : upper > previous ? `較前次調升 ${fmt((upper-previous)*100,0)} bp` : "較前次維持不變";
    const next = summary.nextMeeting, remaining = daysUntil(next?.end), assets = summary.totalAssets?.value;
    $("fedSummary").innerHTML = `
      <article class="fed-metric-card"><span>聯邦基金利率目標</span><strong>${fmt(lower,2)}%–${fmt(upper,2)}%</strong><small>${esc(move)}・${esc(summary.targetUpper?.date || "")}</small></article>
      <article class="fed-metric-card"><span>有效聯邦基金利率 EFFR</span><strong>${fmt(summary.effectiveRate?.value,2)}%</strong><small>資料日 ${esc(summary.effectiveRate?.date || "—")}</small></article>
      <article class="fed-metric-card"><span>聯準會總資產</span><strong>${assets == null ? "—" : `${fmt(assets/1000,2)} 兆美元`}</strong><small>資料日 ${esc(summary.totalAssets?.date || "—")}</small></article>
      <article class="fed-metric-card accent"><span>下次 FOMC</span><strong>${next ? `${dateFmt(next.start)}–${dateFmt(next.end).replace(/^.*年/,"")}` : "待公布"}</strong><small>${remaining == null ? "官方日程尚未公布" : remaining <= 0 ? "會議進行中" : `距政策決策約 ${remaining} 天`}${next?.projections ? "・含經濟預測":""}</small></article>`;
  }

  function drawChart(target, rows, series, options = {}) {
    if (!target || !rows.length) { if (target) target.innerHTML = '<div class="chart-empty">目前沒有可顯示的資料</div>'; return; }
    const narrow = target.clientWidth < 620, W = narrow ? Math.max(360, target.clientWidth || 360) : 1000, H = narrow ? 300 : 350, L = narrow ? 48 : 64, R = 20, T = 18, B = 38;
    const values = rows.flatMap(row => series.map(item => Number(row[item.key]))).filter(Number.isFinite);
    let min = Math.min(...values), max = Math.max(...values), pad = (max-min || Math.abs(max) || 1) * .08; min -= pad; max += pad;
    const x = index => L + index * (W-L-R) / Math.max(1, rows.length-1), y = value => T + (max-value) * (H-T-B) / (max-min);
    const grid = [0,.25,.5,.75,1].map(p => { const yy=T+p*(H-T-B), value=max-p*(max-min); return `<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text class="chart-label" x="${L-8}" y="${yy+4}" text-anchor="end">${fmt(value, options.digits ?? 2)}</text>`; }).join("");
    const ticks = (narrow ? [0,.5,1] : [0,.25,.5,.75,1]).map(p => { const index=Math.min(rows.length-1,Math.round(p*(rows.length-1))), xx=x(index); return `<text class="chart-label" x="${xx}" y="${H-10}" text-anchor="${p===0?"start":p===1?"end":"middle"}">${esc(rows[index].date.slice(0,7))}</text>`; }).join("");
    const paths = series.map(item => { const commands=[]; let drawing=false; rows.forEach((row,index) => { const value=Number(row[item.key]); if(!Number.isFinite(value)){drawing=false;return;} commands.push(`${drawing?"L":"M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`);drawing=true; }); return `<path d="${commands.join(" ")}" fill="none" stroke="${item.color}" stroke-width="${item.width||2.3}" vector-effect="non-scaling-stroke"/>`; }).join("");
    target.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(options.label||"聯準會資料走勢圖")}">${grid}${ticks}${paths}<g class="fed-hover" visibility="hidden"><line class="chart-crosshair fed-cross-v" y1="${T}" y2="${H-B}"/><line class="chart-crosshair fed-cross-h" x1="${L}" x2="${W-R}"/></g><rect class="fed-hit" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/></svg><div class="chart-tooltip" hidden></div>`;
    const svg=target.querySelector("svg"), hit=target.querySelector(".fed-hit"), hover=target.querySelector(".fed-hover"), v=target.querySelector(".fed-cross-v"), h=target.querySelector(".fed-cross-h"), tip=target.querySelector(".chart-tooltip");
    hit.addEventListener("pointermove", event => {
      const rect=svg.getBoundingClientRect(), px=(event.clientX-rect.left)*W/rect.width, py=(event.clientY-rect.top)*H/rect.height, ratio=Math.max(0,Math.min(1,(px-L)/(W-L-R))), index=Math.min(rows.length-1,Math.round(ratio*(rows.length-1))), row=rows[index], xx=x(index), yy=Math.max(T,Math.min(H-B,py));
      hover.setAttribute("visibility","visible");v.setAttribute("x1",xx);v.setAttribute("x2",xx);h.setAttribute("y1",yy);h.setAttribute("y2",yy);tip.hidden=false;tip.classList.toggle("left",ratio>.7);tip.style.left=`${xx/W*rect.width}px`;tip.style.top=`${yy/H*rect.height}px`;tip.innerHTML=`<strong>${esc(row.date)}</strong>${series.map(item=>`<div class="chart-tooltip-row"><span>${esc(item.label)}</span><span>${fmt(row[item.key],options.digits??2)}${esc(options.suffix||"")}</span></div>`).join("")}`;
    });
    hit.addEventListener("pointerleave", () => { hover.setAttribute("visibility","hidden"); tip.hidden=true; });
  }

  function renderRateChart() {
    drawChart($("rateChart"), windowRows(data.rateHistory || [], rateRange), [
      {key:"targetUpper",label:"目標上限",color:colors.targetUpper},
      {key:"targetLower",label:"目標下限",color:colors.targetLower},
      {key:"effectiveRate",label:"有效利率",color:colors.effectiveRate,width:2.8},
    ], {label:"聯邦基金利率路徑",suffix:"%",digits:2});
  }

  function renderBalanceChart() {
    const item=(data.balanceSheet||[]).find(row=>row.id===balanceId) || data.balanceSheet?.[0];
    if(!item)return;
    $("balanceChartSubtitle").textContent=`${item.label}・單位：${item.unit}`;
    drawChart($("balanceChart"), windowRows(item.rows||[],balanceRange), [{key:"value",label:item.label,color:colors.targetUpper}], {label:item.label,digits:item.id==="onRrp"?1:0});
  }

  function renderBalanceSwitch() {
    $("balanceSeries").innerHTML=(data.balanceSheet||[]).map(item=>`<button data-series="${esc(item.id)}" class="${item.id===balanceId?"active":""}">${esc(item.label)}</button>`).join("");
    $("balanceSeries").onclick=event=>{const button=event.target.closest("button[data-series]");if(!button)return;balanceId=button.dataset.series;renderBalanceSwitch();renderBalanceChart();};
  }

  function renderTimeline() {
    const today=new Date().toISOString().slice(0,10), meetings=(data.meetings||[]).filter(item=>item.end>=today).slice(0,6);
    $("fomcTimeline").innerHTML=meetings.length?meetings.map((item,index)=>`<div class="fomc-item ${index===0?"next":""}"><span>${dateFmt(item.start)}–${dateFmt(item.end).replace(/^.*年/,"")}${item.projections?" *":""}</span><strong>${index===0?"下次會議":"預定會議"}</strong></div>`).join(""):'<div class="chart-empty compact">目前沒有已公布的未來日程</div>';
  }

  function renderEvents() {
    const events=(data.policyEvents||[]).slice(0,8);
    const translateTitle=title=>/issues FOMC statement/i.test(title)?"聯準會發布 FOMC 政策聲明":/Minutes of the Federal Open Market Committee/i.test(title)?title.replace(/Minutes of the Federal Open Market Committee/i,"FOMC 會議紀要").replace(/, /,"："):/economic projections/i.test(title)?"FOMC 發布經濟預測摘要":/discount rate meeting/i.test(title)?"聯準會貼現率會議紀要":title;
    $("policyEvents").innerHTML=events.length?events.map(item=>{const title=translateTitle(item.title),summary=item.summary&&item.summary!==item.title?item.summary:"";return `<a href="${esc(item.url)}" target="_blank" rel="noopener"><time>${dateTimeFmt(item.publishedAt)}</time><strong>${esc(title)}</strong>${summary?`<span>${esc(summary)}</span>`:""}</a>`;}).join(""):'<div class="chart-empty compact">近三個月暫無政策新聞稿</div>';
  }

  function bindRanges(id, type) {
    $(id).addEventListener("click",event=>{const button=event.target.closest("button[data-range]");if(!button)return;$(id).querySelectorAll("button").forEach(item=>item.classList.toggle("active",item===button));if(type==="rate"){rateRange=button.dataset.range;renderRateChart();}else{balanceRange=button.dataset.range;renderBalanceChart();}});
  }

  async function init() {
    try {
      const response=await fetch("fed_policy_data.json",{cache:"no-cache"});if(!response.ok)throw new Error("聯準會資料暫時無法載入");data=await response.json();
      $("fedUpdated").textContent=`資料更新：${new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Taipei"}).format(new Date(data.updatedAt))}`;
      renderSummary();renderRateChart();renderBalanceSwitch();renderBalanceChart();renderTimeline();renderEvents();bindRanges("rateRanges","rate");bindRanges("balanceRanges","balance");window.addEventListener("resize",()=>{renderRateChart();renderBalanceChart();});
    } catch(error) { $("pageError").hidden=false;$("pageError").textContent=error.message||"資料載入失敗，請稍後再試。"; }
  }
  init();
})();
