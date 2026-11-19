import { apiRequest } from "./api.js";
import { getWorkEmailIdToken } from "./workEmailSignIn.js";

// Meeting bookings. Bookers authenticate with their work email ID token;
// reception uses its usual staff session.

export const BOOKING_ENDPOINTS = Object.freeze({
  cancel: "/api/bookings/cancel",
  decide: "/api/staff/meetings/bookings/decide",
  guests: "/api/bookings/guests",
  mine: "/api/bookings/mine",
  requests: "/api/staff/meetings/bookings",
  submit: "/api/bookings/submit",
  wifi: "/api/bookings/wifi",
});

async function bookerPost(path, body) {
  const idToken = await getWorkEmailIdToken();

  return apiRequest(path, {
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${idToken}` },
    method: "POST",
  });
}

export function listMyBookings() {
  return bookerPost(BOOKING_ENDPOINTS.mine, {});
}

export function submitMeetingBooking(booking) {
  return bookerPost(BOOKING_ENDPOINTS.submit, booking);
}

export function saveBookingGuests({ bookingId, guests }) {
  return bookerPost(BOOKING_ENDPOINTS.guests, { bookingId, guests });
}

export function cancelMeetingBooking(bookingId) {
  return bookerPost(BOOKING_ENDPOINTS.cancel, { bookingId });
}

// wifiAccess: "yes" or "no".
export function setBookingWifi({ bookingId, wifiAccess }) {
  return bookerPost(BOOKING_ENDPOINTS.wifi, { bookingId, wifiAccess });
}

function staffPost(path, accessToken, body, signal) {
  return apiRequest(path, {
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${accessToken}` },
    method: "POST",
    ...(signal ? { signal } : {}),
  });
}

export function getBookingRequests({
  accessToken,
  signal,
  tower = "",
  view = "pending",
}) {
  return staffPost(
    BOOKING_ENDPOINTS.requests,
    accessToken,
    { tower, view },
    signal,
  );
}

export function decideMeetingBooking({
  accessToken,
  bookingId,
  decision,
  reason = "",
  tower = "",
}) {
  return staffPost(BOOKING_ENDPOINTS.decide, accessToken, {
    bookingId,
    decision,
    reason,
    tower,
  });
}
