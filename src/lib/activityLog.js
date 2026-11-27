// Labels, categories and formats for the admin Activity Log.
// Categories and the "sensitive" rule mirror audit_event_category() and
// audit_event_sensitive() in the database.

import { getTowerLabel } from "../constants/visitorOptions.js";
import { formatDayMonth, formatShortDate, formatTime } from "./visitHistory.js";

export const ACTIVITY_CATEGORIES = Object.freeze({
  card: { label: "Card", tone: "amber" },
  export: { label: "Export", tone: "rose" },
  kiosk: { label: "Kiosk", tone: "teal" },
  link: { label: "Visitor link", tone: "indigo" },
  meeting: { label: "Meeting", tone: "blue" },
  settings: { label: "Settings", tone: "purple" },
  signin: { label: "Sign-in", tone: "slate" },
  system: { label: "System", tone: "slate" },
  visitor: { label: "Visitor", tone: "teal" },
  wifi: { label: "Wi-Fi", tone: "cyan" },
});

export const CATEGORY_OPTIONS = Object.freeze([
  { label: "All", value: "" },
  { label: "Sensitive only", value: "sensitive" },
  ...Object.entries(ACTIVITY_CATEGORIES).map(([value, meta]) => ({ label: meta.label, value })),
]);

export const ROLE_LABELS = Object.freeze({
  admin: "Super Administrator",
  booker: "Ministry staff (booking)",
  client_service_head: "Unit Head",
  it_network_admin: "IT network",
  receptionist: "Receptionist",
  staff: "Staff",
  system: "System",
  visitor: "Visitor (self-service)",
});

export const ROLE_OPTIONS = Object.freeze([
  { label: "All", value: "" },
  ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ label, value })),
]);

export const RESULT_OPTIONS = Object.freeze([
  { label: "All", value: "" },
  { label: "Success", value: "success" },
  { label: "Failed", value: "failed" },
]);

export const TOWER_OPTIONS = Object.freeze([
  { label: "All towers", value: "" },
  { label: "Tower 1", value: "tower_1" },
  { label: "Tower 2", value: "tower_2" },
  { label: "No tower", value: "none" },
]);

const ACTION_LABELS = Object.freeze({
  "activity_log.exported": "Exported activity log",
  "host.created": "Added host",
  "host.updated": "Updated host details",
  kiosk_device_removed: "Removed kiosk tablet",
  kiosk_device_set_up: "Set up kiosk tablet",
  "meeting.created": "Created meeting",
  "meeting.deleted": "Deleted meeting",
  "meeting.updated": "Updated meeting",
  "meeting_booking.approved": "Approved meeting booking",
  "meeting_booking.cancelled": "Cancelled meeting booking",
  "meeting_booking.guests_updated": "Updated meeting guests",
  "meeting_booking.rejected": "Rejected meeting booking",
  "meeting_booking.submitted": "Requested meeting",
  "meeting_booking.wifi_changed": "Changed meeting Wi-Fi",
  "report.exported": "Exported report",
  "retention.cleanup": "Ran data retention cleanup",
  "staff.account_deletion_requested": "Deleted staff account",
  "staff.invited": "Invited staff member",
  "staff.password_setup_completed": "Completed password setup",
  "staff.temporary_password_reissued": "Reissued temporary password",
  "staff.updated": "Updated staff member",
  staff_sign_in_failed: "Sign-in failed",
  staff_sign_in_refused: "Sign-in refused",
  staff_sign_in_settings_updated: "Changed sign-in settings",
  staff_signed_in: "Signed in",
  staff_signed_out: "Signed out",
  "visit.admission_cancelled": "Cancelled admission",
  "visit.admission_expired": "Admission expired",
  "visit.admission_requested": "Registered for a visit",
  "visit.admitted": "Admitted visitor",
  "visit.checked_out": "Checked out visitor",
  "visit_history.exported": "Exported visit history",
  "visitor_card.incident_resolved": "Resolved card incident",
  "visitor_card.inventory_added": "Added cards to inventory",
  "visitor_card.investigation_started": "Started card investigation",
  "visitor_card.not_returned": "Card not returned",
  "visitor_card.replacement_registered": "Registered replacement card",
  "visitor_card.returned": "Card returned",
  "visitor_card.tower_assigned": "Moved card to tower",
  "visitor_invite.cancelled": "Cancelled visitor link",
  "visitor_invite.created": "Created visitor link",
  "visitor_invite.submitted": "Booked with visitor link",
  "weekly_qr.generated": "Generated weekly QR code",
  "wifi.password_revealed": "Revealed Wi-Fi password",
  "wifi_access.granted": "Granted Wi-Fi access",
  "wifi_access.updated": "Updated Wi-Fi access",
});

/** "Updated host details"; unknown actions are turned into words. */
export function actionLabel(action) {
  if (ACTION_LABELS[action]) {
    return ACTION_LABELS[action];
  }

  const words = String(action || "Event").replace(/[._]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function categoryMeta(category) {
  return ACTIVITY_CATEGORIES[category] || ACTIVITY_CATEGORIES.system;
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || "Staff";
}

/** "EV-20477" */
export function eventReference(event) {
  return `EV-${event.id}`;
}

/** "Windows · Chrome" from a user agent; "" when unknown. */
export function describeDevice(userAgent) {
  const agent = String(userAgent || "");

  if (!agent) {
    return "";
  }

  const os = /iPhone|iPad/.test(agent)
    ? "iOS"
    : /Android/.test(agent)
      ? "Android"
      : /Windows/.test(agent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : "";

  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /OPR\//.test(agent)
      ? "Opera"
      : /Firefox\//.test(agent)
        ? "Firefox"
        : /Chrome\//.test(agent)
          ? "Chrome"
          : /Safari\//.test(agent)
            ? "Safari"
            : /node|undici/i.test(agent)
              ? "Server"
              : "";

  return [os, browser].filter(Boolean).join(" · ") || "Unknown device";
}

export function towerText(tower) {
  return tower ? getTowerLabel(tower) : "All towers";
}

/** "5:12 pm" and "Today" / "Yesterday" / "Thu 19 Nov". */
export function eventWhen(createdAt, now = new Date()) {
  const day = new Date(createdAt);
  const iso = (date) => date.toISOString().slice(0, 10);
  const today = iso(now);
  const yesterday = iso(new Date(now.getTime() - 86_400_000));
  const dayIso = Number.isNaN(day.getTime()) ? "" : iso(day);

  return {
    day: dayIso === today ? "Today" : dayIso === yesterday ? "Yesterday" : formatShortDate(createdAt),
    time: formatTime(createdAt),
  };
}

/** "Fri 20 Nov 2026, 3:10 pm" */
export function eventDateTime(createdAt) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? ""
    : `${formatShortDate(createdAt)} ${date.getUTCFullYear()}, ${formatTime(createdAt)}`;
}

const FIELD_LABELS = Object.freeze({
  access_expires_at: "Access ends",
  active: "Active",
  card_type: "Card type",
  department: "Department",
  full_name: "Name",
  is_nsp: "Intern / NSP",
  role: "Role",
  sign_in_method: "Sign-in method",
  tower: "Tower",
  wifi_expires_at: "Wi-Fi until",
  wifi_note: "Wi-Fi note",
  wifi_status: "Wi-Fi status",
});

export function fieldLabel(field) {
  if (FIELD_LABELS[field]) {
    return FIELD_LABELS[field];
  }

  const words = String(field).replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A before/after value as text. */
export function formatChangeValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "—";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const text = String(value);

  if (/^tower_[12]$/.test(text)) {
    return getTowerLabel(text);
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return `${formatDayMonth(text)}, ${formatTime(text)}`;
  }

  return ROLE_LABELS[text] || text;
}

/** The target column: { name, detail } from the event and its details. */
export function describeTarget(event) {
  const details = event.details || {};

  if (event.action === "staff_sign_in_failed") {
    return { detail: "Wrong email or password", name: details.email || event.actorName || "Unknown account" };
  }

  if (event.action === "staff_sign_in_refused") {
    return { detail: String(details.reason || "Refused").replace(/_/g, " "), name: event.actorName || "Staff account" };
  }

  if (event.category === "export") {
    const what =
      event.action === "visit_history.exported"
        ? "Visit history"
        : event.action === "activity_log.exported"
          ? "Activity log"
          : details.report || "Report";
    const rows = Number.isInteger(details.rows) ? `, ${details.rows} rows` : "";

    return {
      detail: [details.dateFrom && details.dateTo ? `${details.dateFrom} – ${details.dateTo}` : details.period, details.format?.toUpperCase()]
        .filter(Boolean)
        .join(" · "),
      name: `${what} (${(details.format || "csv").toUpperCase()}${rows})`,
    };
  }

  if (event.action === "weekly_qr.generated") {
    return { detail: details.validThrough ? `Valid until ${details.validThrough}` : "Reception QR", name: "Weekly visitor QR" };
  }

  if (event.action === "retention.cleanup") {
    return { detail: "Expired records", name: "Data retention" };
  }

  const name =
    event.targetName ||
    details.title ||
    details.cardNumber ||
    details.referenceCode ||
    details.fullName ||
    "";

  return {
    detail: event.targetDetail || details.referenceCode || "",
    name: name || "—",
  };
}

/** Plain detail rows for the side panel (everything but changes). */
export function detailRows(event) {
  const hidden = new Set(["changes", "tower", "deletedActorId", "staffUserId"]);

  return Object.entries(event.details || {})
    .filter(([key, value]) => !hidden.has(key) && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      label: fieldLabel(key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()),
      value: formatChangeValue(value),
    }));
}

// ---------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------

export const ACTIVITY_CSV_COLUMNS = Object.freeze([
  "Time",
  "Reference",
  "User",
  "Role",
  "Action",
  "Category",
  "Sensitive",
  "Target",
  "Target detail",
  "Tower",
  "Result",
  "IP address",
  "Device",
]);

export function toActivityCsvTable(events) {
  const columns = ACTIVITY_CSV_COLUMNS.map((label, index) => ({ key: `c${index}`, label }));
  const rows = events.map((event) => {
    const target = describeTarget(event);
    const cells = [
      new Date(event.createdAt).toISOString().slice(0, 16).replace("T", " "),
      eventReference(event),
      event.actorName || roleLabel(event.actorRole),
      roleLabel(event.actorRole),
      actionLabel(event.action),
      categoryMeta(event.category).label,
      event.sensitive ? "Yes" : "No",
      target.name,
      target.detail,
      towerText(event.tower),
      event.result === "failed" ? "Failed" : "Success",
      event.ipAddress || "",
      describeDevice(event.userAgent),
    ];

    return Object.fromEntries(cells.map((cell, index) => [`c${index}`, cell]));
  });

  return { columns, rows };
}
