import { useEffect, useRef, useState } from "react";

// Staff are signed out after a spell without keyboard, mouse or touch
// input, with a warning shortly before. Background requests such as the
// notification poll do not count, so an unattended dashboard still
// times out. The last activity time lives in localStorage, so every tab
// shares one timer: working in any tab keeps them all signed in, and
// they all sign out together.
export const STAFF_IDLE_TIMEOUT_MS = 25 * 60_000;
export const STAFF_IDLE_WARNING_MS = 2 * 60_000;

const LAST_ACTIVITY_KEY = "mof-visitor-management.staff-last-activity";
const IDLE_SIGN_OUT_KEY = "mof-visitor-management.staff-idle-sign-out";

// How long the sign-in page keeps explaining an idle sign-out.
const IDLE_NOTICE_MS = 12 * 60 * 60_000;

// Writing on every mouse movement is wasteful; a few seconds of
// precision is plenty against a 25-minute limit.
const ACTIVITY_WRITE_INTERVAL_MS = 5_000;
const CHECK_INTERVAL_MS = 1_000;

const ACTIVITY_EVENTS = [
  "input",
  "keydown",
  "pointerdown",
  "pointermove",
  "scroll",
  "touchstart",
  "wheel",
];

// Used when storage is blocked; the timer then covers this tab only.
let memoryLastActivity = null;

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Storage is a convenience; the in-memory copy still works.
  }
}

export function readLastActivity() {
  const stored = Number(readStorage(LAST_ACTIVITY_KEY));

  return Number.isFinite(stored) && stored > 0
    ? stored
    : memoryLastActivity;
}

export function recordActivity(now = Date.now()) {
  memoryLastActivity = now;
  writeStorage(LAST_ACTIVITY_KEY, String(now));
}

// Called on every sign-in and sign-out, so a new session never inherits
// an old one's idle time.
export function resetStaffActivity() {
  memoryLastActivity = null;
  writeStorage(LAST_ACTIVITY_KEY, null);
}

export function markIdleSignOut(now = Date.now()) {
  writeStorage(IDLE_SIGN_OUT_KEY, String(now));
}

export function clearIdleSignOut() {
  writeStorage(IDLE_SIGN_OUT_KEY, null);
}

export function wasSignedOutForInactivity(now = Date.now()) {
  const at = Number(readStorage(IDLE_SIGN_OUT_KEY));

  return Number.isFinite(at) && at > 0 && now - at < IDLE_NOTICE_MS;
}

// Returns the phase for a given idle time: "active", "warning" (with
// the seconds left) or "expired".
export function getIdleState(
  lastActivity,
  now = Date.now(),
  timeout = STAFF_IDLE_TIMEOUT_MS,
  warning = STAFF_IDLE_WARNING_MS,
) {
  const idle = now - lastActivity;

  if (idle >= timeout) {
    return { phase: "expired", secondsLeft: 0 };
  }

  if (idle >= timeout - warning) {
    return {
      phase: "warning",
      secondsLeft: Math.ceil((timeout - idle) / 1_000),
    };
  }

  return { phase: "active", secondsLeft: null };
}

// While enabled, watches for input and calls onExpire once the shared
// idle time runs out. Returns the warning countdown and a way to stay
// signed in.
export function useStaffIdleSignOut({ enabled, onExpire }) {
  const [state, setState] = useState({ phase: "active", secondsLeft: null });
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let lastWrite = 0;
    let expired = false;

    // A tab reloaded after the limit has passed (for example, after the
    // computer slept) still signs out; otherwise the clock starts now.
    if (readLastActivity() === null) {
      recordActivity();
    }

    function check() {
      if (expired) {
        return;
      }

      const lastActivity = readLastActivity() ?? Date.now();
      const next = getIdleState(lastActivity);

      setState((current) =>
        current.phase === next.phase &&
        current.secondsLeft === next.secondsLeft
          ? current
          : next,
      );

      if (next.phase === "expired") {
        expired = true;
        onExpireRef.current?.();
      }
    }

    function handleActivity() {
      const now = Date.now();

      if (now - lastWrite < ACTIVITY_WRITE_INTERVAL_MS) {
        return;
      }

      lastWrite = now;
      recordActivity(now);
      check();
    }

    // Once the warning shows, moving the mouse no longer counts: a stray
    // nudge should not dismiss it. Clicks, keys and scrolling still do.
    function handleMove() {
      const lastActivity = readLastActivity();

      if (
        lastActivity !== null &&
        getIdleState(lastActivity).phase !== "active"
      ) {
        return;
      }

      handleActivity();
    }

    check();

    const interval = window.setInterval(check, CHECK_INTERVAL_MS);

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(
        name,
        name === "pointermove" ? handleMove : handleActivity,
        { capture: true, passive: true },
      );
    }

    // Timers are throttled in background tabs; check as soon as the tab
    // is visible again.
    document.addEventListener("visibilitychange", check);

    return () => {
      window.clearInterval(interval);

      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(
          name,
          name === "pointermove" ? handleMove : handleActivity,
          { capture: true },
        );
      }

      document.removeEventListener("visibilitychange", check);
    };
  }, [enabled]);

  function staySignedIn() {
    recordActivity();
    setState({ phase: "active", secondsLeft: null });
  }

  return { ...state, staySignedIn };
}
