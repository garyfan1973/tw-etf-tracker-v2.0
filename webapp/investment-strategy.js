(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const symbol = String(params.get("symbol") || "").trim().toUpperCase();
  const market = String(params.get("market") || (/^\d/.test(symbol) ? "TW" : "US")).trim().toUpperCase();
  const valid = market === "TW" ? /^\d{4,6}$/.test(symbol) : market === "US" && /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol);
  const cacheKey = `investment-strategy:${market}:${symbol}`;
  const pendingKey = `${cacheKey}:pending`;
  let started = false;
  let busy = false;
  let currentStrategyReport = null;
  let currentStrategyMeta = null;
  let exportBusy = false;

  function gate(title, message, action, actionLabel = "重試") {
    $("strategyReport").hidden = true;
    $("strategyExportTools").hidden = true;
    $("strategyGate").hidden = false;
    $("strategyGate").classList.toggle("needs-action", Boolean(action));
    $("strategyGate").classList.toggle("is-error", title === "這次沒有順利完成");
    $("gateTitle").textContent = title;
    $("gateMessage").textContent = message;
    $("gateAction").hidden = !action;
    $("gateAction").textContent = actionLabel;
    $("gateAction").onclick = action || null;
  }

  function safeLink(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
    } catch (_) { return ""; }
  }

  function safeFilePart(value) {
    return String(value || "strategy").normalize("NFKC")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "strategy";
  }

  function reportDate(value) {
    const text = String(value || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
  }

  function linkCitations(root, sources) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((textNode) => {
      if (textNode.parentElement?.closest("a, code, pre") || !/\[\d+\]/.test(textNode.nodeValue)) return;
      const parts = textNode.nodeValue.split(/(\[\d+\])/g);
      const fragment = document.createDocumentFragment();
      parts.forEach((part) => {
        const match = /^\[(\d+)\]$/.exec(part);
        const source = match && sources[Number(match[1]) - 1];
        const href = source && safeLink(source.url);
        if (href) {
          const link = document.createElement("a");
          link.className = "strategy-citation";
          link.href = href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.title = source.title;
          link.textContent = part;
          fragment.append(link);
        } else fragment.append(document.createTextNode(part));
      });
      textNode.replaceWith(fragment);
    });
  }

  function render(report) {
    const sources = (Array.isArray(report.sources) ? report.sources : []).filter((item) => safeLink(item.url));
    $("stockName").textContent = report.companyName ? ` ${report.companyName}` : "";
    $("verdictTitle").textContent = report.headline || "投資策略建議";
    $("verdictTakeaway").textContent = report.takeaway || "";
    $("asOfBadge").textContent = report.asOf ? `資料基準：${report.asOf}` : "依最新可得資料";
    $("reportDate").textContent = report.asOf ? `資料基準 ${report.asOf}` : "依最新可得資料分析";
    currentStrategyReport = report;
    currentStrategyMeta = { symbol, assetName: report.companyName || $("stockName").textContent.trim() || symbol,
      date: reportDate(report.asOf) };

    const article = $("strategyArticle");
    if (window.marked?.parse && window.DOMPurify?.sanitize) {
      const raw = window.marked.parse(report.body || "", { breaks: false, gfm: true });
      article.innerHTML = window.DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "strong", "em", "blockquote", "hr", "br", "code", "pre", "a"],
        ALLOWED_ATTR: ["href", "title"],
      });
    } else {
      article.textContent = report.body || "";
      article.style.whiteSpace = "pre-wrap";
    }
    article.querySelectorAll("a[href]").forEach((link) => {
      const href = safeLink(link.href);
      if (!href) link.replaceWith(document.createTextNode(link.textContent));
      else { link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; }
    });
    linkCitations(article, sources);
    linkCitations($("verdictTakeaway"), sources);

    const list = $("strategySources");
    list.replaceChildren();
    sources.forEach((source) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = safeLink(source.url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.title || new URL(link.href).hostname;
      const date = document.createElement("small");
      date.textContent = source.date || new URL(link.href).hostname;
      item.append(link, date);
      list.append(item);
    });
    if (!sources.length) {
      const item = document.createElement("li");
      item.textContent = "本次回覆未附可開啟的資料連結，請重新分析。";
      list.append(item);
    }
    $("strategyGate").hidden = true;
    $("strategyReport").hidden = false;
    $("strategyExportTools").hidden = false;
  }

  function pdfExportLayout(root, width) {
    const rootRect = root.getBoundingClientRect();
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { top: (rect.top - rootRect.top) * width / rootRect.width,
        bottom: (rect.bottom - rootRect.top) * width / rootRect.width,
        left: (rect.left - rootRect.left) * width / rootRect.width,
        width: rect.width * width / rootRect.width };
    };
    const blocks = [...root.querySelectorAll("h1,h2,h3,h4,p,li,table,blockquote,.strategy-verdict,.strategy-article,.strategy-aside")]
      .map((element) => box(element));
    const links = [...root.querySelectorAll("a[href]")].map((element) => ({ ...box(element), url: element.href }))
      .filter((link) => safeLink(link.url));
    return { blocks, links };
  }

  function pdfSafeCut(offset, limit, layout) {
    let cut = limit;
    const room = Math.max(50, (limit - offset) * .2);
    for (const block of layout.blocks) {
      if (block.top < cut && block.bottom > cut && block.top > offset + room) cut = Math.floor(block.top - 5);
    }
    return Math.max(offset + 1, cut);
  }

  function buildStrategyPdfFrame() {
    if (!currentStrategyReport || !currentStrategyMeta) throw new Error("目前沒有可匯出的策略建議");
    const frame = document.createElement("div");
    frame.className = "strategy-pdf-export";
    const head = document.createElement("header");
    head.className = "strategy-pdf-head";
    head.innerHTML = `<div><span>AI INVESTMENT STRATEGY</span><h1>${safeFilePart(currentStrategyMeta.symbol)} ${safeFilePart(currentStrategyMeta.assetName)}</h1></div><small>${currentStrategyMeta.date} · 投資策略建議</small>`;
    const verdict = $("strategyReport .strategy-verdict").cloneNode(true);
    verdict.querySelectorAll("button").forEach((button) => button.remove());
    const layout = $("strategyReport .strategy-layout").cloneNode(true);
    layout.querySelectorAll("button").forEach((button) => button.remove());
    const foot = document.createElement("footer");
    foot.className = "strategy-pdf-foot";
    foot.textContent = "本報告依公開資料整理，僅供研究與交易規劃參考，不構成投資建議或獲利保證。";
    frame.append(head, verdict, layout, foot);
    document.body.append(frame);
    return frame;
  }

  async function createStrategyPdf({ download = false } = {}) {
    if (exportBusy) throw new Error("PDF 正在產生中，請稍候");
    if (typeof window.html2canvas !== "function" || !window.jspdf?.jsPDF)
      throw new Error("PDF 元件尚未載入，請重新整理後再試");
    exportBusy = true;
    const buttons = [$("exportStrategyPdf"), $("emailStrategyPdf")];
    buttons.forEach((button) => { button.disabled = true; });
    let frame;
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      frame = buildStrategyPdfFrame();
      const canvas = await window.html2canvas(frame, { backgroundColor: "#fff", scale: 2, logging: false, useCORS: true, imageTimeout: 0 });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth(), pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24, drawWidth = pageWidth - margin * 2, drawHeight = pageHeight - margin * 2;
      const pixelsPerPage = Math.max(1, Math.floor(canvas.width * drawHeight / drawWidth));
      const layout = pdfExportLayout(frame, canvas.width);
      const rootRect = frame.getBoundingClientRect();
      const lastRect = frame.lastElementChild?.getBoundingClientRect();
      const contentHeight = lastRect ? Math.min(canvas.height, Math.ceil((lastRect.bottom - rootRect.top + 8) * canvas.width / rootRect.width)) : canvas.height;
      let offset = 0, page = 0;
      while (offset < contentHeight) {
        const limit = Math.min(offset + pixelsPerPage, contentHeight);
        const end = limit === contentHeight ? limit : pdfSafeCut(offset, limit, layout);
        const sliceHeight = end - offset, slice = document.createElement("canvas");
        slice.width = canvas.width; slice.height = sliceHeight;
        const context = slice.getContext("2d", { alpha: false });
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
        context.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", .92), "JPEG", margin, margin, drawWidth, drawWidth * sliceHeight / canvas.width, undefined, "MEDIUM");
        const pointsPerPixel = drawWidth / canvas.width;
        layout.links.forEach((link) => {
          const top = Math.max(link.top, offset), bottom = Math.min(link.bottom, end);
          if (bottom > top) pdf.link(margin + link.left * pointsPerPixel, margin + (top - offset) * pointsPerPixel,
            link.width * pointsPerPixel, (bottom - top) * pointsPerPixel, { url: link.url });
        });
        offset = end; page += 1;
      }
      const blob = pdf.output("blob");
      if (download) {
        const url = URL.createObjectURL(blob), link = document.createElement("a");
        link.href = url;
        link.download = `${safeFilePart(currentStrategyMeta.symbol)}_${safeFilePart(currentStrategyMeta.assetName)}_${currentStrategyMeta.date}_投資策略建議.pdf`;
        document.body.append(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      }
      return blob;
    } finally {
      frame?.remove(); exportBusy = false;
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(new Error("PDF 附件讀取失敗"));
      reader.readAsDataURL(blob);
    });
  }

  function strategySubject() {
    if (!currentStrategyMeta) return "";
    return `${safeFilePart(currentStrategyMeta.symbol)}_${safeFilePart(currentStrategyMeta.assetName)}_${currentStrategyMeta.date}_投資策略建議`;
  }

  function openEmailModal() {
    if (!currentStrategyMeta) return;
    $("strategyEmailSubject").textContent = strategySubject();
    $("strategyEmailStatus").textContent = "";
    $("strategyEmailModal").hidden = false;
    document.body.classList.add("ai-email-open");
    $("strategyEmailAddress").focus({ preventScroll: true });
  }

  function closeEmailModal() {
    if ($("strategyEmailSend").disabled) return;
    $("strategyEmailModal").hidden = true;
    document.body.classList.remove("ai-email-open");
  }

  async function sendStrategyEmail() {
    const input = $("strategyEmailAddress"), status = $("strategyEmailStatus"), send = $("strategyEmailSend");
    const email = input.value.trim();
    status.className = "ai-email-status";
    if (!input.checkValidity() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      status.className = "ai-email-status error"; status.textContent = "請輸入有效的 Email address。"; input.focus(); return;
    }
    const client = window.ETFAuth?.client();
    const { data: { session } = {} } = client ? await client.auth.getSession() : {};
    if (!session) { closeEmailModal(); window.ETFAuth?.openLogin(); return; }
    send.disabled = true; $("strategyEmailCancel").disabled = true; status.textContent = "正在產生 PDF 附件…";
    try {
      const pdf = await createStrategyPdf();
      if (pdf.size > 3_500_000) throw new Error("PDF 超過寄送大小限制，請改用匯出 PDF 下載");
      status.textContent = "正在透過 Gmail 寄送…";
      const response = await fetch("/api/investment-strategy-email", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email, symbol: currentStrategyMeta.symbol, assetName: currentStrategyMeta.assetName,
          date: currentStrategyMeta.date, pdfBase64: await blobToBase64(pdf) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Email 暫時無法寄出");
      status.className = "ai-email-status success"; status.textContent = `已寄送至 ${email}`;
      window.setTimeout(() => { send.disabled = false; $("strategyEmailCancel").disabled = false; closeEmailModal(); }, 1100);
    } catch (error) {
      status.className = "ai-email-status error"; status.textContent = error.message || "Email 暫時無法寄出";
      send.disabled = false; $("strategyEmailCancel").disabled = false;
    }
  }

  async function waitForJob(job, session, startedAt) {
    let connectionFailures = 0;
    while (Date.now() - startedAt < 8.5 * 60 * 1000) {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      try {
        const response = await fetch(`/api/investment-strategy?job=${encodeURIComponent(job)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
          if (payload.retryable) {
            connectionFailures += 1;
            if (connectionFailures >= 3)
              $("gateMessage").textContent = "讀取進度時連線不穩，仍在等待同一份分析，不會重新開始。";
            continue;
          }
          throw new Error(payload.error || "分析未能完成，請重新分析");
        }
        connectionFailures = 0;
        if (payload.status === "completed" && payload.report) return payload.report;
        if (payload.status !== "working") throw new Error("分析未能完成，請重新分析");
        if (Date.now() - startedAt > 3 * 60 * 1000)
          $("gateMessage").textContent = "仍在整理近期資料與投資情境，分析會自動顯示；請保持此頁開啟。";
      } catch (error) {
        if (error instanceof TypeError) {
          connectionFailures += 1;
          if (connectionFailures >= 3)
            $("gateMessage").textContent = "連線暫時不穩，仍在等待同一份分析，不會重新開始。";
          continue;
        }
        throw error;
      }
    }
    throw new Error("這份分析等待太久，請重新分析。若持續發生，請稍後再試。");
  }

  async function run(pending = null) {
    if (busy || !valid) return;
    const client = window.ETFAuth?.client();
    if (!client) return gate("會員服務未連線", "請稍後重新開啟此頁。", () => location.reload());
    const { data: { session } } = await client.auth.getSession();
    if (!session) return gate("登入後開始分析", "登入即可取得這檔股票的完整投資策略建議。", () => window.ETFAuth.openLogin(), "登入 / 註冊");
    busy = true;
    $("rerunStrategy").disabled = true;
    gate("正在寫給你的策略", "正在閱讀近期價格、公司營運與市場看法。分析會自動顯示，通常需要 1～3 分鐘。", null);
    try {
      let report;
      if (pending) {
        report = await waitForJob(pending.job, session, pending.startedAt);
      } else {
        const response = await fetch("/api/investment-strategy", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ symbol, market }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error || "分析暫時沒有完成，請重試");
        if (payload.status === "completed" && payload.report) report = payload.report;
        else if (payload.status === "working" && payload.job) {
          pending = { job: payload.job, userId: session.user.id, startedAt: Date.now() };
          sessionStorage.setItem(pendingKey, JSON.stringify(pending));
          report = await waitForJob(pending.job, session, pending.startedAt);
        } else throw new Error("分析未能啟動，請重新分析");
      }
      sessionStorage.removeItem(pendingKey);
      sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), userId: session.user.id, report }));
      render(report);
    } catch (error) {
      sessionStorage.removeItem(pendingKey);
      gate("這次沒有順利完成", error.message || "請稍後重試。", () => run());
    } finally {
      busy = false;
      $("rerunStrategy").disabled = false;
    }
  }

  async function onAuthReady() {
    if (!valid) return;
    if (!window.ETFAuth) return;
    if (started) return;
    started = true;
    const client = window.ETFAuth.client();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return gate("登入後開始分析", "登入即可取得這檔股票的完整投資策略建議。", () => window.ETFAuth.openLogin(), "登入 / 註冊");
    try {
      const saved = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (saved?.report && saved.userId === session.user.id && Date.now() - saved.savedAt < 30 * 60 * 1000) {
        render(saved.report);
        return;
      }
    } catch (_) { /* 舊的暫存結果無法讀取時重新產生 */ }
    try {
      const pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
      if (pending?.job && pending.userId === session.user.id && Date.now() - pending.startedAt < 8.5 * 60 * 1000) {
        run(pending);
        return;
      }
    } catch (_) { /* 暫存中的工作無法讀取時重新開始 */ }
    sessionStorage.removeItem(pendingKey);
    run();
  }

  function boot() {
    $("stockSymbol").textContent = symbol || "—";
    const name = String(params.get("name") || "").trim().slice(0, 60);
    if (name) $("stockName").textContent = ` ${name}`;
    if (!valid) return gate("請先選擇股票", "從個股資訊搜尋並選擇一檔台股或美股，再點「投資策略建議」。", () => { location.href = "tracker.html?view=overview"; });
    $("rerunStrategy").addEventListener("click", () => { sessionStorage.removeItem(cacheKey); sessionStorage.removeItem(pendingKey); run(); });
    $("exportStrategyPdf").addEventListener("click", async () => {
      const button = $("exportStrategyPdf");
      try { button.disabled = true; await createStrategyPdf({ download: true }); }
      catch (error) { $("asOfBadge").textContent = error.message || "PDF 匯出失敗"; }
      finally { button.disabled = false; }
    });
    $("emailStrategyPdf").addEventListener("click", openEmailModal);
    $("strategyEmailClose").addEventListener("click", closeEmailModal);
    $("strategyEmailCancel").addEventListener("click", closeEmailModal);
    $("strategyEmailSend").addEventListener("click", sendStrategyEmail);
    $("strategyEmailAddress").addEventListener("keydown", (event) => { if (event.key === "Enter") sendStrategyEmail(); });
    $("strategyEmailModal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeEmailModal(); });
    document.addEventListener("etfauth:change", () => {
      if (!started) onAuthReady();
      else if (!busy && !window.ETFAuth?.user())
        gate("登入後開始分析", "登入即可取得這檔股票的完整投資策略建議。", () => window.ETFAuth.openLogin(), "登入 / 註冊");
      else if (!busy && window.ETFAuth?.user() && $("gateTitle").textContent === "登入後開始分析") run();
    });
    const check = window.setInterval(() => {
      if (window.ETFAuth) { window.clearInterval(check); onAuthReady(); }
    }, 150);
    window.setTimeout(() => window.clearInterval(check), 12000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
