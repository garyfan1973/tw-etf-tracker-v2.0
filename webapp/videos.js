(function () {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const cutoff = () => Date.now() - 7 * 86400000;
  const isFresh = video => new Date(video.publishedAt).getTime() >= cutoff();
  const formatDate = value => new Intl.DateTimeFormat("zh-TW", {month:"short",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Taipei"}).format(new Date(value));
  const isNew = value => Date.now() - new Date(value).getTime() < 86400000;
  function card(video) {
    return `<a class="video-card" href="${esc(video.watchUrl)}" target="_blank" rel="noopener" aria-label="在 YouTube 開啟 ${esc(video.title)}">
      <span class="video-thumb"><img src="${esc(video.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"><i aria-hidden="true">▶</i>${isNew(video.publishedAt)?'<b>最新</b>':""}</span>
      <span class="video-card-body"><small>${esc(video.channelName)}</small><strong>${esc(video.title)}</strong><time datetime="${esc(video.publishedAt)}">${formatDate(video.publishedAt)}</time></span>
    </a>`;
  }

  function renderGrid(target, videos, limit) {
    const rows=videos.filter(isFresh).slice(0,limit||videos.length);
    target.innerHTML=rows.length?rows.map(card).join(""):'<div class="video-week-empty"><span>本週暫無新片</span><small>可點擊頻道名稱前往 YouTube 查看更多內容。</small></div>';
    return rows.length;
  }

  function renderMacroNews(data) {
    const target=$("macroNewsSections"),sections=data.sections||[];
    if(!sections.length){target.innerHTML='<div class="macro-news-empty">目前沒有五天內的總經新聞</div>';return;}
    target.innerHTML=sections.map(section=>`<details class="macro-news-section"><summary><span>${esc(section.name)}</span><b>${section.items.length} 則</b></summary><div class="macro-news-list">${section.items.map(item=>`<a href="${esc(item.url)}" target="_blank" rel="noopener"><span>${esc(item.source)}・${formatDate(item.publishedAt)}</span><strong>${esc(item.title)}</strong></a>`).join("")}</div></details>`).join("");
  }

  async function init() {
    try {
      const [videoResponse,newsResponse]=await Promise.all([fetch("financial_videos.json",{cache:"no-cache"}),fetch("macro_news.json",{cache:"no-cache"})]);if(!videoResponse.ok)throw new Error("財經影音資料暫時無法載入");const data=await videoResponse.json();
      $("videosUpdated").textContent=`資料更新：${new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Taipei"}).format(new Date(data.updatedAt))}`;
      if(newsResponse.ok){const news=await newsResponse.json();renderMacroNews(news);if(news.updatedAt)$('newsUpdated').textContent=`更新：${formatDate(news.updatedAt)}・保留五天`;}else renderMacroNews({sections:[]});
      const channels=(data.channels||[]).slice().sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned)));
      $("channelSections").innerHTML=channels.map(channel=>`<details class="panel video-channel-section${channel.pinned?" is-pinned":""}"><summary class="video-section-head"><div><span class="video-kicker">${channel.pinned?"Pinned morning program":"Curated channel"}</span><h2>${esc(channel.name)}${channel.pinned?'<span class="video-pin">置頂</span>':""}</h2></div><span class="video-count">${(channel.videos||[]).filter(isFresh).length} 部・展開</span></summary><div class="video-channel-actions"><a href="${esc(channel.url)}" target="_blank" rel="noopener">前往 YouTube 頻道 ↗</a></div><div class="video-grid" data-channel-grid="${esc(channel.id)}"></div></details>`).join("");
      channels.forEach(channel=>renderGrid(document.querySelector(`[data-channel-grid="${CSS.escape(channel.id)}"]`),channel.videos||[]));
    } catch(error) { $("pageError").hidden=false;$("pageError").textContent=error.message||"資料載入失敗，請稍後再試。"; }
  }
  init();
})();
