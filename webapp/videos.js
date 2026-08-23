(function () {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const cutoff = () => Date.now() - 7 * 86400000;
  const isFresh = video => new Date(video.publishedAt).getTime() >= cutoff();
  const formatDate = value => new Intl.DateTimeFormat("zh-TW", {month:"short",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Taipei"}).format(new Date(value));
  const isNew = value => Date.now() - new Date(value).getTime() < 86400000;
  let videosById = new Map();

  function card(video) {
    videosById.set(video.videoId, video);
    return `<button class="video-card" data-video-id="${esc(video.videoId)}" aria-label="播放 ${esc(video.title)}">
      <span class="video-thumb"><img src="${esc(video.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"><i aria-hidden="true">▶</i>${isNew(video.publishedAt)?'<b>最新</b>':""}</span>
      <span class="video-card-body"><small>${esc(video.channelName)}</small><strong>${esc(video.title)}</strong><time datetime="${esc(video.publishedAt)}">${formatDate(video.publishedAt)}</time></span>
    </button>`;
  }

  function renderGrid(target, videos, limit) {
    const rows=videos.filter(isFresh).slice(0,limit||videos.length);
    target.innerHTML=rows.length?rows.map(card).join(""):'<div class="video-week-empty"><span>本週暫無新片</span><small>可點擊頻道名稱前往 YouTube 查看更多內容。</small></div>';
    return rows.length;
  }

  function openVideo(video) {
    if(!video)return;
    const dialog=$("videoDialog");
    $("videoDialogChannel").textContent=video.channelName;$("videoDialogTitle").textContent=video.title;$("videoDialogDate").textContent=`發布：${formatDate(video.publishedAt)}`;$("videoYoutubeLink").href=video.watchUrl;
    $("videoPlayer").innerHTML=`<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.videoId)}?autoplay=1&rel=0" title="${esc(video.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");
  }

  function closeVideo() {
    $("videoPlayer").innerHTML="";const dialog=$("videoDialog");if(typeof dialog.close==="function"&&dialog.open)dialog.close();else dialog.removeAttribute("open");
  }

  async function init() {
    try {
      const response=await fetch("financial_videos.json",{cache:"no-cache"});if(!response.ok)throw new Error("財經影音資料暫時無法載入");const data=await response.json();
      $("videosUpdated").textContent=`資料更新：${new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Taipei"}).format(new Date(data.updatedAt))}`;
      const latestCount=renderGrid($("latestVideos"),data.latest||[],12);$("latestCount").textContent=`${latestCount} 部新片`;
      $("channelSections").innerHTML=(data.channels||[]).map(channel=>`<section class="panel video-channel-section"><div class="video-section-head"><div><span class="video-kicker">Curated channel</span><h2><a href="${esc(channel.url)}" target="_blank" rel="noopener">${esc(channel.name)} <small>↗</small></a></h2></div><span class="video-count">${(channel.videos||[]).filter(isFresh).length} 部</span></div><div class="video-grid" data-channel-grid="${esc(channel.id)}"></div></section>`).join("");
      (data.channels||[]).forEach(channel=>renderGrid(document.querySelector(`[data-channel-grid="${CSS.escape(channel.id)}"]`),channel.videos||[]));
      document.addEventListener("click",event=>{const button=event.target.closest(".video-card[data-video-id]");if(button)openVideo(videosById.get(button.dataset.videoId));});
      $("videoDialogClose").addEventListener("click",closeVideo);$("videoDialog").addEventListener("click",event=>{if(event.target===$("videoDialog"))closeVideo();});$("videoDialog").addEventListener("close",()=>{$("videoPlayer").innerHTML="";});
    } catch(error) { $("pageError").hidden=false;$("pageError").textContent=error.message||"資料載入失敗，請稍後再試。"; }
  }
  init();
})();
