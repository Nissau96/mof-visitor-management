import { useSyncExternalStore } from "react";

// Must stay in sync with public/theme-init.js, which applies the theme
// before React loads.
const THEME_STORAGE_KEY = "mof-theme";

const listeners = new Set();

function readTheme() {
  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

function subscribe(listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function setTheme(theme) {
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark",
  );

  // Plex UI components read data-theme.
  document.documentElement.setAttribute(
    "data-theme",
    theme,
  );

  try {
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      theme,
    );
  } catch {
    // The choice still applies for this page view.
  }

  listeners.forEach((listener) => listener());
}

export function useTheme() {
  return useSyncExternalStore(
    subscribe,
    readTheme,
    () => "light",
  );
}
