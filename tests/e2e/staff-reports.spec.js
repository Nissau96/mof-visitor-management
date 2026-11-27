import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/accessibility.js";
import {
  installMockStaffAuthentication,
  signInAsStaff,
} from "./support/staff-authentication.js";
import { chooseOption } from "./support/select.js";

const NOW = "2026-11-13T10:00:00.000Z";

function daily(from, days) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(`${from}T00:00:00Z`);

    date.setUTCDate(date.getUTCDate() + index);

    return {
      date: date.toISOString().slice(0, 10),
      previous: 10 + ((index * 5) % 12),
      visits: index === 2 ? 35 : 12 + ((index * 7) % 15),
    };
  });
}

function overview(body) {
  const days =
    (Date.parse(`${body.dateTo}T00:00:00Z`) - Date.parse(`${body.dateFrom}T00:00:00Z`)) /
      86_400_000 +
    1;

  return {
    agencies: [
      { agency: "Ministry of Finance (MoF)", visits: 95 },
      { agency: "GIFMIS", visits: 41 },
      { agency: "PPA", visits: 35 },
    ],
    cards: { assigned: 21, available: 76, incidents: 3 },
    daily: daily(body.dateFrom, days),
    heatmap: [
      { day: 2, hour: 10, visits: 18 },
      { day: 4, hour: 10, visits: 12 },
      { day: 1, hour: 14, visits: 4 },
    ],
    hosts: [
      { division: "Budget Division", name: "Lana Osei", visits: 22 },
      { division: "Treasury Division", name: "Efua Addo", visits: 14 },
    ],
    onSiteNow: 19,
    previousTotals: {
      averageDurationMinutes: 95,
      cardsIssued: 248,
      checkouts: 278,
      newVisitors: 66,
      returningVisitors: 169,
      uniqueVisitors: 231,
      visits: 299,
    },
    purposes: [
      { purpose: "Meeting", visits: 108 },
      { purpose: "Official", visits: 57 },
      { purpose: "Follow up", visits: 44 },
    ],
    totals: {
      averageDurationMinutes: 91,
      averageWaitMinutes: 4,
      cardsIssued: 263,
      checkouts: 298,
      longestDurationMinutes: 559,
      newVisitors: 74,
      returningVisitors: 176,
      uniqueVisitors: 250,
      visits: 317,
    },
    towers: [
      { tower: "tower_1", visits: 316 },
      { tower: "tower_2", visits: 372 },
    ],
  };
}

const CSU = {
  cells: [
    { purpose: "Meeting", visits: 112, week: 1 },
    { purpose: "Meeting", visits: 131, week: 2 },
    { purpose: "Follow up", visits: 29, week: 2 },
    { purpose: "PUD / Delivery", visits: 14, week: 1 },
  ],
  month: 11,
  weeks: [
    { end: "2026-11-06", start: "2026-11-02", week: 1 },
    { end: "2026-11-13", start: "2026-11-09", week: 2 },
  ],
  year: 2026,
};

const EXPORT_VISITS = {
  totalCount: 1,
  truncated: false,
  visits: [
    {
      agency: "PPA",
      cardNumber: "MOF-V001",
      checkedInAt: "2026-11-13T08:43:00.000Z",
      checkedOutAt: "2026-11-13T10:20:00.000Z",
      division: "",
      organization: "=HYPERLINK(\"bad\")",
      personVisiting: "Lana Osei",
      purpose: "Follow up",
      reference: "VIS-28D05DCF",
      status: "checked_out",
      tower: "tower_1",
      visitorName: "Jack Halidu",
    },
  ],
};

const HISTORY = {
  generatedAt: NOW,
  pagination: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
  staffRole: "receptionist",
  towerScope: "tower_1",
  visits: [
    {
      agency: "PPA",
      cardNumber: "MOF-V001",
      cardStatus: "returned",
      checkedInAt: "2026-11-13T08:43:00.000Z",
      checkedOutAt: "2026-11-13T10:20:00.000Z",
      division: "Budget Division",
      fullName: "Jack Halidu",
      personVisiting: "Lana Osei",
      purpose: "Follow up",
      reference: "VIS-28D05DCF",
      status: "checked_out",
      tower: "tower_1",
      visitId: "00000000-0000-4000-8009-000000000001",
    },
  ],
};

async function installMockReportsApi(page) {
  const state = { analytics: [], history: [] };

  await page.route("**/api/staff/dashboard?operation=analytics", async (route) => {
    const body = route.request().postDataJSON();

    state.analytics.push(body);

    const payload =
      body.report === "csu-month"
        ? { ...CSU, month: body.month, year: body.year }
        : body.report === "visits"
          ? EXPORT_VISITS
          : overview(body);

    await route.fulfill({
      body: JSON.stringify({ ...payload, report: body.report, towerScope: body.tower || null }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/api/staff/history", async (route) => {
    state.history.push(route.request().postDataJSON());

    await route.fulfill({
      body: JSON.stringify(HISTORY),
      contentType: "application/json",
      status: 200,
    });
  });

  return state;
}

test.describe("analytics and reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
  });

  test("shows the receptionist's tower figures without accessibility or overflow problems", async ({
    page,
  }) => {
    await installMockStaffAuthentication(page);
    const state = await installMockReportsApi(page);

    await signInAsStaff(page, { destination: "/staff/reports" });

    await expect(page.getByRole("heading", { name: "Analytics & Reports" })).toBeVisible();
    await expect(page.getByText("Tower 1 · your assigned tower")).toBeVisible();
    await expect(page.getByText("1 to 13 Nov 2026")).toBeVisible();

    const kpis = page.getByRole("region", { name: "Headline figures" });

    await expect(kpis.getByText("250", { exact: true })).toBeVisible();
    await expect(kpis.getByText("1h 31m")).toBeVisible();
    await expect(kpis.getByText("+8%")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Tower 1 visitors" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Client Service Unit monthly report" })).toBeVisible();
    await expect(page.getByText("Jack Halidu", { exact: true })).toBeVisible();

    expect(state.analytics[0]).toEqual({
      agency: "",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-13",
      report: "overview",
      tower: "tower_1",
    });
    expect(state.analytics.some((body) => body.report === "csu-month" && body.month === 11)).toBe(true);
    expect(state.history[0]).toMatchObject({ dateFrom: "2026-11-01", dateTo: "2026-11-13", tower: "tower_1" });

    await expectNoWcagViolations(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    expect(overflow).toBe(false);
  });

  test("keeps the period and agency in the URL and refetches", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const state = await installMockReportsApi(page);

    await signInAsStaff(page, { destination: "/staff/reports" });
    await expect(page.getByText("1 to 13 Nov 2026")).toBeVisible();

    await page.getByRole("button", { name: "7 days", exact: true }).click();
    await expect(page).toHaveURL(/period=7days/);
    await expect(page.getByText("7 to 13 Nov 2026")).toBeVisible();

    await chooseOption(page.getByRole("region", { name: "Report filters" }), "Agency", "PPA");
    await expect(page).toHaveURL(/agency=PPA/);

    await expect
      .poll(() => state.analytics.filter((body) => body.report === "overview").at(-1))
      .toEqual({
        agency: "PPA",
        dateFrom: "2026-11-07",
        dateTo: "2026-11-13",
        report: "overview",
        tower: "tower_1",
      });

    await page.reload();
    await expect(page.getByText("7 to 13 Nov 2026")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Report filters" }).getByText("PPA · Tower 1"),
    ).toBeVisible();
  });

  test("rejects a custom period longer than 366 days", async ({ page }) => {
    await installMockStaffAuthentication(page);
    await installMockReportsApi(page);

    await signInAsStaff(page, { destination: "/staff/reports" });
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    await page.getByLabel("From", { exact: true }).fill("2025-01-01");
    await page.getByLabel("To", { exact: true }).fill("2026-11-13");
    await page.getByRole("button", { name: "Apply dates" }).click();

    await expect(page.getByRole("alert")).toHaveText("Choose a period of 366 days or fewer.");
  });

  test("downloads a ready report for Excel with formula cells neutralised", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const state = await installMockReportsApi(page);

    await signInAsStaff(page, { destination: "/staff/reports" });

    const downloadPromise = page.waitForEvent("download");

    await page.getByRole("button", { name: "Download the daily visitor log for Excel" }).click();

    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("daily-visitor-log-2026-11-13.csv");

    const content = await readFile(await download.path(), "utf8");

    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain("VIS-28D05DCF,Jack Halidu,\"'=HYPERLINK(\"\"bad\"\")\"");
    expect(state.analytics.at(-1)).toEqual({
      agency: "",
      dateFrom: "2026-11-13",
      dateTo: "2026-11-13",
      report: "visits",
      tower: "tower_1",
    });
  });

  test("lets administrators compare towers and switch tower", async ({ page }) => {
    await installMockStaffAuthentication(page, {
      fullName: "Synthetic Administrator",
      role: "admin",
    });
    const state = await installMockReportsApi(page);

    await signInAsStaff(page, { destination: "/staff/reports" });

    await page.getByRole("button", { name: "All towers", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tower 1 vs Tower 2" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Tower 1 46%, Tower 2 54%" })).toBeVisible();

    await expect
      .poll(() => state.analytics.filter((body) => body.report === "overview").at(-1)?.tower)
      .toBe("");

    // The generator follows the page tower and lets administrators pick.
    await expect(page.getByRole("button", { name: /^Tower Both towers/ })).toBeVisible();
  });

  test("stays accessible in the dark theme", async ({ page }) => {
    await installMockStaffAuthentication(page);
    await installMockReportsApi(page);

    await signInAsStaff(page, { destination: "/staff/reports" });
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.getByText("Jack Halidu", { exact: true })).toBeVisible();

    await expectNoWcagViolations(page);
  });
});
