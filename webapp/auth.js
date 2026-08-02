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
  // 給「我的持股」頁共用 Supabase client 與登入狀態
  window.ETFAuth = {
    isConfigured: () => configured,
    client: () => sb,
    user: () => state.user,
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
    hydrateMissing();  // 補抓還沒進 data.js 的關注代號
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

  async function addWatch(code) {
    code = (code || "").trim().toUpperCase();
    if (!sb || !state.user || !code || state.watch.has(code)) return;
    state.watch.add(code);
    emit();
    await sb.from("watchlist").insert({ user_id: state.user.id, etf_code: code });
  }

  // 即時查詢單一 ETF（後端 /api/etf）
  async function apiFetchEtf(code) {
    try {
      const res = await fetch("/api/etf?code=" + encodeURIComponent(code));
      return await res.json();
    } catch (e) {
      return { ok: false, error: "查詢失敗（網路或伺服器）" };
    }
  }

  // 把即時查到的資料併入前端記憶體，讓現有畫面立即顯示
  function mergeEtf(code, data) {
    if (!window.DATA || !window.DATA.etfs) return;
    window.DATA.etfs[code] = {
      name: data.name || code,
      snapshots: data.snapshots || [],
      dividends: data.dividends || [],
    };
  }

  // 新增代號：先即時查驗，查無就報錯不加入，查到就併入＋加入清單＋通知頁面顯示
  async function addWithLookup(code, msg) {
    code = (code || "").trim().toUpperCase();
    if (state.watch.has(code)) {
      if (msg) { msg.style.color = "var(--muted)"; msg.textContent = "已在關注清單"; }
      return;
    }
    const known = window.DATA && window.DATA.etfs && window.DATA.etfs[code];
    if (msg) { msg.style.color = "var(--muted)"; msg.textContent = "查詢中…"; }
    const data = known ? { ok: true } : await apiFetchEtf(code);
    if (!data.ok) {
      if (msg) { msg.style.color = "var(--up)"; msg.textContent = data.error || "查無此 ETF"; }
      return;
    }
    if (!known) mergeEtf(code, data);
    if (msg) msg.textContent = "";
    await addWatch(code);
    document.dispatchEvent(new CustomEvent("etf-added", { detail: { code } }));
  }

  // 確保某代號的 ETF 資料已在記憶體（沒有就即時抓後併入），供各頁共用
  async function ensureEtf(code) {
    const etfs = window.DATA && window.DATA.etfs;
    if (!etfs) return null;
    if (etfs[code]) return etfs[code];
    const r = await apiFetchEtf(code);
    if (r && r.ok) { mergeEtf(code, r); emit(); return etfs[code]; }
    return null;
  }
  window.ETFData = { ensure: ensureEtf, fetch: apiFetchEtf };

  // 載入時補抓「已關注但還沒進 data.js」的代號，讓重整後也立即看得到
  async function hydrateMissing() {
    for (const code of [...state.watch]) {
      await ensureEtf(code);
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
    const watchOpen = document.getElementById("watchOpen");
    if (watchOpen) {
      watchOpen.style.display = configured ? "inline-block" : "none";
      watchOpen.onclick = () => {
        const modal = document.getElementById("watchModal");
        if (modal) modal.style.display = "flex";
      };
    }
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
        '<div style="color:var(--muted);font-size:13px;">登入後可建立個人關注清單（可加入任何 ETF 代號），並用上方「⭐ 只看我的」快速篩選。</div>';
      return;
    }
    const etfs = (window.DATA && window.DATA.etfs) || {};
    const list = [...state.watch].sort();
    const inputStyle = "padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:14px;width:160px;";
    const btnStyle = "padding:7px 12px;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;font-size:14px;";

    let html = "";
    // 新增任意代號
    html +=
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">' +
      '<span style="font-size:13px;color:var(--muted);">新增 ETF 代號：</span>' +
      '<input id="watchAddInput" placeholder="例如 00980A、0056" style="' + inputStyle + '">' +
      '<button id="watchAddBtn" style="' + btnStyle + '">新增</button>' +
      '<span id="watchAddMsg" style="font-size:12px;color:var(--up);"></span></div>';
    // 我的關注（可移除）
    html += '<div style="font-size:13px;color:var(--muted);margin-bottom:6px;">我的關注（點 × 移除）：</div>';
    if (!list.length) {
      html += '<div style="color:var(--muted);font-size:13px;">還沒有關注任何 ETF，用上面的輸入框新增。</div>';
    } else {
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      list.forEach((code) => {
        const known = etfs[code];
        const label = known ? (code + " " + known.name) : (code + "（下次更新後有資料）");
        html +=
          '<span class="watch-chip on" style="display:inline-flex;align-items:center;gap:7px;">' +
          label + '<span data-remove="' + code + '" title="移除" style="cursor:pointer;font-weight:700;">×</span></span>';
      });
      html += "</div>";
    }
    // 快速加入已追蹤的 ETF
    const quick = Object.keys(etfs).filter((id) => !state.watch.has(id));
    if (quick.length) {
      html += '<div style="font-size:13px;color:var(--muted);margin:12px 0 6px;">快速加入（已追蹤的 ETF）：</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      quick.forEach((id) => {
        html += '<span class="watch-chip" data-add="' + id + '" style="cursor:pointer;">＋ ' + id + " " + etfs[id].name + "</span>";
      });
      html += "</div>";
    }
    panel.innerHTML = html;

    panel.querySelectorAll("[data-remove]").forEach((el) => { el.onclick = () => toggleWatch(el.dataset.remove); });
    panel.querySelectorAll("[data-add]").forEach((el) => { el.onclick = () => addWatch(el.dataset.add); });
    const inp = panel.querySelector("#watchAddInput");
    const msg = panel.querySelector("#watchAddMsg");
    function submit() {
      const raw = (inp.value || "").trim().toUpperCase();
      if (!/^[0-9A-Z]{4,6}$/.test(raw)) {
        msg.style.color = "var(--up)"; msg.textContent = "代號格式不正確（4–6 碼英數）"; return;
      }
      addWithLookup(raw, msg);  // 即時查驗＋顯示
    }
    panel.querySelector("#watchAddBtn").onclick = submit;
    inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } };
  }

  function renderAll() { renderAuthBox(); renderMemberPanel(); }
  const watchModal = document.getElementById("watchModal");
  const watchClose = document.getElementById("watchClose");
  if (watchClose) watchClose.onclick = () => { watchModal.style.display = "none"; };
  if (watchModal) watchModal.onclick = (e) => { if (e.target === watchModal) watchModal.style.display = "none"; };
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
