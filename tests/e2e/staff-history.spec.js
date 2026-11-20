import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/accessibility.js";
import { chooseOption } from "./support/select.js";
import {
  SYNTHETIC_ACCESS_TOKEN,
  installMockStaffAuthentication,
  signInAsStaff,
} from "./support/staff-authentication.js";

const PAGE_SIZE = 10;

// Ghana time is UTC, so today's ISO date is today in Accra too. Every
// visit is today, so the default "Current month" range always holds it.
const TODAY = new Date().toISOString().slice(0, 10);

function at(hour, minute = 0) {
  return `${TODAY}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

const PURPOSES = ["Official", "Meeting", "Follow up"];

const HISTORY_VISITS = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1;
  const padded = String(number).padStart(2, "0");
  const status = number === 3 ? "cancelled" : number % 2 === 0 ? "checked_out" : "checked_in";

  return {
    agency: number === 5 ? "Ministry of Finance (MoF)" : "IAA",
    bookedGuest: number === 2,
    cardNumber: status === "cancelled" ? null : `MOF-V${padded}`,
    cardStatus: number === 4 ? "not_returned" : status === "checked_out" ? "returned" : "assigned",
    checkedInAt: status === "cancelled" ? null : at(7 + Math.floor(index / 2), index * 4),
    checkedOutAt: status === "checked_out" ? at(19, 30) : null,
    division: number === 5 ? "Budget Office" : "",
    email: number === 1 ? "" : `visitor${padded}@example.com`,
    fullName: `Synthetic History Visitor ${padded}`,
    meetingTitle: number === 2 ? "Synthetic Budget Seminar" : "",
    organization: number === 6 ? "" : "Synthetic History Organisation",
    personVisiting: "Synthetic History Officer",
    phone: `+2332400010${padded}`,
    purpose: PURPOSES[index % 3],
    reference: number === 2 ? "MTG-6C2EB0-2" : `VIS-HIST${String(number).padStart(4, "0")}`,
    status,
    tower: "tower_1",
    visitId: `00000000-0000-4000-8001-${String(number).padStart(12, "0")}`,
    visitorType: number === 2 ? "vip" : status === "cancelled" ? null : "regular",
  };
});

function matching(body) {
  let visits = [...HISTORY_VISITS];
  const search = (body.search || "").toLowerCase();

  if (search) {
    visits = visits.filter((visit) =>
      [visit.fullName, visit.reference, visit.organization, visit.personVisiting, visit.meetingTitle]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }

  for (const key of ["status", "agency", "division", "purpose", "tower"]) {
    if (body[key]) {
      visits = visits.filter((visit) => visit[key] === body[key]);
    }
  }

  if (body.sort === "visitor") {
    visits.sort((a, b) => a.fullName.localeCompare(b.fullName) * (body.direction === "desc" ? -1 : 1));
  }

  return visits;
}

async function installMockHistoryApi(page) {
  const state = { exports: [], requests: [] };

  await page.route("**/api/staff/history", async (route) => {
    const request = route.request();

    expect(request.method()).toBe("POST");
    expect(request.headers().authorization).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`);

    const body = request.postDataJSON();
    state.requests.push(body);

    const visits = matching(body);
    const pageNumber = body.page || 1;
    const start = (pageNumber - 1) * PAGE_SIZE;

    await route.fulfill({
      contentType: "application/json",
      json: {
        generatedAt: at(8, 39),
        pagination: {
          page: pageNumber,
          pageSize: PAGE_SIZE,
          totalCount: visits.length,
          totalPages: Math.ceil(visits.length / PAGE_SIZE),
        },
        towerScope: body.tower,
        visits: visits.slice(start, start + PAGE_SIZE),
      },
      status: 200,
    });
  });

  await page.route("**/api/staff/history/export", async (route) => {
    const body = route.request().postDataJSON();
    state.exports.push(body);

    const visits = matching(body);

    await route.fulfill({
      contentType: "application/json",
      json: {
        generatedAt: at(8, 39),
        pagination: { page: 1, pageSize: 5000, totalCount: visits.length, totalPages: 1 },
        towerScope: body.tower,
        visits,
      },
      status: 200,
    });
  });

  return state;
}

function visible(locator) {
  return locator.filter({ visible: true }).first();
}

test.describe("authenticated visit history", () => {
  test("loads the current month without accessibility or overflow problems", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const history = await installMockHistoryApi(page);

    await signInAsStaff(page, { destination: "/staff/history" });

    await expect(page.getByRole("heading", { level: 1, name: "Visit history" })).toBeVisible();
    await expect(page.getByText("12 visits", { exact: true })).toBeVisible();
    await expect(page.getByText(/Tower 1 · Current month,/)).toBeVisible();
    await expect(visible(page.getByText("Synthetic History Visitor 01", { exact: true }))).toBeVisible();
    await expect(page.getByText("Showing 1–10 of 12 visits")).toBeVisible();

    // Every layout ends with the copyright and credit line.
    await expect(page.getByRole("contentinfo")).toContainText(
      `© ${new Date().getFullYear()} Ministry of Finance`,
    );
    await expect(page.getByRole("contentinfo")).toContainText("Developed and managed by PFMSD – SSU");

    expect(history.requests[0]).toMatchObject({
      dateFrom: `${TODAY.slice(0, 8)}01`,
      dateTo: TODAY,
      direction: "desc",
      page: 1,
      pageSize: 10,
      sort: "date",
      tower: "tower_1",
    });

    // Status is derived from check-out and the card's return.
    await expect(visible(page.getByText("Checked in", { exact: true }))).toBeVisible();
    await expect(visible(page.getByText("Card not returned", { exact: true }))).toBeVisible();
    await expect(visible(page.getByText("Cancelled", { exact: true }))).toBeVisible();

    await expectNoWcagViolations(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("fits a 1440px screen with the sidebar open", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout only");

    await page.setViewportSize({ height: 900, width: 1440 });
    await installMockStaffAuthentication(page);
    await installMockHistoryApi(page);
    await signInAsStaff(page, { destination: "/staff/history" });

    const table = page.getByRole("region", { name: "Visit records table" });
    await expect(table).toBeVisible();

    const scrolls = await table.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(scrolls).toBe(false);
  });

  test("filters by search, agency and purpose, then resets", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const history = await installMockHistoryApi(page);

    await signInAsStaff(page, { destination: "/staff/history" });
    await expect(page.getByText("12 visits", { exact: true })).toBeVisible();

    await page.getByRole("searchbox", { name: "Search visits" }).fill("History Visitor 0");
    await chooseOption(page, "Agency", "IAA");
    await chooseOption(page, "Purpose", "Official");

    await expect
      .poll(() => history.requests.at(-1))
      .toMatchObject({ agency: "IAA", page: 1, purpose: "Official", search: "History Visitor 0" });

    await expect(page.getByRole("button", { name: "Remove filter IAA" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove filter Official" })).toBeVisible();
    expect(page.url()).not.toContain("History");

    await page.getByRole("button", { name: "Remove filter Official" }).click();
    await expect.poll(() => history.requests.at(-1)?.purpose).toBe("");

    await page.getByRole("button", { name: "Reset filters" }).first().click();
    await expect(page.getByText("12 visits", { exact: true })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search visits" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Reset filters" })).toHaveCount(0);
  });

  test("shows the Ministry division only for MoF", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const history = await installMockHistoryApi(page);

    await signInAsStaff(page, { destination: "/staff/history" });

    await expect(page.getByRole("button", { name: /^Division/ })).toHaveCount(0);
    await chooseOption(page, "Agency", "MoF");
    await chooseOption(page, "Division", "Budget Office");

    await expect
      .poll(() => history.requests.at(-1))
      .toMatchObject({ agency: "Ministry of Finance (MoF)", division: "Budget Office" });
    await expect(page.getByText("1 visit", { exact: true })).toBeVisible();

    test.skip(page.viewportSize().width < 1024, "The Agency column is on the desktop table");

    // The Agency column shows the short name, with the division under it.
    const agencyCell = page.getByRole("row", { name: /Synthetic History Visitor 05/ }).getByRole("cell").nth(5);
    await expect(agencyCell).toHaveText("MoFBudget Office");
    await expect(agencyCell.getByText("MoF", { exact: true })).toHaveAttribute("title", "Ministry of Finance (MoF)");
    await expect(page.getByRole("columnheader", { name: "Agency" })).toBeVisible();
  });

  test("sorts by visitor and pages through the results", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const history = await installMockHistoryApi(page);

    await signInAsStaff(page, { destination: "/staff/history" });
    await expect(page.getByText("12 visits", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Showing 11–12 of 12 visits")).toBeVisible();
    await expect.poll(() => history.requests.at(-1)?.page).toBe(2);

    await page.getByRole("button", { name: "Page 1 of 2" }).click();
    await expect.poll(() => history.requests.at(-1)?.page).toBe(1);

    const viewport = page.viewportSize();
    test.skip(viewport.width < 1024, "Sortable headers are on the desktop table");

    const dateHeader = page.getByRole("columnheader", { name: "Date" });
    await expect(dateHeader).toHaveAttribute("aria-sort", "descending");

    await page.getByRole("button", { exact: true, name: "Visitor" }).click();
    await expect
      .poll(() => history.requests.at(-1))
      .toMatchObject({ direction: "asc", page: 1, sort: "visitor" });
    await expect(page.getByRole("columnheader", { name: "Visitor" })).toHaveAttribute("aria-sort", "ascending");
    await expect(dateHeader).toHaveAttribute("aria-sort", "none");

    await page.getByRole("button", { exact: true, name: "Visitor" }).click();
    await expect.poll(() => history.requests.at(-1)?.direction).toBe("desc");
  });

  test("rejects a reversed custom range without another request", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const history = await installMockHistoryApi(page);

    await signInAsStaff(page, { destination: "/staff/history" });
    await expect(page.getByText("12 visits", { exact: true })).toBeVisible();

    await chooseOption(page, "Date range", "Custom range");
    await page.getByLabel("From", { exact: true }).fill("2026-08-20");
    await expect.poll(() => history.requests.at(-1)?.dateFrom).toBe("2026-08-20");

    const sent = history.requests.length;
    await page.getByLabel("To", { exact: true }).fill("2026-08-10");

    await expect(page.getByRole("alert")).toHaveText("The end date is before the start date.");
    await expect(page.getByText("No visits match these filters")).toBeVisible();
    await expect(page.getByText("0 visits", { exact: true })).toBeVisible();
    expect(history.requests).toHaveLength(sent);
  });

  test("opens a visit in the side panel and returns focus on close", async ({ page }) => {
    await installMockStaffAuthentication(page);
    await installMockHistoryApi(page);

    await signInAsStaff(page, { destination: "/staff/history" });

    const opener = visible(
      page.getByRole("button", { name: "View visit details for Synthetic History Visitor 02, MTG-6C2EB0-2" }),
    );
    await opener.click();

    const panel = page.getByRole("dialog", { name: "Synthetic History Visitor 02" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Close visit details" })).toBeFocused();
    await expect(panel.getByText("VIP", { exact: true })).toBeVisible();
    await expect(panel.getByText("Synthetic Budget Seminar")).toBeVisible();
    await expect(panel.getByRole("link", { name: /Booked meeting MTG-6C2EB0/ })).toHaveAttribute(
      "href",
      "/staff/meetings",
    );
    await expect(panel.getByText("+233 24 000 1002")).toBeVisible();
    await expect(panel.getByText("Returned at check-out")).toBeVisible();

    await expectNoWcagViolations(page);

    // Tab stays inside the panel.
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press("Tab");
    }
    expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("flags a card that was not returned", async ({ page }) => {
    await installMockStaffAuthentication(page);
    await installMockHistoryApi(page);

    await signInAsStaff(page, { destination: "/staff/history" });

    await visible(
      page.getByRole("button", { name: /View visit details for Synthetic History Visitor 04/ }),
    ).click();

    const panel = page.getByRole("dialog", { name: "Synthetic History Visitor 04" });
    await expect(panel.getByText("Not returned at check-out. Follow up with the visitor or host.")).toBeVisible();
    await expect(panel.getByText("Regular", { exact: true })).toBeVisible();

    await page.mouse.click(5, 5);
    await expect(panel).toHaveCount(0);
  });

  test("exports every matching visit as CSV", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const history = await installMockHistoryApi(page);

    await signInAsStaff(page, { destination: "/staff/history" });
    await expect(page.getByText("12 visits", { exact: true })).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const file = await download;

    expect(file.suggestedFilename()).toBe(`visit-history-${TODAY.slice(0, 8)}01-to-${TODAY}.csv`);
    expect(history.exports[0]).toMatchObject({ dateFrom: `${TODAY.slice(0, 8)}01`, dateTo: TODAY });

    const csv = (await readFile(await file.path(), "utf8")).replace(/^\uFEFF/, "");
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe(
      "Visitor,Reference,Organisation,Purpose,Visiting,Division,Agency,Tower,Check-in,Check-out,Duration (min),Card,Card returned,Phone,Email",
    );
    expect(lines).toHaveLength(13);
    expect(lines.find((line) => line.startsWith("Synthetic History Visitor 04"))).toContain(",MOF-V04,No,");
    expect(lines.find((line) => line.startsWith("Synthetic History Visitor 01"))).toContain(",With visitor,");
  });

  test("opens with a search handed over by the top bar", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const history = await installMockHistoryApi(page);

    await signInAsStaff(page);

    // The top-bar search hands its text over in router state, like the
    // dashboard and report links hand over dates and status.
    const topSearch = page.getByPlaceholder("Search visitor or VIS reference");
    await topSearch.fill("Visitor 07");
    await topSearch.press("Enter");

    await expect(page).toHaveURL(/\/staff\/history\?range=custom$/);
    await expect
      .poll(() => history.requests.at(-1), { timeout: 10_000 })
      .toMatchObject({ dateFrom: null, dateTo: null, search: "Visitor 07" });
    await expect(page.getByRole("button", { name: "Remove filter “Visitor 07”" })).toBeVisible();
    await expect(page.getByText(/Custom range, All dates/)).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search visits" })).toHaveValue("Visitor 07");
    expect(page.url()).not.toContain("Visitor");
  });
});
