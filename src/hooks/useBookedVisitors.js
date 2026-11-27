import { useEffect, useState } from "react";
import { ApiError } from "../lib/api.js";
import { getBookedVisitors } from "../lib/visitorInviteApi.js";

/**
 * Visitors who booked with a visitor link, for the dashboard's Booked
 * visitors view. Always loaded, so the tab can show today's count
 * (bookings not yet arrived) while another view is open.
 */
export default function useBookedVisitors({
  accessToken,
  onAuthError,
  refreshKey,
  tower,
  view,
}) {
  const key = [accessToken, tower, view, refreshKey].join("|");
  const [result, setResult] = useState({
    bookings: [],
    error: "",
    key: "",
    todayCount: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    getBookedVisitors({ accessToken, signal: controller.signal, tower, view })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult({
            bookings: Array.isArray(data?.bookings) ? data.bookings : [],
            error: "",
            key,
            todayCount: Number.isInteger(data?.todayCount) ? data.todayCount : null,
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          onAuthError?.();
          return;
        }

        setResult((current) => ({
          ...current,
          bookings: [],
          error: error?.message || "Booked visitors could not be loaded. Please try again.",
          key,
        }));
      });

    return () => controller.abort();
    // onAuthError is a callback, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    bookings: result.bookings,
    error: result.error,
    status: result.key !== key ? "loading" : result.error ? "error" : "ready",
    todayCount: result.todayCount,
  };
}
