// 主題切換（淺色/深色）：預設跟隨系統，手動切換後記住選擇
(function () {
  const KEY = "etf-theme";
  const root = document.documentElement;

  function system() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function current() {
    return root.dataset.theme || system();
  }

  // 進頁時套用已存主題（head 也做過，這裡保險）
  const saved = localStorage.getItem(KEY);
  if (saved) root.dataset.theme = saved;

  function wire() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    function refresh() {
      const dark = current() === "dark";
      btn.textContent = dark ? "☀️" : "🌙";        // 顯示「切換後」的圖示
      btn.title = dark ? "切換為淺色" : "切換為深色";
    }
    btn.addEventListener("click", function () {
      const next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      localStorage.setItem(KEY, next);
      refresh();
    });
    refresh();
  }

  if (document.readyState !== "loading") wire();
  else document.addEventListener("DOMContentLoaded", wire);
})();
