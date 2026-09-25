(function () {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;", "'":"&#39;"}[ch]));
  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "時間未提供" : new Intl.DateTimeFormat("zh-TW", { month:"short", day:"numeric", weekday:"short", timeZone:"Asia/Taipei" }).format(date);
  };
  const formatDateTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "時間未提供" : new Intl.DateTimeFormat("zh-TW", { year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Taipei" }).format(date);
  };
  const isFresh = value => {
    const time = new Date(value).getTime();
    return Number.isFinite(time) && Date.now() - time <= 7 * 86400000;
  };
  const card = video => `<a class="market-video-card" href="${esc(video.watchUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在 YouTube 開啟 ${esc(video.title)}">
    <span class="market-video-thumb"><img src="${esc(video.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"><i aria-hidden="true">▶</i></span>
    <span class="market-video-body"><small>${esc(video.channelName || "財經頻道")}</small><strong>${esc(video.title)}</strong><time datetime="${esc(video.publishedAt)}">${formatDate(video.publishedAt)}</time></span>
  </a>`;

  function renderMacroNewsSection(data) {
    const maxAge = Math.max(1, Number(data.windowDays) || 5) * 86400000;
    const sections = (data.sections || []).map(section => section.id === "cnbc-top" ? {
      ...section,
      items: (section.items || []).filter(item => {
        const time = Date.parse(item.capturedAt || item.publishedAt || item.captureDate);
        return Number.isFinite(time) && Date.now() - time <= maxAge;
      })
    } : section).filter(section => section.id !== "cnbc-top" || section.items.length);
    if (!sections.length) return "";
    return `<div class="market-media-news-list">${sections.map(section => {
      const items = (section.items || []).slice(0, 12).map(item => {
        const title = item.titleZh || item.title || item.titleEn || "未命名消息";
        const detail = item.summaryZh || item.summaryEn || "點擊前往原始來源";
        return `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(section.name || "財經新聞")}・${esc(item.source || item.captureDate || formatDate(item.publishedAt))}</span><strong>${esc(title)}</strong><small>${esc(detail)}</small></a>`;
      }).join("");
      return `<details class="market-media-news"${section.id === "cnbc-top" ? " open" : ""}><summary><span>${esc(section.name || "財經新聞")}</span><span class="market-video-channel-count">${section.items.length} 則</span></summary><div class="market-media-news-body">${items || '<div class="market-video-empty">目前沒有可顯示的新聞。</div>'}</div></details>`;
    }).join("")}</div>`;
  }

  async function renderVideos(target) {
    if (!target || target.dataset.loaded === "true") return;
    target.dataset.loaded = "loading";
    try {
      const response = await fetch("financial_videos.json", { cache:"no-cache" });
      if (!response.ok) throw new Error("財經影音資料暫時無法載入");
      const data = await response.json();
      const newsResponse = await fetch("macro_news.json", { cache:"no-cache" });
      const news = newsResponse.ok ? await newsResponse.json() : { sections:[] };
      const channels = (data.channels || []).slice().sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
      const channelSections = channels.map(channel => {
        const videos = (channel.videos || []).filter(video => isFresh(video.publishedAt)).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        return `<details class="market-video-channel"${channel.pinned ? " open" : ""}><summary><span class="market-video-channel-title"><span><small>${channel.pinned ? "Pinned morning program" : "Curated channel"}</small><strong>${esc(channel.name)}</strong></span></span><span class="market-video-channel-count">${videos.length} 部・展開</span></summary><div class="market-video-channel-body"><div class="market-video-channel-actions"><a href="${esc(channel.url)}" target="_blank" rel="noopener noreferrer">前往 YouTube 頻道 ↗</a></div>${videos.length ? `<div class="market-video-grid">${videos.map(video => card({ ...video, channelName: video.channelName || channel.name })).join("")}</div>` : '<div class="market-video-empty">本週暫無新片。</div>'}</div></details>`;
      }).join("");
      target.innerHTML = `<p class="market-media-updated">影片資料更新：${esc(formatDateTime(data.updatedAt))}・保留最近七天公開內容</p>${renderMacroNewsSection(news)}${channelSections || '<div class="market-video-empty">本週暫無新的財經影音。</div>'}<p class="market-source">影片由 YouTube 官方頻道提供，點擊後前往原始來源；本站不下載或重新託管影片。</p>`;
      target.dataset.loaded = "true";
    } catch (error) {
      target.dataset.loaded = "error";
      target.innerHTML = `<div class="market-video-empty">${esc(error.message || "財經影音暫時無法取得，請稍後再試。")}</div>`;
    }
  }

  window.MarketMessages = { renderVideos };
})();
