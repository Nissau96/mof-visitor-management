// Turns notification_log rows into one line per text message for the
// visit drawer: "Booking confirmation · Sent by SMS". Rows from any
// other channel are not shown.

export const MESSAGE_PURPOSE_LABELS = Object.freeze({
  booking_confirmation: "Booking confirmation",
  card_issued: "Visitor card",
  registration_success: "Registration",
  visit_feedback: "Feedback request",
  visit_reminder: "Visit reminder",
  wifi_details: "Wi-Fi details",
});

const STATUS_TEXT = Object.freeze({
  accepted: "Sent by SMS",
  delivered: "Delivered by SMS",
  expired: "SMS expired",
  failed: "SMS failed",
  read: "Delivered by SMS",
  sent: "Sent by SMS",
});

export function getMessageTone(status) {
  if (status === "failed" || status === "expired") {
    return "failed";
  }

  return status === "delivered" || status === "read" ? "delivered" : "sent";
}

export function describeMessages(rows = []) {
  return rows
    .filter((row) => row.channel === "sms")
    .map((row) => ({
      at: row.updatedAt || row.createdAt,
      id: row.id,
      label: MESSAGE_PURPOSE_LABELS[row.purpose] || row.purpose,
      text: STATUS_TEXT[row.status] || `SMS ${row.status}`,
      tone: getMessageTone(row.status),
    }));
}
