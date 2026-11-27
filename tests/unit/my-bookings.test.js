import { describe, expect, it } from "vitest";
import {
  bookingTab,
  countBookingTabs,
  describeGuestProgress,
  filterBookings,
  groupBookingsByDay,
  nextBookingDay,
  shortAgencyName,
  summariseBookings,
} from "../../src/lib/myBookings.js";

const TODAY = "2026-11-18";

function booking(id, overrides) {
  return {
    bookingId: id,
    guests: [],
    referenceCode: `MTG-${id}`,
    scheduleType: "single",
    startsAt: "10:00",
    title: `Meeting ${id}`,
    ...overrides,
    lastDate: overrides.lastDate || overrides.endsOn || overrides.meetingDate,
    startsOn: overrides.startsOn || overrides.meetingDate,
  };
}

const BOOKINGS = [
  booking("A", { guests: [{ fullName: "Efua Mensah", status: "expected" }], meetingDate: "2026-11-20", status: "pending" }),
  booking("B", { guests: [{ fullName: "Kofi", status: "arrived" }, { fullName: "Ama", status: "waiting" }], meetingDate: TODAY, status: "approved" }),
  booking("C", { meetingDate: "2026-11-10", status: "approved" }),
  booking("D", { meetingDate: "2026-11-25", status: "rejected" }),
  booking("E", { endsOn: "2026-11-30", meetingDate: "2026-11-16", scheduleType: "weekly", recurrenceDays: [1], status: "approved" }),
];

describe("my bookings list", () => {
  it("sorts each booking into one tab", () => {
    expect(BOOKINGS.map((item) => bookingTab(item, TODAY))).toEqual([
      "waiting",
      "approved",
      "past",
      "past",
      "approved",
    ]);
    expect(countBookingTabs(BOOKINGS, TODAY)).toEqual({
      approved: 2,
      past: 2,
      upcoming: 3,
      waiting: 1,
    });
  });

  it("gives the next meeting day of a weekly booking under way", () => {
    // 16 Nov 2026 was a Monday; the next Monday is 23 Nov.
    expect(nextBookingDay(BOOKINGS[4], TODAY)).toBe("2026-11-23");
  });

  it("lists upcoming soonest first and past newest first", () => {
    expect(
      filterBookings(BOOKINGS, { tab: "upcoming", today: TODAY }).map((item) => item.bookingId),
    ).toEqual(["B", "A", "E"]);
    expect(
      filterBookings(BOOKINGS, { tab: "past", today: TODAY }).map((item) => item.bookingId),
    ).toEqual(["D", "C"]);
  });

  it("finds bookings by guest name or reference", () => {
    expect(
      filterBookings(BOOKINGS, { query: "efua", tab: "upcoming", today: TODAY }).map((item) => item.bookingId),
    ).toEqual(["A"]);
    expect(
      filterBookings(BOOKINGS, { query: "mtg-b", tab: "upcoming", today: TODAY }).map((item) => item.bookingId),
    ).toEqual(["B"]);
  });

  it("groups by today and later", () => {
    const upcoming = filterBookings(BOOKINGS, { tab: "upcoming", today: TODAY });

    expect(
      groupBookingsByDay(upcoming, TODAY).map((group) => [group.label, group.bookings.length]),
    ).toEqual([["Today", 1], ["Later", 2]]);
  });

  it("counts the summary figures from upcoming bookings only", () => {
    expect(summariseBookings(BOOKINGS, TODAY)).toEqual({
      approved: { count: 2, next: TODAY },
      guestsExpected: 2,
      waiting: { count: 1, next: "2026-11-20" },
    });
  });

  it("describes guest progress and short agency names", () => {
    expect(describeGuestProgress(BOOKINGS[1].guests)).toBe("1 checked in · 1 expected");
    expect(shortAgencyName("Ministry of Finance (MoF)")).toBe("MoF");
    expect(shortAgencyName("Bank of Ghana")).toBe("Bank of Ghana");
  });
});
