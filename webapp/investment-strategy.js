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

  function gate(title, message, action, actionLabel = "重試") {
    $("strategyReport").hidden = true;
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
