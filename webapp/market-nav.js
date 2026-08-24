(function () {
  const items = [
    ["tracker.html?view=overview", "個股資訊", "stocks"],
    ["market-index.html", "指數資訊", "indices"],
    ["forex.html", "匯市資訊", "forex"],
    ["bonds.html", "債市資訊", "bonds"],
    ["fed-policy.html", "聯準會政策", "fed"],
    ["videos.html", "財經影音", "videos"],
    ["chart-analysis.html", "AI 線圖分析", "ai"],
  ];

  function currentSection() {
    const page = location.pathname.split("/").pop() || "index.html";
    if (page === "market-index.html") return "indices";
    if (page === "forex.html") return "forex";
    if (page === "bonds.html") return "bonds";
    if (page === "fed-policy.html") return "fed";
    if (page === "videos.html") return "videos";
    if (page === "chart-analysis.html") return "ai";
    if (page === "tracker.html" && new URLSearchParams(location.search).has("view")) return "stocks";
    return "";
  }

  function installStyles() {
    if (document.getElementById("marketMenuStyles")) return;
    const style = document.createElement("style");
    style.id = "marketMenuStyles";
    style.textContent = `
      .market-nav-enabled{overflow:visible!important}
      .market-menu{position:relative;display:inline-flex;flex:0 0 auto;z-index:70}
      .market-menu-trigger{display:inline-flex!important;align-items:center;gap:6px;white-space:nowrap;cursor:pointer}
      .market-menu-trigger::after{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);transition:transform .18s ease}
      .market-menu.open .market-menu-trigger::after{transform:rotate(225deg) translate(-1px,-1px)}
      .market-menu.active .market-menu-trigger{color:#fff!important;background:var(--accent)!important;border-color:var(--accent)!important}
      .market-menu-panel{position:absolute;left:0;top:calc(100% + 8px);display:none;min-width:176px;padding:7px;background:var(--card,#fff);border:1px solid var(--border,#e3e7ec);border-radius:12px;box-shadow:0 16px 36px rgba(15,23,42,.18);z-index:80}
      .market-menu.open .market-menu-panel{display:grid;gap:3px;animation:marketMenuIn .14s ease-out}
      .market-menu-panel a{display:flex!important;align-items:center!important;width:100%;padding:9px 11px!important;border:0!important;border-radius:8px!important;background:transparent!important;color:var(--muted,#6b7684)!important;font-size:13px!important;text-decoration:none!important;white-space:nowrap}
      .market-menu-panel a:hover,.market-menu-panel a:focus-visible{background:color-mix(in srgb,var(--accent,#3b5bdb) 10%,transparent)!important;color:var(--text,#1c2430)!important;outline:none}
      .market-menu-panel a.active{background:var(--accent,#3b5bdb)!important;color:#fff!important;font-weight:700}
      @keyframes marketMenuIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
      @media(max-width:760px){.market-nav-enabled{flex-wrap:wrap!important}.market-menu-panel{position:fixed;left:14px;right:14px;top:auto;min-width:0;margin-top:42px}}
    `;
    document.head.appendChild(style);
  }

  function enhance(anchor) {
    if (anchor.closest(".market-menu")) return;
    const section = currentSection();
    const wrapper = document.createElement("span");
    wrapper.className = "market-menu" + (section ? " active" : "");
    const panel = document.createElement("span");
    panel.className = "market-menu-panel";
    panel.id = "marketMenuPanel";
    panel.setAttribute("role", "menu");
    panel.innerHTML = items.map(([href, label, key]) => `<a href="${href}" role="menuitem"${key === "ai" ? ' data-chart-analysis-nav hidden' : ""}${key === section ? ' class="active" aria-current="page"' : ""}>${label}</a>`).join("");
    anchor.parentNode.insertBefore(wrapper, anchor);
    wrapper.append(anchor, panel);
    anchor.classList.add("market-menu-trigger");
    anchor.setAttribute("role", "button");
    anchor.setAttribute("aria-haspopup", "menu");
    anchor.setAttribute("aria-controls", panel.id);
    anchor.setAttribute("aria-expanded", "false");
    anchor.removeAttribute("href");

    const setOpen = open => {
      wrapper.classList.toggle("open", open);
      anchor.setAttribute("aria-expanded", String(open));
    };
    anchor.addEventListener("click", event => { event.preventDefault(); setOpen(!wrapper.classList.contains("open")); });
    anchor.addEventListener("keydown", event => {
      if (["Enter", " ", "ArrowDown"].includes(event.key)) {
        event.preventDefault(); setOpen(true); panel.querySelector("a")?.focus();
      }
    });
    wrapper.addEventListener("keydown", event => { if (event.key === "Escape") { setOpen(false); anchor.focus(); } });
    document.addEventListener("click", event => { if (!wrapper.contains(event.target)) setOpen(false); });
  }

  function init() {
    installStyles();
    document.querySelectorAll('nav a[href*="tracker.html?view=overview"]').forEach(anchor => {
      anchor.closest("nav")?.classList.add("market-nav-enabled");
      enhance(anchor);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
