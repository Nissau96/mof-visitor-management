import nodemailer from "nodemailer";
import process from "node:process";
import {
  TOWER_OPTIONS,
  VISIT_AGENCY_LABELS,
  getFloorLabel,
} from "../constants/visitorOptions.js";
import { formatDate } from "../lib/meetingSchedule.js";
import { notify } from "./notify.js";
import { isSmsAvailable } from "./wifiCredentials.js";
import {
  escapeHtml,
  getStaffLoginUrl,
  readSmtpConfiguration,
} from "./staffInvitation.js";

// Visitor booking links: the link itself (to the visitor, when staff
// give an email address), and the booked reference code (to the
// visitor, and to the host who made the link).

// The link lives on the same site as staff sign-in. Local development
// without STAFF_LOGIN_URL falls back to the address the request used.
export function getInviteUrl(token, request) {
  let base;

  try {
    base = getStaffLoginUrl();
  } catch {
    base = request ? new URL(request.url).origin : "http://localhost:3000";
  }

  return new URL(`/invite/${token}`, base).toString();
}

function towerLabel(tower) {
  return TOWER_OPTIONS.find((option) => option.value === tower)?.label || "";
}

function placeOf({ agency, division, floor, tower }) {
  return [
    division || VISIT_AGENCY_LABELS[agency] || agency,
    towerLabel(tower),
    getFloorLabel(floor || "", tower),
  ]
    .filter(Boolean)
    .join(", ");
}

const expiryFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "Africa/Accra",
});

function layout({ heading, paragraphs, rows = [], button }) {
  const rowHtml = rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:6px 16px 6px 0;color:#475569;font-weight:600;vertical-align:top">${escapeHtml(label)}</th><td style="padding:6px 0;color:#0f172a">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>${escapeHtml(heading)}</title></head>
  <body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
          <tr><td>
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e">Ministry of Finance · Visitor Management</p>
            <h1 style="margin:12px 0 0;font-size:22px;color:#0f172a">${escapeHtml(heading)}</h1>
            ${paragraphs
              .map(
                (paragraph) =>
                  `<p style="margin:12px 0 0;font-size:15px;line-height:24px;color:#334155">${escapeHtml(paragraph)}</p>`,
              )
              .join("")}
            ${rowHtml ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:14px">${rowHtml}</table>` : ""}
            ${button ? `<p style="margin:24px 0 0"><a href="${escapeHtml(button.href)}" style="display:inline-block;background:#115e59;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">${escapeHtml(button.label)}</a></p>` : ""}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function toText({ paragraphs, rows = [], link }) {
  return [
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(link ? ["", link] : []),
    "",
    "Ministry of Finance · Visitor Management",
  ].join("\n");
}

export function createInviteLinkMessage({ expiresAt, hostName, url }) {
  const heading = "Book your visit to the Ministry of Finance";
  const paragraphs = [
    `${hostName} has invited you to book a visit.`,
    `Open the link, fill in your details and choose the date. The link works once, until ${expiryFormat.format(new Date(expiresAt))} (Accra time).`,
  ];

  return {
    html: layout({ button: { href: url, label: "Book your visit" }, heading, paragraphs }),
    subject: `${hostName} invited you to book a visit`,
    text: toText({ link: url, paragraphs }),
  };
}

export function createVisitorBookedMessage(booking) {
  const heading = "Your visit is booked";
  const paragraphs = [
    `Dear ${booking.visitorName},`,
    `Show this reference code at reception when you arrive: ${booking.referenceCode}`,
  ];
  const rows = [
    ["Reference", booking.referenceCode],
    ["Date", formatDate(booking.visitDate, { weekday: true })],
    ["Visiting", booking.hostName],
    ["Where", placeOf(booking)],
  ];

  return {
    html: layout({ heading, paragraphs, rows }),
    subject: `Your visit is booked: ${booking.referenceCode}`,
    text: toText({ paragraphs, rows }),
  };
}

export function createHostBookedMessage(booking) {
  const heading = "Your visitor has booked";
  const paragraphs = [
    `${booking.visitorName} used your link to book a visit. Reception will find them by this reference code.`,
  ];
  const rows = [
    ["Visitor", booking.visitorName],
    ["Reference", booking.referenceCode],
    ["Date", formatDate(booking.visitDate, { weekday: true })],
    ["Where", placeOf(booking)],
  ];

  return {
    html: layout({ heading, paragraphs, rows }),
    subject: `${booking.visitorName} booked a visit: ${booking.referenceCode}`,
    text: toText({ paragraphs, rows }),
  };
}

export async function sendInviteEmail({ message, to }) {
  const smtp = readSmtpConfiguration();
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
      to,
    });
  } finally {
    transport.close();
  }
}

// After a visitor books: email the visitor (when they gave an address)
// and the host, and text the visitor once SMS is set up. Nothing here can
// fail the booking; the result says what went out.
export async function notifyInviteBooked(
  booking,
  {
    environment = process.env,
    send = { email: sendInviteEmail, phone: notify },
    smsAvailable = isSmsAvailable(environment),
  } = {},
) {
  const tasks = {
    hostEmail: booking.hostEmail
      ? send.email({ message: createHostBookedMessage(booking), to: booking.hostEmail })
      : null,
    visitorEmail: booking.visitorEmail
      ? send.email({ message: createVisitorBookedMessage(booking), to: booking.visitorEmail })
      : null,
    visitorSms:
      smsAvailable && booking.visitorPhone
        ? send
            .phone({
              environment,
              parameters: [formatDate(booking.visitDate), booking.hostName, booking.referenceCode],
              phone: booking.visitorPhone,
              purpose: "booking_confirmation",
              referenceCode: booking.referenceCode,
            })
            .then((result) => {
              if (result?.status !== "accepted") {
                throw new Error("The visitor message was not sent.");
              }
            })
        : null,
  };

  const names = Object.keys(tasks);
  const results = await Promise.allSettled(names.map((name) => tasks[name]));

  return Object.fromEntries(
    names.map((name, index) => [
      name,
      tasks[name] === null ? false : results[index].status === "fulfilled",
    ]),
  );
}
