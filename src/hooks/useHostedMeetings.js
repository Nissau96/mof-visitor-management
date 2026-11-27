import { useEffect, useState } from "react";
import { MINISTRY_OF_FINANCE_AGENCY } from "../constants/visitorOptions.js";
import { apiRequest } from "../lib/api.js";

// Today's meetings hosted by the agency (and, for the Ministry, the
// division) the visitor is going to. The server only returns those, so
// other agencies' meeting titles never reach the visitor's device.
//
// status: "idle" (not attending a meeting), "needs-destination" (agency
// or division not chosen yet), "loading", "ready" or "error".
export default function useHostedMeetings({
  agency,
  attending,
  division,
}) {
  const [retryKey, setRetryKey] = useState(0);
  const [result, setResult] = useState({
    key: "",
    meetings: [],
    status: "idle",
  });

  const ministry = agency === MINISTRY_OF_FINANCE_AGENCY;
  const hostDivision = ministry ? division : "";
  const destinationChosen =
    Boolean(agency) && (!ministry || Boolean(division));

  const key =
    attending && destinationChosen
      ? [agency, hostDivision, retryKey].join("|")
      : "";

  useEffect(() => {
    if (!key) {
      return undefined;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({ agency });

    if (hostDivision) {
      query.set("division", hostDivision);
    }

    void apiRequest(`/api/meetings?${query}`, {
      method: "GET",
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            meetings: Array.isArray(response.meetings)
              ? response.meetings
              : [],
            status: "ready",
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ key, meetings: [], status: "error" });
        }
      });

    return () => controller.abort();
  }, [agency, hostDivision, key]);

  function retry() {
    setRetryKey((current) => current + 1);
  }

  if (!attending) {
    return { meetings: [], retry, status: "idle" };
  }

  if (!destinationChosen) {
    return { meetings: [], retry, status: "needs-destination" };
  }

  if (result.key !== key) {
    return { meetings: [], retry, status: "loading" };
  }

  return { ...result, retry };
}
