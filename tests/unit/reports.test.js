import { describe, expect, it } from "vitest";
import { analyticsRequestSchema } from "../../src/validation/analytics.js";
import { buildCsuTable, buildVisitLog } from "../../src/lib/reportBuilders.js";
import { toCsv } from "../../src/lib/reportExport.js";
import {
  checkCustomRange,
  formatMinutes,
  formatRange,
  getPeriodRange,
  percentChange,
} from "../../src/lib/reportPeriods.js";

describe("report periods", () => {
  const today = "2026-11-13";

  it("runs month and quarter to today", () => {
    expect(getPeriodRange("today", {}, today)).toEqual({ from: today, to: today });
    expect(getPeriodRange("7days", {}, today)).toEqual({ from: "2026-11-07", to: today });
    expect(getPeriodRange("month", {}, today)).toEqual({ from: "2026-11-01", to: today });
    expect(getPeriodRange("quarter", {}, today)).toEqual({ from: "2026-10-01", to: today });
  });

  it("checks custom ranges", () => {
    expect(checkCustomRange({ from: "2026-11-01", to: "2026-11-13" })).toBe("");
    expect(checkCustomRange({ from: "2026-11-14", to: "2026-11-13" })).toMatch(/on or before/);
    expect(checkCustomRange({ from: "2025-11-12", to: "2026-11-13" })).toMatch(/366 days/);
    expect(checkCustomRange({ from: "2025-11-13", to: "2026-11-13" })).toBe("");
  });

  it("formats ranges, durations and changes", () => {
    expect(formatRange("2026-11-01", "2026-11-13")).toBe("1 to 13 Nov 2026");
    expect(formatRange("2026-10-28", "2026-11-13")).toBe("28 Oct to 13 Nov 2026");
    expect(formatMinutes(91)).toBe("1h 31m");
    expect(formatMinutes(4)).toBe("4 min");
    expect(formatMinutes(null)).toBe("—");
    expect(percentChange(250, 231)).toBe(8);
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe("analytics request validation", () => {
  it("accepts the three report kinds and rejects bad input", () => {
    expect(
      analyticsRequestSchema.safeParse({
        dateFrom: "2026-11-01",
        dateTo: "2026-11-13",
        report: "overview",
      }).success,
    ).toBe(true);
    expect(analyticsRequestSchema.safeParse({ month: 4, report: "csu-month", year: 2026 }).success).toBe(true);
    expect(
      analyticsRequestSchema.safeParse({
        agency: "Unknown agency",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-13",
        report: "visits",
      }).success,
    ).toBe(false);
    expect(
      analyticsRequestSchema.safeParse({
        dateFrom: "2025-01-01",
        dateTo: "2026-11-13",
        report: "overview",
      }).success,
    ).toBe(false);
  });
});

describe("report exports", () => {
  it("escapes CSV cells and neutralises formulas", () => {
    const csv = toCsv(
      [
        { key: "name", label: "Name" },
        { key: "count", label: "Count" },
      ],
      [
        { count: -3, name: "=SUM(A1)" },
        { count: 2, name: "Osei, \"Lana\"" },
      ],
    );

    expect(csv).toBe("Name,Count\r\n'=SUM(A1),-3\r\n\"Osei, \"\"Lana\"\"\",2");
  });

  it("builds the Client Service Unit grid with every purpose", () => {
    const table = buildCsuTable({
      cells: [
        { purpose: "Meeting", visits: 5, week: 1 },
        { purpose: "Meeting", visits: 9, week: 2 },
        { purpose: "Follow up", visits: 2, week: 2 },
      ],
      month: 11,
      weeks: [
        { end: "2026-11-06", start: "2026-11-02", week: 1 },
        { end: "2026-11-13", start: "2026-11-09", week: 2 },
      ],
      year: 2026,
    });

    expect(table.total).toBe(16);
    expect(table.weekTotals).toEqual([5, 11]);
    expect(table.busiest).toEqual({ count: 11, label: "Week 2" });
    expect(table.top).toEqual({ count: 14, purpose: "Meeting" });
    expect(table.rows.map((row) => row.purpose)).toContain("Official");
    expect(table.rows.find((row) => row.purpose === "Meeting")).toMatchObject({
      line: "Official meeting",
      peakIndex: 1,
      share: 88,
    });
  });

  it("notes when a visit log is cut short", () => {
    const report = buildVisitLog({
      data: { totalCount: 6000, truncated: true, visits: [] },
      range: { from: "2026-01-01", to: "2026-11-13" },
      scope: { agency: "", tower: "tower_1" },
      title: "Visit log",
    });

    expect(report.footer).toMatch(/latest 0 of 6000/);
    expect(report.subtitle).toBe("1 Jan to 13 Nov 2026 · All agencies · Tower 1");
  });
});
