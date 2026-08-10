// Handles the dark/light theme toggle button. Included on every page.
// The actual light/dark CSS variables live in css/style.css under
// [data-theme="light"] — this file just flips the attribute and remembers
// the choice. A tiny inline script in each page's <head> also re-applies
// the saved choice before first paint, so there's no flash of the wrong
// theme on load.
(function () {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;

  const DARK_COLOR = "#14110f";
  const LIGHT_COLOR = "#faf6ef";
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');

  function isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function updateIcon() {
    // Shows the mode you'll switch TO on click.
    btn.textContent = isLight() ? "🌙" : "☀️";
  }

  function updateMetaColor() {
    if (metaThemeColor) metaThemeColor.setAttribute("content", isLight() ? LIGHT_COLOR : DARK_COLOR);
  }

  updateIcon();
  updateMetaColor();

  btn.addEventListener("click", () => {
    if (isLight()) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("gallery_theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("gallery_theme", "light");
    }
    updateIcon();
    updateMetaColor();
  });
})();
