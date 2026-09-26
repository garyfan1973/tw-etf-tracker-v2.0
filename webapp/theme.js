// 主題切換（淺色/深色）：預設跟隨系統，手動切換後記住選擇
(function () {
  const KEY = "etf-theme";
  const PALETTE_KEY = "etf-palette";
  const PALETTES = ["mist", "sage", "lilac", "sand", "rose", "slate", "olive", "apricot", "cocoa"];
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
  const savedPalette = localStorage.getItem(PALETTE_KEY);
  root.dataset.palette = PALETTES.includes(savedPalette) ? savedPalette : (root.dataset.palette || "mist");

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

  function wirePalette() {
    const buttons = document.querySelectorAll("[data-palette]");
    if (!buttons.length) return;
    function refresh() {
      buttons.forEach(button => {
        const active = button.dataset.palette === (root.dataset.palette || "mist");
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }
    buttons.forEach(button => button.addEventListener("click", () => {
      const next = button.dataset.palette;
      if (!PALETTES.includes(next)) return;
      root.dataset.palette = next;
      localStorage.setItem(PALETTE_KEY, next);
      refresh();
    }));
    refresh();
  }

  if (document.readyState !== "loading") { wire(); wirePalette(); }
  else document.addEventListener("DOMContentLoaded", () => { wire(); wirePalette(); });
})();
