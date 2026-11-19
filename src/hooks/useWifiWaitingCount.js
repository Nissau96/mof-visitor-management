import { useEffect, useState } from "react";
import {
  getWifiWaitingCount,
  WIFI_CHANGED_EVENT,
} from "../lib/wifiApi.js";

const POLL_INTERVAL_MS = 60_000;

// Waiting Wi-Fi requests (today and ahead) for the side-menu badge.
// Polls every minute while the tab is visible, when the page changes,
// and right after the Wi-Fi page records a decision. Null until loaded
// and after a failed load, so a stale number is never shown.
export default function useWifiWaitingCount({
  accessToken,
  enabled,
  refreshKey,
}) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!enabled || !accessToken) {
      return undefined;
    }

    let controller = null;
    let timer = null;

    function poll() {
      controller?.abort();
      controller = new AbortController();

      getWifiWaitingCount({ accessToken, signal: controller.signal })
        .then((result) => {
          const value = result?.waitingCount;
          setCount(Number.isInteger(value) && value >= 0 ? value : null);
        })
        .catch((error) => {
          if (error?.name !== "AbortError") {
            setCount(null);
          }
        });
    }

    function stop() {
      controller?.abort();
      window.clearInterval(timer);
      timer = null;
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
    window.addEventListener(WIFI_CHANGED_EVENT, poll);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener(WIFI_CHANGED_EVENT, poll);
    };
  }, [accessToken, enabled, refreshKey]);

  return enabled ? count : null;
}
