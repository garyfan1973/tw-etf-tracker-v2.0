// 會員功能（Email + 密碼）與個人關注清單，走 Supabase。
// 純前端；未設定 config.js 時整組停用，不影響其他功能。
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

(function () {
  const URL_ = window.SUPABASE_URL;
  const KEY_ = window.SUPABASE_ANON_KEY;
  const configured = !!(URL_ && KEY_ && !/YOUR_/.test(URL_) && !/YOUR_/.test(KEY_));
  const sb = configured ? createClient(URL_, KEY_) : null;

  const state = { user: null, watch: new Set() };

  // 對外 API：給各頁面（index / dividends）讀取個人關注清單用
  window.ETFWatch = {
    isConfigured: () => configured,
    user: () => state.user,
    has: (code) => state.watch.has(code),
    list: () => [...state.watch],
    toggle: toggleWatch,
  };

  function emit() {
    document.dispatchEvent(new CustomEvent("etfwatch:change"));
  }

  async function loadWatch() {
    state.watch = new Set();
    if (sb && state.user) {
      const { data, error } = await sb.from("watchlist").select("etf_code");
      if (!error) (data || []).forEach((r) => state.watch.add(r.etf_code));
    }
    emit();
  }

  async function toggleWatch(code) {
    if (!sb || !state.user) return;
    if (state.watch.has(code)) {
      state.watch.delete(code);
      emit();
      await sb.from("watchlist").delete().eq("user_id", state.user.id).eq("etf_code", code);
    } else {
      state.watch.add(code);
      emit();
      await sb.from("watchlist").insert({ user_id: state.user.id, etf_code: code });
    }
  }

  // ---- 登入 / 註冊 Modal ----
  function ensureModal() {
    if (document.getElementById("authModal")) return;
    const m = document.createElement("div");
    m.id = "authModal";
    m.style.cssText =
      "display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;align-items:center;justify-content:center;";
    m.innerHTML =
      '<div style="background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:14px;padding:20px;width:320px;max-width:92vw;">' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:12px;">會員登入 / 註冊</div>' +
      '<input id="authEmail" type="email" autocomplete="email" placeholder="Email" style="width:100%;margin-bottom:8px;padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);">' +
      '<input id="authPass" type="password" autocomplete="current-password" placeholder="密碼（至少 6 碼）" style="width:100%;margin-bottom:10px;padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);">' +
      '<div id="authMsg" style="font-size:12px;color:var(--muted);min-height:16px;margin-bottom:8px;"></div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button id="authLogin" style="flex:1;padding:9px;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;">登入</button>' +
      '<button id="authSignup" style="flex:1;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;">註冊</button>' +
      "</div>" +
      '<button id="authClose" style="margin-top:10px;width:100%;padding:6px;border:none;background:none;color:var(--muted);cursor:pointer;font-size:13px;">關閉</button>' +
      "</div>";
    document.body.appendChild(m);

    const msg = m.querySelector("#authMsg");
    const email = m.querySelector("#authEmail");
    const pass = m.querySelector("#authPass");
    const close = () => (m.style.display = "none");
    m.querySelector("#authClose").onclick = close;
    m.onclick = (e) => { if (e.target === m) close(); };

    m.querySelector("#authLogin").onclick = async () => {
      msg.style.color = "var(--muted)"; msg.textContent = "登入中…";
      const { error } = await sb.auth.signInWithPassword({
        email: email.value.trim(), password: pass.value,
      });
      if (error) { msg.style.color = "var(--up)"; msg.textContent = "登入失敗：" + error.message; }
      else close();
    };
    m.querySelector("#authSignup").onclick = async () => {
      msg.style.color = "var(--muted)"; msg.textContent = "註冊中…";
      const { data, error } = await sb.auth.signUp({
        email: email.value.trim(), password: pass.value,
      });
      if (error) { msg.style.color = "var(--up)"; msg.textContent = "註冊失敗：" + error.message; }
      else if (data.session) close();  // 未開驗證信 → 直接登入
      else { msg.style.color = "var(--down)"; msg.textContent = "註冊成功，請至信箱收驗證信後再登入。"; }
    };
  }

  function openModal() {
    ensureModal();
    document.getElementById("authModal").style.display = "flex";
  }

  // ---- nav 內的登入狀態 ----
  function renderAuthBox() {
    const box = document.getElementById("authBox");
    if (!box) return;
    box.innerHTML = "";
    if (!configured) return;
    if (state.user) {
      const span = document.createElement("span");
      span.style.cssText = "font-size:13px;color:var(--muted);margin-right:4px;";
      span.textContent = state.user.email;
      const btn = document.createElement("button");
      btn.textContent = "登出";
      btn.style.cssText =
        "font-size:13px;padding:5px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);cursor:pointer;";
      btn.onclick = () => sb.auth.signOut();
      box.appendChild(span);
      box.appendChild(btn);
    } else {
      const btn = document.createElement("button");
      btn.textContent = "登入 / 註冊";
      btn.style.cssText =
        "font-size:13px;padding:5px 10px;border:1px solid var(--accent);border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;";
      btn.onclick = openModal;
      box.appendChild(btn);
    }
  }

  // ---- 我的關注 ETF 面板（index 專用，容器 id=memberPanel）----
  function renderMemberPanel() {
    const panel = document.getElementById("memberPanel");
    if (!panel) return;
    if (!configured) { panel.style.display = "none"; return; }
    panel.style.display = "block";
    if (!state.user) {
      panel.innerHTML =
        '<div style="color:var(--muted);font-size:13px;">登入後可建立個人關注清單，並用上方「⭐ 只看我的」快速篩選。</div>';
      return;
    }
    const etfs = (window.DATA && window.DATA.etfs) || {};
    let html =
      '<div style="font-size:13px;color:var(--muted);margin-bottom:8px;">勾選要關注的 ETF（點一下切換）：</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    Object.keys(etfs).forEach((id) => {
      const on = state.watch.has(id);
      html +=
        '<label class="watch-chip' + (on ? " on" : "") + '" data-code="' + id + '">' +
        (on ? "★ " : "") + id + " " + etfs[id].name + "</label>";
    });
    html += "</div>";
    panel.innerHTML = html;
    panel.querySelectorAll(".watch-chip").forEach((el) => {
      el.onclick = () => toggleWatch(el.dataset.code);
    });
  }

  function renderAll() { renderAuthBox(); renderMemberPanel(); }
  document.addEventListener("etfwatch:change", renderMemberPanel);

  function boot() {
    // 未設定 Supabase 時，連「只看我的」也隱藏，畫面維持原樣
    if (!configured) {
      const om = document.getElementById("onlyMine");
      if (om && om.closest("div")) om.closest("div").style.display = "none";
    }
    renderAll();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      state.user = data.session ? data.session.user : null;
      renderAll();
      loadWatch();
    });
    sb.auth.onAuthStateChange((_event, session) => {
      state.user = session ? session.user : null;
      renderAll();
      loadWatch();
    });
  }

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
