import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/accessibility.js";
import { chooseOption } from "./support/select.js";
import { installMockStaffAuthentication, signInAsStaff } from "./support/staff-authentication.js";

const TODAY = new Date().toISOString().slice(0, 10);
const at = (hour, minute) => `${TODAY}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
const ADMIN_ID = "00000000-0000-4000-8000-0000000000a1";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const EVENTS = [
  { action: "visit_history.exported", actorId: ADMIN_ID, actorName: "Ibrahim Halidu", actorRole: "admin", category: "export", createdAt: at(17, 12), details: { dateFrom: `${TODAY.slice(0, 8)}01`, dateTo: TODAY, rows: 6 }, entityType: "export", id: 20481, ipAddress: "10.20.4.18", result: "success", sensitive: true, tower: "tower_2", userAgent: CHROME },
  { action: "visit.checked_out", actorId: "u2", actorName: "Akua Boateng", actorRole: "receptionist", category: "visitor", createdAt: at(16, 58), details: {}, entityType: "visit", id: 20480, ipAddress: "10.20.4.31", result: "success", sensitive: false, targetDetail: "VIS-7F31A2", targetName: "Esi Owusu", tower: "tower_2", userAgent: CHROME },
  { action: "host.updated", actorId: ADMIN_ID, actorName: "Ibrahim Halidu", actorRole: "admin", category: "settings", createdAt: at(15, 10), details: { changes: [{ after: "2216", before: "2214", field: "extension" }, { after: "Floor 4", before: "Floor 3", field: "floor" }] }, entityType: "host", id: 20477, ipAddress: "10.20.4.18", result: "success", sensitive: true, targetDetail: "Budget Office", targetName: "Isaac Sam", tower: null, userAgent: CHROME },
  { action: "staff_sign_in_failed", actorId: null, actorName: "nana.yeboah@mofep.gov.gh", actorRole: "staff", category: "signin", createdAt: at(14, 22), details: { email: "nana.yeboah@mofep.gov.gh", reportedBy: "browser" }, entityType: "staff_session", id: 20470, ipAddress: "10.20.5.7", result: "failed", sensitive: false, tower: "tower_1", userAgent: CHROME },
];

async function installMockActivityApi(page) {
  const state = { exports: [], requests: [] };

  const respond = (body, events) => ({
    events,
    generatedAt: at(17, 21),
    pagination: { page: body.page || 1, pageSize: 10, totalCount: events.length, totalPages: events.length ? 1 : 0 },
    stats: { activeUserCount: 3, activeUsers: ["Ibrahim", "Akua", "Nana"], eventsToday: 17, failedToday: 1, firstEventAt: at(7, 45), sensitiveToday: 2 },
    users: [{ id: ADMIN_ID, name: "Ibrahim Halidu", role: "admin" }, { id: "u2", name: "Akua Boateng", role: "receptionist" }],
  });

  const filter = (body) =>
    EVENTS.filter((event) => (!body.result || event.result === body.result) && (!body.category || event.category === body.category || (body.category === "sensitive" && event.sensitive)));

  await page.route("**/api/admin/activity/list", async (route) => {
    const body = route.request().postDataJSON();
    state.requests.push(body);
    await route.fulfill({ json: respond(body, filter(body)) });
  });

  await page.route("**/api/admin/activity/export", async (route) => {
    const body = route.request().postDataJSON();
    state.exports.push(body);
    await route.fulfill({ json: respond(body, filter(body)) });
  });

  return state;
}

const visible = (locator) => locator.filter({ visible: true }).first();

test.describe("admin activity log", () => {
  test("lists today's events without accessibility or overflow problems", async ({ page }) => {
    await installMockStaffAuthentication(page, { role: "admin" });
    const activity = await installMockActivityApi(page);

    await signInAsStaff(page, { destination: "/staff/admin/activity" });

    await expect(page.getByRole("heading", { level: 1, name: "Activity log" })).toBeVisible();
    await expect(page.getByText("4 events", { exact: true })).toBeVisible();
    await expect(visible(page.getByText("Updated host details"))).toBeVisible();
    await expect(visible(page.getByText("Sign-in failed"))).toBeVisible();
    await expect(page.getByText(/Live · updated/)).toBeVisible();
    expect(activity.requests[0]).toMatchObject({ dateFrom: TODAY, dateTo: TODAY, page: 1, pageSize: 10 });

    await expectNoWcagViolations(page);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("filters by result from the stat card and by action", async ({ page }) => {
    await installMockStaffAuthentication(page, { role: "admin" });
    const activity = await installMockActivityApi(page);

    await signInAsStaff(page, { destination: "/staff/admin/activity" });
    await expect(page.getByText("4 events", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Show failed actions" }).click();
    await expect.poll(() => activity.requests.at(-1)?.result).toBe("failed");
    await expect(page.getByText("1 event", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove filter Failed" })).toBeVisible();

    await page.getByRole("button", { name: "Reset filters" }).first().click();
    await chooseOption(page, "Action", "Settings");
    await expect.poll(() => activity.requests.at(-1)).toMatchObject({ category: "settings", result: "" });
  });

  test("shows an event's changes, actor and device in the side panel", async ({ page }) => {
    await installMockStaffAuthentication(page, { role: "admin" });
    await installMockActivityApi(page);

    await signInAsStaff(page, { destination: "/staff/admin/activity" });

    const opener = visible(page.getByRole("button", { name: /View Updated host details by Ibrahim Halidu, EV-20477/ }));
    await opener.click();

    const panel = page.getByRole("dialog", { name: "Updated host details" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Close event details" })).toBeFocused();
    await expect(panel.getByText("Sensitive change")).toBeVisible();
    await expect(panel.getByText("EV-20477")).toBeVisible();
    await expect(panel.getByText("Isaac Sam")).toBeVisible();
    await expect(panel.getByRole("row", { name: /Floor Floor 3 Floor 4/ })).toBeVisible();
    await expect(panel.getByText("Windows · Chrome")).toBeVisible();
    await expect(panel.getByText("10.20.4.18")).toBeVisible();

    await expectNoWcagViolations(page);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("exports every matching event as CSV", async ({ page }) => {
    await installMockStaffAuthentication(page, { role: "admin" });
    const activity = await installMockActivityApi(page);

    await signInAsStaff(page, { destination: "/staff/admin/activity" });
    await expect(page.getByText("4 events", { exact: true })).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const file = await download;

    expect(file.suggestedFilename()).toBe(`activity-log-${TODAY}-to-${TODAY}.csv`);
    expect(activity.exports[0]).toMatchObject({ dateFrom: TODAY, dateTo: TODAY });

    const lines = (await readFile(await file.path(), "utf8")).replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe("Time,Reference,User,Role,Action,Category,Sensitive,Target,Target detail,Tower,Result,IP address,Device");
    expect(lines).toHaveLength(5);
    expect(lines.find((line) => line.includes("EV-20477"))).toContain("Updated host details,Settings,Yes,Isaac Sam,Budget Office,All towers,Success");
  });

  test("is not available to receptionists", async ({ page }) => {
    await installMockStaffAuthentication(page, { role: "receptionist" });
    await installMockActivityApi(page);

    await signInAsStaff(page);

    await expect(page.getByRole("link", { name: "Activity Log" })).toHaveCount(0);

    await page.goto("/staff/admin/activity");
    await expect(page.getByRole("heading", { level: 1, name: "Activity log" })).toHaveCount(0);
  });
});
