// 全站會員審核閘門：登入後仍須人工核准，一般會員與全功能會員依資料庫權限分級。
(function () {
  let overlay;
  let lastState = "";

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "memberAccessGate";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "display:none;position:fixed;inset:0;z-index:9999;background:rgba(18,25,32,.82);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:20px;";
    overlay.innerHTML =
      '<div style="width:min(440px,100%);padding:28px;border:1px solid rgba(255,255,255,.18);border-radius:18px;background:var(--card,#fff);color:var(--text,#1c2430);box-shadow:0 18px 60px rgba(0,0,0,.25);text-align:center;">' +
      '<div style="font-size:30px;margin-bottom:10px;">🔐</div>' +
      '<h2 id="memberGateTitle" style="margin:0 0 10px;font-size:21px;">會員審核</h2>' +
      '<p id="memberGateMessage" style="margin:0 auto 18px;line-height:1.7;color:var(--muted,#68717c);font-size:14px;"></p>' +
      '<button id="memberGateAction" style="padding:10px 18px;border:0;border-radius:9px;background:var(--accent,#3b5bdb);color:#fff;cursor:pointer;font-size:14px;"></button>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function show(kind, title, message, actionText, action) {
    const key = [kind, title, message].join("|");
    if (key !== lastState) {
      const m = ensureOverlay();
      m.querySelector("#memberGateTitle").textContent = title;
      m.querySelector("#memberGateMessage").textContent = message;
      const button = m.querySelector("#memberGateAction");
      button.textContent = actionText;
      button.onclick = action;
      lastState = key;
    }
    ensureOverlay().style.display = "flex";
  }

  function hide() {
    lastState = "approved";
    if (overlay) overlay.style.display = "none";
  }

  function render() {
    const auth = window.ETFAuth;
    if (!auth || !auth.isConfigured()) return;
    const user = auth.user();
    const access = auth.memberAccess();
    if (!user) {
      return show("login", "請先登入會員", "本網站目前僅開放完成人工審核的會員使用。新會員註冊後，管理員會收到通知並審核。", "登入／註冊", auth.openLogin);
    }
    if (!access || access.accessLevel === "pending") {
      return show("pending", "申請已收到，等待人工審核", "你的帳號已完成註冊，目前還不能使用網站功能。管理員審核後會開通一般功能或全功能。", "重新整理狀態", auth.refreshMemberAccess);
    }
    if (access.accessLevel === "rejected") {
      return show("rejected", "目前未開通會員權限", "這個帳號目前沒有網站使用權限；若你認為有誤，請直接聯絡網站管理員。", "重新登入", () => window.location.reload());
    }
    hide();
  }

  function boot() {
    ensureAuthDependencies();
    render();
    document.addEventListener("etfauth:change", render);
    let attempts = 0;
    const timer = setInterval(() => {
      render();
      if (window.ETFAuth || ++attempts > 50) clearInterval(timer);
    }, 200);
  }

  function ensureAuthDependencies() {
    if (window.ETFAuth) return;
    const hasConfigTag = [...document.scripts].some((script) => /(?:^|\/)config\.js(?:\?|$)/.test(script.src));
    const hasAuthTag = [...document.scripts].some((script) => /(?:^|\/)auth\.js(?:\?|$)/.test(script.src));
    const loadAuth = () => {
      if (window.ETFAuth || hasAuthTag) return;
      const script = document.createElement("script");
      script.type = "module";
      script.src = "auth.js?v=20260926-member-access";
      document.body.appendChild(script);
    };
    if (!window.SUPABASE_URL && !hasConfigTag) {
      const config = document.createElement("script");
      config.src = "config.js?v=20260926-member-access";
      config.onload = loadAuth;
      document.body.appendChild(config);
    } else {
      loadAuth();
    }
  }

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
