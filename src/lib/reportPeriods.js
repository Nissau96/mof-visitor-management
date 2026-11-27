import { getAccraIsoDate } from "./accraDate.js";
import { addDays } from "./meetingSchedule.js";
import { MINISTRY_OF_FINANCE_AGENCY } from "../constants/visitorOptions.js";

export const REPORT_PERIODS = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7days" },
  { label: "This month", value: "month" },
  { label: "Quarter", value: "quarter" },
  { label: "Custom", value: "custom" },
];

export const REPORT_PERIOD_VALUES = REPORT_PERIODS.map(
  (period) => period.value,
);

export const MAX_REPORT_DAYS = 366;

// First and last Accra date of a reporting period. Month and quarter
// run to today, not to the end of the month.
export function getPeriodRange(period, custom = {}, today = getAccraIsoDate()) {
  const [year, month] = today.split("-").map(Number);

  switch (period) {
    case "today":
      return { from: today, to: today };
    case "7days":
      return { from: addDays(today, -6), to: today };
    case "quarter": {
      const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;

      return {
        from: `${year}-${String(quarterMonth).padStart(2, "0")}-01`,
        to: today,
      };
    }
    case "custom":
      return {
        from: custom.from || today,
        to: custom.to || today,
      };
    default:
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

export function countDays(from, to) {
  return (
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000,
    ) + 1
  );
}

// "" when the custom range is usable, otherwise what to fix.
export function checkCustomRange({ from, to }) {
  if (!from || !to) {
    return "Choose a start and an end date.";
  }

  if (from > to) {
    return "The start date must be on or before the end date.";
  }

  if (countDays(from, to) > MAX_REPORT_DAYS) {
    return `Choose a period of ${MAX_REPORT_DAYS} days or fewer.`;
  }

  return "";
}

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function toUtcDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

// "1 to 13 Nov 2026", "28 Oct to 13 Nov 2026" or "13 Nov 2026".
export function formatRange(from, to) {
  if (from === to) {
    return dayMonthYear.format(toUtcDate(from));
  }

  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const start = sameMonth
    ? String(Number(from.slice(8)))
    : sameYear
      ? dayMonth.format(toUtcDate(from))
      : dayMonthYear.format(toUtcDate(from));

  return `${start} to ${dayMonthYear.format(toUtcDate(to))}`;
}

export function formatShortDate(isoDate) {
  return dayMonth.format(toUtcDate(isoDate));
}

// Whole-number percentage change, or null when there is nothing to
// compare against.
export function percentChange(current, previous) {
  const now = Number(current);
  const before = Number(previous);

  if (!Number.isFinite(now) || !Number.isFinite(before) || before <= 0) {
    return null;
  }

  return Math.round(((now - before) / before) * 100);
}

// 91 -> "1h 31m", 4 -> "4 min", null -> "—".
export function formatMinutes(minutes) {
  const value = Number(minutes);

  if (minutes === null || minutes === undefined || !Number.isFinite(value)) {
    return "—";
  }

  if (value < 60) {
    return `${Math.round(value)} min`;
  }

  const hours = Math.floor(value / 60);
  const rest = Math.round(value % 60);

  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

// Short agency name for chart axes: "MoF" for the Ministry, otherwise
// the stored code.
export function shortAgency(agency) {
  return agency === MINISTRY_OF_FINANCE_AGENCY ? "MoF" : agency;
}
