import nodemailer from "nodemailer";
import {
  formatBookingSchedule,
  formatDate,
  isMultiDayBooking,
} from "../lib/meetingSchedule.js";
import { LATER_DAYS_NOTE } from "../validation/meetingBookings.js";
import {
  escapeHtml,
  getStaffLoginUrl,
  readSmtpConfiguration,
} from "./staffInvitation.js";

// Tells the person who booked a meeting that reception approved or
// rejected it, or that it expired unanswered.

const OUTCOMES = Object.freeze({
  approved: Object.freeze({
    heading: "Your meeting booking is approved",
    subject: "Meeting approved",
    summary:
      "Reception has approved your meeting. Your listed guests will be expected at reception.",
  }),
  expired: Object.freeze({
    heading: "Your meeting request expired",
    subject: "Meeting request expired",
    summary:
      "Reception did not answer your request before the meeting started, so it has expired. Contact reception if the meeting is still going ahead.",
  }),
  rejected: Object.freeze({
    heading: "Your meeting booking was not approved",
    subject: "Meeting not approved",
    summary: "Reception could not approve your meeting.",
  }),
});

export function getMyBookingsUrl() {
  return new URL("/book/mine", getStaffLoginUrl()).toString();
}

export function createMeetingBookingMessage(booking, { myBookingsUrl }) {
  const outcome = OUTCOMES[booking.status];

  if (!outcome) {
    throw new Error(`No email for booking status ${booking.status}.`);
  }

  const guestCount = Array.isArray(booking.guests) ? booking.guests.length : 0;
  const multiDay = isMultiDayBooking(booking);
  const summary =
    multiDay && booking.status === "approved"
      ? `${outcome.summary} ${LATER_DAYS_NOTE}`
      : outcome.summary;

  const details = [
    ["Meeting", booking.title],
    ["When", formatBookingSchedule(booking)],
    ...(multiDay
      ? [["Guests expected", formatDate(booking.meetingDate, { weekday: true })]]
      : []),
    ["Venue", booking.venue || "Not given"],
    ["Guests", String(guestCount)],
    ["Reference", booking.referenceCode],
  ];

  if (booking.status === "rejected" && booking.decisionReason) {
    details.push(["Reason", booking.decisionReason]);
  }

  const text = [
    `Dear ${booking.bookerName},`,
    "",
    summary,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "",
    `See your bookings: ${myBookingsUrl}`,
    "",
    "Ministry of Finance · Visitor Management",
  ].join("\n");

  const rows = details
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:6px 16px 6px 0;color:#475569;font-weight:600;vertical-align:top">${escapeHtml(label)}</th><td style="padding:6px 0;color:#0f172a">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>${escapeHtml(outcome.subject)}</title></head>
  <body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
          <tr><td>
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e">Ministry of Finance · Visitor Management</p>
            <h1 style="margin:12px 0 0;font-size:22px;color:#0f172a">${escapeHtml(outcome.heading)}</h1>
            <p style="margin:12px 0 0;font-size:15px;line-height:24px;color:#334155">Dear ${escapeHtml(booking.bookerName)},</p>
            <p style="margin:8px 0 0;font-size:15px;line-height:24px;color:#334155">${escapeHtml(summary)}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:14px">${rows}</table>
            <p style="margin:24px 0 0"><a href="${escapeHtml(myBookingsUrl)}" style="display:inline-block;background:#115e59;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">See your bookings</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    html,
    subject: `${outcome.subject}: ${booking.title}`,
    text,
  };
}

export async function sendMeetingBookingEmail(booking) {
  const smtp = readSmtpConfiguration();
  const message = createMeetingBookingMessage(booking, {
    myBookingsUrl: getMyBookingsUrl(),
  });

  const transport = nodemailer.createTransport({
    auth: { pass: smtp.password, user: smtp.user },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    host: smtp.host,
    port: smtp.port,
    requireTLS: !smtp.secure,
    secure: smtp.secure,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2" },
  });

  try {
    await transport.sendMail({
      disableFileAccess: true,
      disableUrlAccess: true,
      from: { address: smtp.fromEmail, name: smtp.fromName },
      html: message.html,
      subject: message.subject,
      text: message.text,
      to: booking.bookerEmail,
    });
  } finally {
    transport.close();
  }
}
