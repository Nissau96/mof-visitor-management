import { apiRequest } from "./api.js";
import { getWorkEmailIdToken } from "./workEmailSignIn.js";

// Visitor booking links. App staff use their staff session; Ministry
// staff at /book use their work email ID token; the visitor's page
// needs neither (the link's token is the proof).

export const INVITE_ENDPOINTS = Object.freeze({
  bookerCancel: "/api/bookings/invites/cancel",
  bookerCreate: "/api/bookings/invites/create",
  bookerList: "/api/bookings/invites/list",
  find: "/api/staff/bookings/find",
  staffCancel: "/api/staff/invites/cancel",
  staffCreate: "/api/staff/invites/create",
  staffList: "/api/staff/invites/list",
  submit: "/api/invites/submit",
  view: "/api/invites/view",
});

function post(path, body, { headers = {}, signal } = {}) {
  return apiRequest(path, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
    ...(signal ? { signal } : {}),
  });
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

// One shape for both kinds of creator, so the dialog and list work the
// same on the staff dashboard and at /book.
export function createStaffInviteApi({ accessToken, tower = "" }) {
  const headers = bearer(accessToken);

  return {
    cancel: (inviteId) =>
      post(INVITE_ENDPOINTS.staffCancel, { inviteId, tower }, { headers }),
    chooseHost: true,
    create: (values) =>
      post(INVITE_ENDPOINTS.staffCreate, { ...values, tower }, { headers }),
    list: (signal) =>
      post(INVITE_ENDPOINTS.staffList, { tower }, { headers, signal }),
  };
}

async function bookerPost(path, body, signal) {
  const idToken = await getWorkEmailIdToken();

  return post(path, body, { headers: bearer(idToken), signal });
}

export const bookerInviteApi = Object.freeze({
  cancel: (inviteId) => bookerPost(INVITE_ENDPOINTS.bookerCancel, { inviteId }),
  chooseHost: false,
  create: (values) => bookerPost(INVITE_ENDPOINTS.bookerCreate, values),
  list: (signal) => bookerPost(INVITE_ENDPOINTS.bookerList, {}, signal),
});

export function findVisitorBooking({ accessToken, code, tower = "" }) {
  return post(INVITE_ENDPOINTS.find, { code, tower }, { headers: bearer(accessToken) });
}

export function viewInvite(token, signal) {
  return post(INVITE_ENDPOINTS.view, { token }, { signal });
}

export function submitInvite(values) {
  return post(INVITE_ENDPOINTS.submit, values);
}
