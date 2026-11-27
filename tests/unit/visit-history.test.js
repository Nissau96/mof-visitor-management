import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  addVisitorDetails: vi.fn(async (_client, visits) => visits),
  getAdminClient: vi.fn(),
  requireActiveStaff: vi.fn(),
}));

vi.mock("../../api/_lib/staffAuth.js", async (importOriginal) => ({
  ...(await importOriginal()),
  requireActiveStaff: dependencies.requireActiveStaff,
}));

vi.mock("../../api/_lib/supabase.js", () => ({
  getAdminClient: dependencies.getAdminClient,
}));

vi.mock("../../api/_lib/visitDetails.js", () => ({
  addVisitorDetails: dependencies.addVisitorDetails,
}));

import historyHandler from "../../api/staff/history.js";
import {
  csvFileName,
  formatDuration,
  formatRange,
  formatShortDate,
  formatSpacedPhone,
  formatTime,
  getCardNote,
  getMeetingCode,
  getVisitState,
  getVisiting,
  minutesOnSite,
  presetForRange,
  presetRange,
  rangeError,
  toCsvRows,
} from "../../src/lib/visitHistory.js";
import { HISTORY_EXPORT_LIMIT, visitHistorySchema } from "../../src/validation/staffVisits.js";

const VISIT = {
  agency: "Ministry of Finance (MoF)",
  cardNumber: "MOF-V088",
  cardStatus: "returned",
  checkedInAt: "2026-11-18T11:05:00.000Z",
  checkedOutAt: "2026-11-18T14:40:00.000Z",
  division: "Tax Policy Unit",
  email: "kofi@example.invalid",
  fullName: "Kofi Adjei",
  meetingTitle: "",
  organization: "Ghana Revenue Authority",
  personVisiting: "Yaw Darko",
  phone: "+233209874411",
  purpose: "Official",
  reference: "VIS-3B88E0",
  status: "checked_out",
  tower: "tower_2",
  visitId: "00000000-0000-4000-8001-000000000001",
};

describe("date presets", () => {
  // Friday 20 November 2026.
  const TODAY = "2026-11-20";

  it("covers today, yesterday, the week from Monday and the months", () => {
    expect(presetRange("today", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(presetRange("yesterday", TODAY)).toEqual({ from: "2026-11-19", to: "2026-11-19" });
    expect(presetRange("week", TODAY)).toEqual({ from: "2026-11-16", to: TODAY });
    expect(presetRange("month", TODAY)).toEqual({ from: "2026-11-01", to: TODAY });
    expect(presetRange("last-month", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("last-month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("custom", TODAY, { from: "2026-08-01", to: "" })).toEqual({ from: "2026-08-01", to: "" });
  });

  it("treats a Sunday as the end of the week, not the start", () => {
    expect(presetRange("week", "2026-11-22")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(presetRange("week", "2026-11-16")).toEqual({ from: "2026-11-16", to: "2026-11-16" });
  });

  it("maps handed-over dates back to a preset", () => {
    expect(presetForRange(TODAY, TODAY, TODAY)).toBe("today");
    expect(presetForRange("2026-11-01", TODAY, TODAY)).toBe("month");
    expect(presetForRange("2026-11-02", TODAY, TODAY)).toBe("custom");
  });

  it("rejects a reversed or over-long custom range", () => {
    expect(rangeError("2026-08-20", "2026-08-10")).toBe("The end date is before the start date.");
    expect(rangeError("2025-01-01", "2026-11-20")).toMatch(/one year or less/);
    expect(rangeError("2026-08-01", "2026-08-31")).toBe("");
    expect(rangeError("", "")).toBe("");
  });

  it("describes the range for the summary row", () => {
    expect(formatRange("2026-11-01", TODAY)).toBe("1 – 20 Nov 2026");
    expect(formatRange("2026-10-28", TODAY)).toBe("28 Oct – 20 Nov 2026");
    expect(formatRange(TODAY, TODAY)).toBe("20 Nov 2026");
    expect(formatRange("", "")).toBe("All dates");
  });
});

describe("visit status", () => {
  it("reads the state from check-out and the card's return", () => {
    expect(getVisitState(VISIT)).toBe("checked_out");
    expect(getVisitState({ ...VISIT, checkedOutAt: null, status: "checked_in" })).toBe("checked_in");
    expect(getVisitState({ ...VISIT, cardStatus: "not_returned" })).toBe("not_returned");
    expect(getVisitState({ ...VISIT, checkedInAt: null, status: "cancelled" })).toBe("cancelled");
  });

  it("explains where the card is", () => {
    expect(getCardNote(VISIT)).toBe("Returned at check-out");
    expect(getCardNote({ ...VISIT, checkedOutAt: null, status: "checked_in" })).toBe("With the visitor now");
    expect(getCardNote({ ...VISIT, cardStatus: "not_returned" })).toMatch(/^Not returned at check-out/);
    expect(getCardNote({ ...VISIT, cardNumber: null })).toBe("No card was assigned for this visit");
  });
});

describe("display formats", () => {
  it("formats Ghana dates, times and durations", () => {
    expect(formatShortDate(VISIT.checkedInAt)).toBe("Wed 18 Nov");
    expect(formatTime(VISIT.checkedInAt)).toBe("11:05 am");
    expect(formatTime("2026-11-19T18:14:00Z")).toBe("6:14 pm");
    expect(formatTime("2026-11-19T00:05:00Z")).toBe("12:05 am");
    expect(minutesOnSite(VISIT)).toBe(215);
    expect(formatDuration(215)).toBe("3h 35m");
    expect(formatDuration(35)).toBe("35m");
    expect(formatDuration(3000)).toBe("2d 2h");
    expect(minutesOnSite({ ...VISIT, checkedOutAt: null }, Date.parse("2026-11-18T11:40:00Z"))).toBe(35);
  });

  it("spaces Ghana phone numbers and leaves others alone", () => {
    expect(formatSpacedPhone("+233205553737")).toBe("+233 20 555 3737");
    expect(formatSpacedPhone("+447700900123")).toBe("+447700900123");
  });

  it("shows the meeting title for meeting guests and their meeting code", () => {
    const guest = { ...VISIT, bookedGuest: true, meetingTitle: "Budget Seminar", purpose: "Meeting", reference: "MTG-6C2EB0-2" };

    expect(getVisiting(guest)).toBe("Budget Seminar");
    expect(getVisiting(VISIT)).toBe("Yaw Darko");
    expect(getMeetingCode(guest)).toBe("MTG-6C2EB0");
    expect(getMeetingCode(VISIT)).toBe("");
  });
});

describe("CSV export", () => {
  it("writes one row per visit in the documented column order", () => {
    const [row] = toCsvRows([VISIT]);

    expect(row).toEqual([
      "Kofi Adjei",
      "VIS-3B88E0",
      "Ghana Revenue Authority",
      "Official",
      "Yaw Darko",
      "Tax Policy Unit",
      "Ministry of Finance (MoF)",
      "Tower 2",
      "2026-11-18 11:05",
      "2026-11-18 14:40",
      215,
      "MOF-V088",
      "Yes",
      "+233209874411",
      "kofi@example.invalid",
    ]);
  });

  it("marks cards kept, still with the visitor, or never issued", () => {
    const rows = toCsvRows([
      { ...VISIT, cardStatus: "not_returned" },
      { ...VISIT, checkedOutAt: null, status: "checked_in" },
      { ...VISIT, cardNumber: null },
    ]);

    expect(rows.map((row) => row[12])).toEqual(["No", "With visitor", ""]);
    expect(rows[1][9]).toBe("");
    expect(rows[1][10]).toBe("");
  });

  it("names the file after the range", () => {
    expect(csvFileName("2026-11-01", "2026-11-20")).toBe("visit-history-2026-11-01-to-2026-11-20.csv");
  });
});

describe("visit history API", () => {
  const rpc = vi.fn();

  function request(path, body) {
    return new Request(`http://localhost${path}`, {
      body: JSON.stringify(body),
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      method: "POST",
    });
  }

  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({
      data: { pagination: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 }, visits: [VISIT] },
      error: null,
    });
    dependencies.getAdminClient.mockReturnValue({ rpc });
    dependencies.requireActiveStaff.mockResolvedValue({
      profile: { active: true, role: "receptionist", tower: "tower_2", userId: "00000000-0000-4000-8000-000000000009" },
    });
  });

  it("passes purpose and sort to the database", async () => {
    const response = await historyHandler.fetch(
      request("/api/staff/history", { direction: "asc", purpose: "Official", sort: "visitor", tower: "tower_2" }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "get_visit_history",
      expect.objectContaining({
        p_direction: "asc",
        p_page_size: 10,
        p_purpose: "Official",
        p_sort: "visitor",
      }),
    );
  });

  it("defaults to newest first by check-in", () => {
    const parsed = visitHistorySchema.parse({ tower: "tower_2" });
    expect(parsed).toMatchObject({ dateBasis: "check_in", direction: "desc", purpose: "", sort: "date" });
  });

  it("dates and sorts by check-out for the Visitor Cards list", async () => {
    const response = await historyHandler.fetch(
      request("/api/staff/history", {
        dateBasis: "check_out",
        dateFrom: "2026-11-20",
        dateTo: "2026-11-20",
        status: "checked_out",
        tower: "tower_2",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "get_visit_history",
      expect.objectContaining({
        p_date_basis: "check_out",
        p_date_from: "2026-11-20",
        p_status: "checked_out",
      }),
    );
  });

  it("rejects an unknown date basis", () => {
    expect(visitHistorySchema.safeParse({ dateBasis: "created" }).success).toBe(false);
  });

  it("rejects an unknown sort", async () => {
    const response = await historyHandler.fetch(request("/api/staff/history", { sort: "phone", tower: "tower_2" }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps on-screen pages at ten rows", async () => {
    const response = await historyHandler.fetch(request("/api/staff/history", { pageSize: 500, tower: "tower_2" }));
    expect(response.status).toBe(400);
  });

  it("exports every matching row up to the limit in one call", async () => {
    const response = await historyHandler.fetch(
      request("/api/staff/history?operation=export", { page: 3, pageSize: 10, tower: "tower_2" }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "get_visit_history",
      expect.objectContaining({ p_page: 1, p_page_size: HISTORY_EXPORT_LIMIT }),
    );
  });
});
