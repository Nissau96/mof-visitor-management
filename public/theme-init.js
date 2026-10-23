// Applies the saved (or device) colour theme before first paint so dark
// mode never flashes white. Kept as a file because the CSP blocks inline
// scripts. Must stay in sync with src/lib/theme.js.
(function applyInitialTheme() {
  var theme = "";

  try {
    theme = window.localStorage.getItem("mof-theme") || "";
  } catch (error) {
    theme = "";
  }

  if (theme !== "dark" && theme !== "light") {
    theme =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  }

  document.documentElement.classList.toggle("dark", theme === "dark");
  // Plex UI components read data-theme.
  document.documentElement.setAttribute("data-theme", theme);
})();
