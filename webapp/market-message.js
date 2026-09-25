(function () {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;", "'":"&#39;"}[ch]));
  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "時間未提供" : new Intl.DateTimeFormat("zh-TW", { month:"short", day:"numeric", timeZone:"Asia/Taipei" }).format(date);
  };
  const isFresh = value => {
    const time = new Date(value).getTime();
    return Number.isFinite(time) && Date.now() - time <= 7 * 86400000;
  };
  const card = video => `<a class="market-video-card" href="${esc(video.watchUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在 YouTube 開啟 ${esc(video.title)}">
    <span class="market-video-thumb"><img src="${esc(video.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"><i aria-hidden="true">▶</i></span>
    <span class="market-video-body"><small>${esc(video.channelName || "財經頻道")}</small><strong>${esc(video.title)}</strong><time datetime="${esc(video.publishedAt)}">${formatDate(video.publishedAt)}</time></span>
  </a>`;

  async function renderVideos(target) {
    if (!target || target.dataset.loaded === "true") return;
    target.dataset.loaded = "loading";
    try {
      const response = await fetch("financial_videos.json", { cache:"no-cache" });
      if (!response.ok) throw new Error("財經影音資料暫時無法載入");
      const data = await response.json();
      const videos = (data.channels || []).flatMap(channel => (channel.videos || []).map(video => ({ ...video, channelName: video.channelName || channel.name })))
        .filter(video => isFresh(video.publishedAt))
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      target.innerHTML = videos.length
        ? `<div class="market-video-grid">${videos.slice(0, 6).map(card).join("")}</div><p class="market-source">影片由 YouTube 官方頻道提供，點擊後前往原始來源。</p>`
        : `<div class="market-video-empty">本週暫無新的財經影音。</div>`;
      target.dataset.loaded = "true";
    } catch (error) {
      target.dataset.loaded = "error";
      target.innerHTML = `<div class="market-video-empty">${esc(error.message || "財經影音暫時無法取得，請稍後再試。")}</div>`;
    }
  }

  window.MarketMessages = { renderVideos };
})();
