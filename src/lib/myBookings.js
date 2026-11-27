import { addDays, meetingOccursOn } from "./meetingSchedule.js";

// Sorting, filtering and counting for the booker's "My bookings" page.
// Everything works from the list the server returns, with dates as
// YYYY-MM-DD strings in Accra time.

export const BOOKING_TABS = Object.freeze([
  { label: "Upcoming", value: "upcoming" },
  { label: "Waiting", value: "waiting" },
  { label: "Approved", value: "approved" },
  { label: "Past & closed", value: "past" },
]);

const OPEN_STATUSES = new Set(["pending", "approved"]);
const EXPECTED_GUEST_STATUSES = new Set(["expected", "waiting"]);

export function lastBookingDay(booking) {
  return booking.lastDate || booking.endsOn || booking.meetingDate;
}

// Still waiting for an answer, or approved and not over yet.
export function isUpcomingBooking(booking, today) {
  return OPEN_STATUSES.has(booking.status) && lastBookingDay(booking) >= today;
}

// The next day the meeting happens, from today on. A multi-day meeting
// already under way gives its next occurrence; a finished or closed one
// gives its first day.
export function nextBookingDay(booking, today) {
  if (!booking.meetingDate || booking.meetingDate >= today) {
    return booking.meetingDate || "";
  }

  if (!isUpcomingBooking(booking, today)) {
    return booking.meetingDate;
  }

  const schedule = { ...booking, endsOn: lastBookingDay(booking) };

  for (let day = today; day <= schedule.endsOn; day = addDays(day, 1)) {
    if (meetingOccursOn(schedule, day)) {
      return day;
    }
  }

  return booking.meetingDate;
}

export function bookingTab(booking, today) {
  if (!isUpcomingBooking(booking, today)) {
    return "past";
  }

  return booking.status === "pending" ? "waiting" : "approved";
}

function inTab(booking, tab, today) {
  const bookingTabValue = bookingTab(booking, today);

  return tab === "upcoming"
    ? bookingTabValue !== "past"
    : bookingTabValue === tab;
}

export function countBookingTabs(bookings, today) {
  return Object.fromEntries(
    BOOKING_TABS.map(({ value }) => [
      value,
      bookings.filter((booking) => inTab(booking, value, today)).length,
    ]),
  );
}

// Matches the meeting title, the reference code or a guest's name.
export function matchesBookingQuery(booking, query) {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  return [
    booking.title,
    booking.referenceCode,
    ...(booking.guests || []).map((guest) => guest.fullName),
  ].some((value) => String(value || "").toLowerCase().includes(needle));
}

function sortKey(booking, today) {
  return `${nextBookingDay(booking, today)} ${booking.startsAt || ""}`;
}

// Upcoming tabs list the soonest meeting first; past and closed lists
// the most recent first.
export function filterBookings(bookings, { query = "", tab, today }) {
  const matches = bookings.filter(
    (booking) => inTab(booking, tab, today) && matchesBookingQuery(booking, query),
  );
  const direction = tab === "past" ? -1 : 1;

  return matches.sort(
    (left, right) =>
      direction * sortKey(left, today).localeCompare(sortKey(right, today)),
  );
}

const DAY_GROUPS = Object.freeze([
  { key: "today", label: "Today" },
  { key: "later", label: "Later" },
  { key: "earlier", label: "Earlier" },
]);

// Splits an already sorted list into Today, Later and Earlier, keeping
// its order and leaving out empty groups.
export function groupBookingsByDay(bookings, today) {
  const groupOf = (booking) => {
    const day = nextBookingDay(booking, today);

    if (day === today) {
      return "today";
    }

    return day > today ? "later" : "earlier";
  };

  return DAY_GROUPS.map((group) => ({
    ...group,
    bookings: bookings.filter((booking) => groupOf(booking) === group.key),
  })).filter((group) => group.bookings.length > 0);
}

function earliestDay(bookings, today) {
  return bookings
    .map((booking) => nextBookingDay(booking, today))
    .sort()[0] || "";
}

// Figures for the three cards at the top of the page.
export function summariseBookings(bookings, today) {
  const waiting = bookings.filter(
    (booking) => bookingTab(booking, today) === "waiting",
  );
  const approved = bookings.filter(
    (booking) => bookingTab(booking, today) === "approved",
  );
  const guestsExpected = [...waiting, ...approved].reduce(
    (total, booking) =>
      total +
      (booking.guests || []).filter((guest) =>
        EXPECTED_GUEST_STATUSES.has(guest.status),
      ).length,
    0,
  );

  return {
    approved: { count: approved.length, next: earliestDay(approved, today) },
    guestsExpected,
    waiting: { count: waiting.length, next: earliestDay(waiting, today) },
  };
}

// "3 checked in · 11 expected", leaving out counts of zero.
export function describeGuestProgress(guests) {
  const count = (statuses) =>
    guests.filter((guest) => statuses.includes(guest.status)).length;
  const parts = [
    [count(["arrived"]), "checked in"],
    [count(["checked_out"]), "checked out"],
    [count(["expected", "waiting"]), "expected"],
    [count(["did_not_arrive"]), "did not arrive"],
  ];

  return parts
    .filter(([total]) => total > 0)
    .map(([total, label]) => `${total} ${label}`)
    .join(" · ");
}

// "Ministry of Finance (MoF)" -> "MoF"; other agency names stay whole.
export function shortAgencyName(agency) {
  const match = /\(([^)]+)\)\s*$/.exec(agency || "");
  return match ? match[1] : agency || "";
}
