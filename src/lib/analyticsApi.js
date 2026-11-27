import { apiRequest } from "./api.js";

// Analytics & Reports data. body.report is "overview", "visits" or
// "csu-month"; see src/validation/analytics.js.
export function getAnalytics({ accessToken, body, signal }) {
  return apiRequest("/api/staff/dashboard?operation=analytics", {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    signal,
  });
}
