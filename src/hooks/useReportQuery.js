import { useEffect, useEffectEvent, useState } from "react";
import { ApiError } from "../lib/api.js";

const REQUEST_TIMEOUT_MS = 30_000;

// Loads data for the Analytics & Reports page whenever `key` changes.
// request(signal) returns a promise of the data. Previous data stays
// while the next key loads, so panels dim instead of flashing empty.
// A 401/403 calls onAuthError (sign out) instead of showing an error.
export default function useReportQuery({ key, onAuthError, request }) {
  const [result, setResult] = useState({
    data: null,
    error: "",
    fetchedAt: null,
    key: "",
  });

  const load = useEffectEvent((signal) => request(signal));
  const authFailed = useEffectEvent(() => onAuthError?.());

  useEffect(() => {
    if (!key) {
      return undefined;
    }

    const controller = new AbortController();
    // A request that never answers (sleep, dropped network) would leave
    // the page loading forever; give up after REQUEST_TIMEOUT_MS instead.
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ]);

    load(signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult({
            data,
            error: "",
            fetchedAt: new Date().toISOString(),
            key,
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
          setResult((current) => ({
            ...current,
            error: "Reports took too long to load. Please try again.",
            key,
          }));
          return;
        }

        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          authFailed();
          return;
        }

        setResult((current) => ({
          ...current,
          error:
            error instanceof Error && error.message
              ? error.message
              : "Reports could not be loaded. Please try again.",
          key,
        }));
      });

    return () => controller.abort();
  }, [key]);

  const settled = Boolean(key) && result.key === key;

  return {
    data: result.data,
    error: settled ? result.error : "",
    fetchedAt: result.fetchedAt,
    status: !settled ? "loading" : result.error ? "error" : "ready",
  };
}
