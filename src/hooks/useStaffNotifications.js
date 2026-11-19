import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";

const POLL_INTERVAL_MS = 60_000;

const COUNT_KEYS = Object.freeze([
  "awaitingCard",
  "bookingRequests",
  "cardProblems",
  "overstays",
  "pendingAdmissions",
]);

// Keeps only whole, non-negative numbers; anything else (including
// cardProblems for receptionists) becomes null and shows no badge.
export function readAttentionCounts(value) {
  return Object.fromEntries(
    COUNT_KEYS.map((key) => {
      const count = value?.[key];
      return [key, Number.isInteger(count) && count >= 0 ? count : null];
    }),
  );
}

// One poll feeds the notification bell and the side-menu badges: every
// minute while the tab is visible, and again whenever refreshKey (the
// page path) changes. counts is null until loaded and after a failed
// load, so stale numbers are never shown.
export default function useStaffNotifications({
  accessToken,
  enabled,
  refreshKey,
  tower,
}) {
  const [notifications, setNotifications] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(
    (signal) =>
      apiRequest("/api/staff/notifications", {
        body: JSON.stringify({ tower }),
        headers: { Authorization: `Bearer ${accessToken}` },
        method: "POST",
        signal,
      })
        .then((result) => {
          if (!Array.isArray(result?.notifications)) {
            throw new Error("Invalid notifications response.");
          }

          setNotifications(result.notifications);
          setCounts(result.counts ? readAttentionCounts(result.counts) : null);
          setLoadError(false);

          return result.notifications;
        })
        .catch((error) => {
          if (error?.name !== "AbortError") {
            setLoadError(true);
            setCounts(null);
          }

          return null;
        }),
    [accessToken, tower],
  );

  // Poll only while the tab is visible to stay within the hosting
  // plan's function-invocation budget.
  useEffect(() => {
    if (!enabled || !accessToken) {
      return undefined;
    }

    let controller = null;
    let timer = null;

    function stop() {
      controller?.abort();
      window.clearInterval(timer);
      timer = null;
    }

    function poll() {
      controller?.abort();
      controller = new AbortController();
      void load(controller.signal);
    }

    function sync() {
      stop();

      if (document.visibilityState === "visible") {
        poll();
        timer = window.setInterval(poll, POLL_INTERVAL_MS);
      }
    }

    sync();
    document.addEventListener("visibilitychange", sync);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [accessToken, enabled, load, refreshKey]);

  return {
    counts: enabled ? counts : null,
    loadError,
    notifications: enabled ? notifications : [],
    reload: load,
  };
}
