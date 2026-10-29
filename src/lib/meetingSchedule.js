// Date helpers for meeting schedules. Dates are YYYY-MM-DD strings on the
// Accra calendar (UTC+0), so plain UTC arithmetic is safe.

const DAY_MS = 86_400_000;

export const WEEKDAYS = Object.freeze([
  Object.freeze({ label: "Mon", long: "Monday", value: 1 }),
  Object.freeze({ label: "Tue", long: "Tuesday", value: 2 }),
  Object.freeze({ label: "Wed", long: "Wednesday", value: 3 }),
  Object.freeze({ label: "Thu", long: "Thursday", value: 4 }),
  Object.freeze({ label: "Fri", long: "Friday", value: 5 }),
  Object.freeze({ label: "Sat", long: "Saturday", value: 6 }),
  Object.freeze({ label: "Sun", long: "Sunday", value: 0 }),
]);

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const shortDateWithYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const weekdayDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  weekday: "short",
  year: "numeric",
});

export function toDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate, days) {
  return toIsoDate(
    new Date(toDate(isoDate).getTime() + days * DAY_MS),
  );
}

export function dayOfWeek(isoDate) {
  return toDate(isoDate).getUTCDay();
}

// Mirrors public.meeting_occurs_on in the database.
export function meetingOccursOn(meeting, isoDate) {
  if (
    meeting.startsOn > isoDate ||
    (meeting.endsOn && meeting.endsOn < isoDate)
  ) {
    return false;
  }

  if (meeting.scheduleType === "single") {
    return meeting.startsOn === isoDate;
  }

  if (meeting.scheduleType === "weekly") {
    return (meeting.recurrenceDays || []).includes(
      dayOfWeek(isoDate),
    );
  }

  return true;
}

// The Monday-to-Sunday weeks covering a month, as YYYY-MM-DD dates.
export function getMonthGrid(monthIso) {
  const first = `${monthIso.slice(0, 7)}-01`;
  const offset = (dayOfWeek(first) + 6) % 7;
  const start = addDays(first, -offset);

  const nextMonth = toDate(first);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const last = addDays(toIsoDate(nextMonth), -1);
  const endOffset = (7 - dayOfWeek(last)) % 7;
  const end = addDays(last, endOffset);

  const days = [];

  for (
    let day = start;
    day <= end;
    day = addDays(day, 1)
  ) {
    days.push(day);
  }

  return { days, end, start };
}

export function shiftMonth(monthIso, months) {
  const date = toDate(`${monthIso.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toIsoDate(date);
}

export function formatDate(isoDate, { weekday = false } = {}) {
  return isoDate
    ? (weekday ? weekdayDate : shortDateWithYear).format(
        toDate(isoDate),
      )
    : "";
}

export function formatSchedule(meeting) {
  if (meeting.scheduleType === "single") {
    return formatDate(meeting.startsOn, { weekday: true });
  }

  if (meeting.scheduleType === "continuous") {
    return meeting.endsOn
      ? `${shortDate.format(toDate(meeting.startsOn))} – ${formatDate(meeting.endsOn)}`
      : `From ${formatDate(meeting.startsOn)}`;
  }

  const days = WEEKDAYS.filter((day) =>
    (meeting.recurrenceDays || []).includes(day.value),
  )
    .map((day) => day.label)
    .join(", ");

  return meeting.endsOn
    ? `Every ${days} until ${formatDate(meeting.endsOn)}`
    : `Every ${days} from ${formatDate(meeting.startsOn)}`;
}

export function formatTimeRange(meeting) {
  if (meeting.startsAt && meeting.endsAt) {
    return `${meeting.startsAt} – ${meeting.endsAt}`;
  }

  return meeting.startsAt ? `From ${meeting.startsAt}` : "";
}

// Label for a meeting in the visitor form: title, then time and venue
// when reception has set them.
export function formatMeetingOption(meeting) {
  return [
    meeting.title,
    formatTimeRange(meeting),
    meeting.venue || "",
  ]
    .filter(Boolean)
    .join(" · ");
}
