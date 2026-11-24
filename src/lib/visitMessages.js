// Turns notification_log rows into one line per message for the visit
// drawer: "Booking confirmation · Delivered on WhatsApp", or, when
// WhatsApp failed and SMS took over, "WhatsApp failed, SMS sent".

export const MESSAGE_PURPOSE_LABELS = Object.freeze({
  booking_confirmation: "Booking confirmation",
  visit_reminder: "Visit reminder",
  wifi_details: "Wi-Fi details",
});

const CHANNEL_LABELS = Object.freeze({ sms: "SMS", whatsapp: "WhatsApp" });

const STATUS_WORDS = Object.freeze({
  accepted: "sent",
  delivered: "delivered",
  expired: "expired",
  failed: "failed",
  read: "read",
  sent: "sent",
});

export function getMessageTone(status) {
  if (status === "failed" || status === "expired") {
    return "failed";
  }

  return status === "delivered" || status === "read" ? "delivered" : "sent";
}

function phrase(row, { capital = true } = {}) {
  const channel = CHANNEL_LABELS[row.channel] || row.channel;
  const word = STATUS_WORDS[row.status] || row.status;
  const text = row.status === "failed" || row.status === "expired" ? `${channel} ${word}` : `${word} on ${channel}`;

  return capital ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function describeMessages(rows = []) {
  const fallbacks = new Map(rows.filter((row) => row.fallbackOf).map((row) => [row.fallbackOf, row]));
  const shownAsFallback = new Set();

  return rows
    .map((row) => {
      if (shownAsFallback.has(row.id) || (row.fallbackOf && rows.some((other) => other.id === row.fallbackOf))) {
        return null;
      }

      const fallback = fallbacks.get(row.id);

      if (fallback) {
        shownAsFallback.add(fallback.id);
      }

      const final = fallback || row;

      return {
        at: final.updatedAt || final.createdAt,
        id: row.id,
        label: MESSAGE_PURPOSE_LABELS[row.purpose] || row.purpose,
        text: fallback ? `${phrase(row)}, ${phrase(fallback, { capital: false })}` : phrase(row),
        tone: getMessageTone(final.status),
      };
    })
    .filter(Boolean);
}
