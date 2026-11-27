// Pure helpers for the Visit History page: date presets, row status,
// display formats and the CSV export. Times are Ghana time (GMT, no
// daylight saving), so UTC formatting gives Accra wall-clock values.

import { getTowerLabel } from "../constants/visitorOptions.js";

export const DATE_PRESETS = Object.freeze([
  Object.freeze({ label: "Today", value: "today" }),
  Object.freeze({ label: "Yesterday", value: "yesterday" }),
  Object.freeze({ label: "This week", value: "week" }),
  Object.freeze({ label: "Current month", value: "month" }),
  Object.freeze({ label: "Last month", value: "last-month" }),
  Object.freeze({ label: "Custom range", value: "custom" }),
]);

export const DEFAULT_PRESET = "month";

const PRESET_VALUES = new Set(DATE_PRESETS.map((preset) => preset.value));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isDatePreset(value) {
  return PRESET_VALUES.has(value);
}

export function accraToday(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function parseIsoDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/**
 * The check-in date range for a preset, as { from, to } ISO dates.
 * "This week" runs Monday to today. A custom range passes its own dates
 * through (either may be empty).
 */
export function presetRange(preset, today, custom = {}) {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "week": {
      const weekday = parseIsoDate(today).getUTCDay();
      return { from: addDays(today, -((weekday + 6) % 7)), to: today };
    }
    case "last-month": {
      const firstOfMonth = `${today.slice(0, 8)}01`;
      const lastOfPrevious = addDays(firstOfMonth, -1);
      return { from: `${lastOfPrevious.slice(0, 8)}01`, to: lastOfPrevious };
    }
    case "custom":
      return { from: custom.from || "", to: custom.to || "" };
    default:
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

/**
 * The preset whose range is exactly from..to, or "custom". Links from the
 * dashboard and reports pass plain dates; this shows them as a preset.
 */
export function presetForRange(from, to, today) {
  for (const { value } of DATE_PRESETS) {
    if (value === "custom") {
      continue;
    }

    const range = presetRange(value, today);

    if (range.from === from && range.to === to) {
      return value;
    }
  }

  return "custom";
}

/** An error message for a custom range, or "" when it is usable. */
export function rangeError(from, to) {
  if (from && to && from > to) {
    return "The end date is before the start date.";
  }

  if (from && to && (parseIsoDate(to) - parseIsoDate(from)) / 86_400_000 > 366) {
    return "Pick a range of one year or less.";
  }

  return "";
}

/** "1 Nov – 20 Nov 2026", "1 – 20 Nov 2026" or "20 Nov 2026". */
export function formatRange(from, to) {
  if (!from && !to) {
    return "All dates";
  }

  if (!from || !to) {
    return from ? `From ${formatLongDate(from)}` : `Up to ${formatLongDate(to)}`;
  }

  if (from === to) {
    return formatLongDate(from);
  }

  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  const left = sameMonth
    ? `${start.getUTCDate()}`
    : sameYear
      ? `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`
      : formatLongDate(from);

  return `${left} – ${formatLongDate(to)}`;
}

function formatLongDate(iso) {
  const date = parseIsoDate(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------
// Row display
// ---------------------------------------------------------------------

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Thu 19 Nov" */
export function formatShortDate(value) {
  const date = toDate(value);
  return date
    ? `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
    : "";
}

/** "Thu 19 Nov 2026" */
export function formatFullDate(value) {
  const date = toDate(value);
  return date ? `${formatShortDate(value)} ${date.getUTCFullYear()}` : "";
}

/** "11 Nov" */
export function formatDayMonth(value) {
  const date = toDate(value);
  return date ? `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}` : "";
}

/** "6:14 pm" */
export function formatTime(value) {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  const hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "pm" : "am"}`;
}

/** "20 Nov 2026, 8:39 am" */
export function formatUpdated(value) {
  const date = toDate(value);
  return date ? `${formatDayMonth(value)} ${date.getUTCFullYear()}, ${formatTime(value)}` : "";
}

export function sameAccraDay(first, second) {
  const a = toDate(first);
  const b = toDate(second);
  return Boolean(a && b && toIsoDate(a) === toIsoDate(b));
}

/** Whole minutes on site; to now while the visitor is still inside. */
export function minutesOnSite(visit, now = Date.now()) {
  const checkedIn = toDate(visit.checkedInAt);

  if (!checkedIn) {
    return null;
  }

  const end = toDate(visit.checkedOutAt)?.getTime() ?? now;
  return Math.max(0, Math.round((end - checkedIn.getTime()) / 60_000));
}

/** "3h 35m", "35m" or "2d 4h". */
export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) {
    return "";
  }

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;

  if (days) {
    return `${days}d ${hours}h`;
  }

  return hours ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${rest}m`;
}

/** "+233 20 555 3737" for Ghana numbers; anything else as given. */
export function formatSpacedPhone(phone) {
  const value = String(phone || "");

  if (/^\+233\d{9}$/.test(value)) {
    return `${value.slice(0, 4)} ${value.slice(4, 6)} ${value.slice(6, 9)} ${value.slice(9)}`;
  }

  return value;
}

export function getInitials(fullName) {
  return String(fullName || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/** The host for a regular visit, or the meeting title for a meeting. */
export function getVisiting(visit) {
  if (visit.purpose === "Meeting") {
    return visit.meetingTitle || visit.personVisiting || "Meeting";
  }

  return visit.personVisiting || "Not given";
}

/** "MTG-6C2EB0" from a meeting guest's reference "MTG-6C2EB0-2". */
export function getMeetingCode(visit) {
  const reference = String(visit.reference || "");

  if (!visit.bookedGuest && !reference.startsWith("MTG-")) {
    return "";
  }

  return reference.split("-").slice(0, 2).join("-");
}

/** "Ministry of Finance (MoF)" -> "MoF" */
export function agencyShortName(agency) {
  return String(agency || "").match(/\(([^)]+)\)\s*$/)?.[1] || agency;
}

export function isVip(visit) {
  return visit.visitorType === "vip";
}

export const VISIT_STATES = Object.freeze({
  cancelled: Object.freeze({ label: "Cancelled", tone: "cancelled" }),
  checked_in: Object.freeze({ label: "Checked in", tone: "in" }),
  checked_out: Object.freeze({ label: "Checked out", tone: "out" }),
  not_returned: Object.freeze({ label: "Card not returned", tone: "kept" }),
});

/**
 * checked_in (no check-out yet), not_returned (out, card kept),
 * checked_out, or cancelled (turned away before a card).
 */
export function getVisitState(visit) {
  if (visit.status === "cancelled") {
    return "cancelled";
  }

  if (!visit.checkedOutAt) {
    return "checked_in";
  }

  return visit.cardStatus === "not_returned" ? "not_returned" : "checked_out";
}

export function getCardNote(visit) {
  if (!visit.cardNumber) {
    return visit.status === "cancelled"
      ? "The visit was cancelled before a card was assigned"
      : "No card was assigned for this visit";
  }

  switch (getVisitState(visit)) {
    case "checked_in":
      return "With the visitor now";
    case "not_returned":
      return "Not returned at check-out. Follow up with the visitor or host.";
    default:
      return "Returned at check-out";
  }
}

// ---------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------

export const CSV_COLUMNS = Object.freeze([
  "Visitor",
  "Reference",
  "Organisation",
  "Purpose",
  "Visiting",
  "Division",
  "Agency",
  "Tower",
  "Check-in",
  "Check-out",
  "Duration (min)",
  "Card",
  "Card returned",
  "Phone",
  "Email",
]);

/** "2026-11-19 18:14" in Ghana time, or "". */
function csvDateTime(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 16).replace("T", " ") : "";
}

function cardReturned(visit) {
  if (!visit.cardNumber) {
    return "";
  }

  if (!visit.checkedOutAt) {
    return "With visitor";
  }

  return visit.cardStatus === "not_returned" ? "No" : "Yes";
}

/** One array of cell values per visit, in CSV_COLUMNS order. */
export function toCsvRows(visits) {
  return visits.map((visit) => [
    visit.fullName,
    visit.reference,
    visit.organization || "",
    visit.purpose,
    getVisiting(visit),
    visit.division || "",
    visit.agency,
    getTowerLabel(visit.tower),
    csvDateTime(visit.checkedInAt),
    csvDateTime(visit.checkedOutAt),
    visit.checkedOutAt ? minutesOnSite(visit) : "",
    visit.cardNumber || "",
    cardReturned(visit),
    visit.phone || "",
    visit.email || "",
  ]);
}

/** Columns and keyed rows for reportExport's downloadCsv. */
export function toCsvTable(visits) {
  const columns = CSV_COLUMNS.map((label, index) => ({ key: `c${index}`, label }));
  const rows = toCsvRows(visits).map((cells) =>
    Object.fromEntries(cells.map((cell, index) => [`c${index}`, cell])),
  );

  return { columns, rows };
}

export function csvFileName(from, to) {
  return `visit-history-${from || "start"}-to-${to || "today"}.csv`;
}
