import { apiRequest } from "./api.js";

// Wi-Fi access requests, worked by the IT network team.

export const WIFI_ENDPOINTS = Object.freeze({
  count: "/api/staff/wifi/count",
  grant: "/api/staff/wifi/grant",
  resend: "/api/staff/wifi/resend",
  secret: "/api/staff/wifi/secret",
  list: "/api/staff/wifi/list",
  update: "/api/staff/wifi/update",
});

function staffPost(path, accessToken, body, signal) {
  return apiRequest(path, {
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${accessToken}` },
    method: "POST",
    ...(signal ? { signal } : {}),
  });
}

export function getWifiRequests({ accessToken, signal, view = "today" }) {
  return staffPost(WIFI_ENDPOINTS.list, accessToken, { view }, signal);
}

export function getWifiWaitingCount({ accessToken, signal }) {
  return staffPost(WIFI_ENDPOINTS.count, accessToken, {}, signal);
}

// status: "given", "not_given", or "waiting" to undo a decision.
export function updateWifiRequest({ accessToken, id, note = "", status, type }) {
  return staffPost(WIFI_ENDPOINTS.update, accessToken, {
    id,
    note,
    status,
    type,
  });
}

// Records a grant and sends the details. channels: "sms", "email",
// "print" (printing is done by the browser).
export function grantWifiAccess({ accessToken, ...grant }) {
  return staffPost(WIFI_ENDPOINTS.grant, accessToken, grant);
}

export function getWifiPassword({ accessToken, id, tower = "", type }) {
  return staffPost(WIFI_ENDPOINTS.secret, accessToken, { id, tower, type });
}

export function resendWifiDetails({ accessToken, channels, id, tower = "", type }) {
  return staffPost(WIFI_ENDPOINTS.resend, accessToken, { channels, id, tower, type });
}

// Fired after a status change so the side-menu badge refreshes.
export const WIFI_CHANGED_EVENT = "mof:wifi-requests-changed";
