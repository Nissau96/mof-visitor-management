import {
  expect,
  test,
} from "@playwright/test";
import {
  expectNoWcagViolations,
} from "./support/accessibility.js";
import {
  installMockStaffAuthentication,
  signInAsStaff,
} from "./support/staff-authentication.js";

const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Accra",
}).format(new Date());

function meeting(index, overrides = {}) {
  return {
    active: true,
    canDelete: index % 2 === 0,
    canManage: true,
    cancelledAt: null,
    endsAt: "11:00",
    endsOn: TODAY,
    hostDivision: "Synthetic Budget Division",
    meetingId: `00000000-0000-4000-8000-00000000070${index}`,
    recurrenceDays: [],
    scheduleType: "single",
    startsAt: `${String(index + 8).padStart(2, "0")}:00`,
    startsOn: TODAY,
    title: `Synthetic Meeting ${index}`,
    tower: "tower_1",
    venue: "Conference Room B",
    visitorCount: index,
    ...overrides,
  };
}

async function installMockMeetingsApi(page, { canManage = true } = {}) {
  const state = { listRequests: [], saveRequests: [], statusRequests: [] };

  await page.route("**/api/staff/meetings/list", async (route) => {
    const body = route.request().postDataJSON();
    state.listRequests.push(body);

    const meetings = [
      meeting(1, { canManage }),
      meeting(2, {
        canManage,
        endsOn: null,
        recurrenceDays: [1, 3],
        scheduleType: "weekly",
        startsOn: TODAY,
        title: "Synthetic Weekly Briefing",
      }),
    ];

    await route.fulfill({
      contentType: "application/json",
      json: {
        meetings,
        pagination: {
          page: 1,
          pageSize: body.view === "range" ? 300 : 10,
          totalCount: meetings.length,
          totalPages: 1,
        },
        scope: { canManage, role: "receptionist", tower: "tower_1", today: TODAY },
        summary: {
          cancelledCount: 1,
          recurringCount: 1,
          thisWeekCount: 2,
          todayCount: 2,
        },
      },
      status: 200,
    });
  });

  await page.route("**/api/staff/meetings/save", async (route) => {
    const body = route.request().postDataJSON();
    state.saveRequests.push(body);

    await route.fulfill({
      contentType: "application/json",
      json: { created: !body.meeting.meetingId, meetingId: "x", title: body.meeting.title },
      status: 200,
    });
  });

  await page.route("**/api/staff/meetings/status", async (route) => {
    state.statusRequests.push(route.request().postDataJSON());

    await route.fulfill({
      contentType: "application/json",
      json: { active: false, meetingId: "x", title: "Synthetic Meeting 1" },
      status: 200,
    });
  });

  return state;
}

async function expectNoHorizontalOverflow(page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test.describe("meetings page", () => {
  test("shows meetings in table and calendar views without accessibility or overflow problems", async ({
    page,
  }) => {
    await installMockStaffAuthentication(page);
    const state = await installMockMeetingsApi(page);

    await signInAsStaff(page, { destination: "/staff/meetings" });

    await expect(
      page.getByRole("heading", { level: 1, name: "Meetings" }),
    ).toBeVisible();

    await expect(
      page.getByText("Synthetic Meeting 1", { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    expect(state.listRequests.at(-1)).toMatchObject({
      tower: "tower_1",
      view: "today",
    });

    await expectNoWcagViolations(page);
    await expectNoHorizontalOverflow(page);

    await page
      .getByRole("group", { name: "Schedule view" })
      .getByRole("button", { name: "Calendar" })
      .click();

    await expect
      .poll(() => state.listRequests.at(-1)?.view)
      .toBe("range");

    await page
      .getByRole("button", { name: /^Synthetic Meeting 1/ })
      .filter({ visible: true })
      .first()
      .click();

    const details = page.getByRole("dialog", { name: "Synthetic Meeting 1" });

    await expect(details.getByText("Conference Room B")).toBeVisible();

    await expectNoWcagViolations(page, { include: "[role=dialog]" });

    await details.getByRole("button", { name: "Close", exact: true }).click();

    await expectNoWcagViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  test("creates a weekly meeting and cancels another", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const state = await installMockMeetingsApi(page);

    await signInAsStaff(page, { destination: "/staff/meetings" });

    await page.getByRole("button", { name: "New meeting" }).click();

    const dialog = page.getByRole("dialog", { name: "New meeting" });

    await dialog.getByLabel(/^Meeting title/).fill("Synthetic Partner Sync");

    await dialog.locator("label").filter({ hasText: /^Weekly$/ }).click();

    // Weekly needs at least one day.
    await dialog.getByRole("button", { name: "Add meeting" }).click();
    await expect(
      dialog.getByText("Select at least one day of the week."),
    ).toBeVisible();

    await dialog.locator("label").filter({ hasText: /^Tue$/ }).click();
    await dialog.locator("label").filter({ hasText: /^Thu$/ }).click();
    await dialog.getByLabel(/^Start time/).fill("10:00");
    await dialog.getByLabel(/^Venue/).fill("Room 4");

    // Let the day buttons finish their colour transition before axe
    // samples them.
    await page.waitForTimeout(300);
    await expectNoWcagViolations(page, { include: "[role=dialog]" });

    await dialog.getByRole("button", { name: "Add meeting" }).click();

    await expect
      .poll(() => state.saveRequests.at(-1))
      .toMatchObject({
        meeting: {
          meetingTower: "tower_1",
          recurrenceDays: [2, 4],
          scheduleType: "weekly",
          startsAt: "10:00",
          title: "Synthetic Partner Sync",
          venue: "Room 4",
        },
        tower: "tower_1",
      });

    await expect(
      page.getByRole("status").filter({
        hasText: "Synthetic Partner Sync was added to the meeting schedule.",
      }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Cancel Synthetic Meeting 1" })
      .filter({ visible: true })
      .click();

    await page
      .getByRole("dialog", { name: "Cancel this meeting?" })
      .getByRole("button", { name: "Cancel meeting" })
      .click();

    await expect
      .poll(() => state.statusRequests.at(-1))
      .toMatchObject({ active: false, tower: "tower_1" });
  });

  test("gives Client Service Heads a view-only schedule", async ({ page }) => {
    await installMockStaffAuthentication(page, {
      fullName: "Synthetic Client Service Head",
      role: "client_service_head",
    });
    await installMockMeetingsApi(page, { canManage: false });

    await signInAsStaff(page, { destination: "/staff/meetings" });

    await expect(
      page.getByText("Synthetic Meeting 1", { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    await expect(page.getByRole("button", { name: "New meeting" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit Synthetic/ })).toHaveCount(0);

    await expectNoWcagViolations(page);
  });
});
