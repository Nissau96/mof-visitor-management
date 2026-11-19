import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// A reception kiosk is a shared Ministry device left on /visit/kiosk.
// Opening that page marks the browser tab, so every visitor page in it
// returns to the kiosk after a pause and the next visitor starts clean.
export const KIOSK_PATH = "/visit/kiosk";
export const KIOSK_IDLE_MS = 2 * 60_000;
export const KIOSK_SUCCESS_SECONDS = 20;

const KIOSK_STORAGE_KEY = "mof-visitor-kiosk";

const ACTIVITY_EVENTS = [
  "input",
  "keydown",
  "pointerdown",
  "scroll",
  "touchstart",
];

export function isKioskDevice() {
  try {
    return (
      window.sessionStorage.getItem(KIOSK_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function markKioskDevice() {
  try {
    window.sessionStorage.setItem(KIOSK_STORAGE_KEY, "1");
  } catch {
    // Without storage the kiosk still works; it just cannot reset.
  }
}

export function visitorHomePath() {
  return isKioskDevice() ? KIOSK_PATH : "/visit";
}

// Leaving the page unmounts its form, which clears what was typed.
export function useKioskIdleReset(enabled) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let timer;

    function restart() {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => navigate(KIOSK_PATH, { replace: true }),
        KIOSK_IDLE_MS,
      );
    }

    restart();

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, restart, {
        capture: true,
        passive: true,
      });
    }

    return () => {
      window.clearTimeout(timer);

      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, restart, {
          capture: true,
        });
      }
    };
  }, [enabled, navigate]);
}
