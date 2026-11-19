import {
  expect,
  test,
} from "@playwright/test";
import {
  expectNoWcagViolations,
} from "./support/accessibility.js";
import { chooseOption } from "./support/select.js";
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
    hostAgency: "Ministry of Finance (MoF)",
    hostDivision: "Budget Office",
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

function bookingRequest(overrides = {}) {
  return {
    bookerEmail: "ama.mensah@mofep.gov.gh",
    bookerName: "Ama Mensah",
    bookingId: "00000000-0000-4000-8000-000000000801",
    canDecide: true,
    decisionReason: null,
    endsAt: "11:00",
    guests: [
      {
        email: null,
        fullName: "Kofi Boateng",
        guestId: "00000000-0000-4000-8000-000000000901",
        organization: "World Bank",
        phone: "+233240000001",
        status: "expected",
      },
      {
        email: null,
        fullName: "Efua Owusu",
        guestId: "00000000-0000-4000-8000-000000000902",
        organization: "World Bank",
        phone: "+233240000002",
        status: "expected",
      },
    ],
    hostAgency: "Ministry of Finance (MoF)",
    hostDivision: "Ministry Headquarters",
    meetingDate: TODAY,
    notes: "Two guests will bring laptops.",
    referenceCode: "MTG-A1B2C3",
    startsAt: "10:00",
    status: "pending",
    title: "Synthetic Budget Review",
    tower: "tower_1",
    venue: "Conference Room B",
    ...overrides,
  };
}

async function installMockMeetingsApi(
  page,
  { bookings = [], canManage = true } = {},
) {
  const state = {
    bookingRequests: [],
    decideRequests: [],
    listRequests: [],
    saveRequests: [],
    statusRequests: [],
    visitorRequests: [],
  };

  await page.route("**/api/staff/meetings/visitors", async (route) => {
    const body = route.request().postDataJSON();
    state.visitorRequests.push(body);

    await route.fulfill({
      contentType: "application/json",
      json: {
        meetingId: body.meetingId,
        visitors: [
          {
            fullName: "Kofi Boateng",
            organization: "World Bank",
            status: "checked_in",
            visitId: "00000000-0000-4000-8000-000000000951",
          },
        ],
      },
      status: 200,
    });
  });

  let pending = [...bookings];

  await page.route("**/api/staff/meetings/bookings", async (route) => {
    const body = route.request().postDataJSON();
    state.bookingRequests.push(body);

    await route.fulfill({
      contentType: "application/json",
      json: {
        bookings: pending.filter((booking) =>
          body.view === "pending"
            ? booking.status === "pending"
            : body.view === "approved"
              ? booking.status === "approved"
              : !["pending", "approved"].includes(booking.status),
        ),
        pendingCount: pending.filter((booking) => booking.status === "pending").length,
        approvedCount: pending.filter((booking) => booking.status === "approved").length,
        closedCount: pending.filter((booking) => !["pending", "approved"].includes(booking.status)).length,
        scope: { role: "receptionist", tower: "tower_1" },
      },
      status: 200,
    });
  });

  await page.route("**/api/staff/meetings/bookings/decide", async (route) => {
    const body = route.request().postDataJSON();
    state.decideRequests.push(body);

    const decided = pending.find((booking) => booking.bookingId === body.bookingId);
    pending = pending.filter((booking) => booking.bookingId !== body.bookingId);

    await route.fulfill({
      contentType: "application/json",
      json: {
        ...decided,
        canDecide: false,
        decisionReason: body.reason || null,
        emailSent: true,
        status: body.decision === "approve" ? "approved" : "rejected",
      },
      status: 200,
    });
  });

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

// Reception opens on "Booked Meetings"; the schedule is one switch away.
async function openMeetingSchedule(page) {
  await page
    .getByRole("group", { name: "Meetings section" })
    .getByRole("button", { name: /^Meeting Schedule/ })
    .click();
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

    await openMeetingSchedule(page);

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
    await expect(
      details.getByText("Ministry of Finance (MoF) · Budget Office"),
    ).toBeVisible();
    await expect(details.getByText("Today", { exact: true })).toBeVisible();
    await expect(details.getByText("2h")).toBeVisible();
    await expect(
      details.getByRole("region", { name: "Registered visitors" }).getByText("Kofi Boateng"),
    ).toBeVisible();
    expect(state.visitorRequests.at(-1)).toMatchObject({
      meetingId: "00000000-0000-4000-8000-000000000701",
      tower: "tower_1",
    });
    await expect(details.getByRole("button", { name: "Cancel meeting" })).toBeVisible();
    await expect(details.getByRole("button", { name: "Edit meeting" })).toBeVisible();

    await expectNoWcagViolations(page, { include: "[role=dialog]" });

    await details.getByRole("button", { name: "Close", exact: true }).click();

    await expectNoWcagViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  test("creates a weekly meeting and cancels another", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const state = await installMockMeetingsApi(page);

    await signInAsStaff(page, { destination: "/staff/meetings" });
    await openMeetingSchedule(page);

    await page.getByRole("button", { name: "New meeting" }).click();

    const dialog = page.getByRole("dialog", { name: "New meeting" });

    await dialog.getByLabel(/^Meeting title/).fill("Synthetic Partner Sync");

    await dialog.locator("label").filter({ hasText: /^Weekly$/ }).click();

    // Weekly needs at least one day.
    await dialog.getByRole("button", { name: "Add meeting" }).click();
    await expect(
      dialog.getByText("Select at least one day of the week."),
    ).toBeVisible();
    await expect(
      dialog.getByText("Select the hosting agency."),
    ).toBeVisible();

    await dialog.locator("label").filter({ hasText: /^Tue$/ }).click();
    await dialog.locator("label").filter({ hasText: /^Thu$/ }).click();
    await dialog.getByLabel(/^Start time/).fill("10:00");
    await dialog.getByLabel(/^Venue/).fill("Room 4");

    // Division appears only for the Ministry of Finance.
    await expect(dialog.getByRole("button", { name: /^Division/ })).toHaveCount(0);
    await chooseOption(dialog, "Host agency", "Ministry of Finance (MoF)");
    await dialog.getByRole("button", { name: "Add meeting" }).click();
    await expect(dialog.getByText("Select the hosting division.")).toBeVisible();
    await chooseOption(dialog, /Division/, "Ministry Headquarters");

    // Headquarters has no floor of its own, so the floor starts empty.
    await expect(dialog.getByRole("button", { name: /^Floor/ })).toContainText("Select a floor");
    await chooseOption(dialog, /^Floor/, "Floor 7 – K.A. Gbedemah Conference Rooms");
    await chooseOption(dialog, "Wi-Fi for guests", "Yes, guests need Wi-Fi access");

    // Let the day buttons finish their colour transition before axe
    // samples them.
    await page.waitForTimeout(300);
    await expectNoWcagViolations(page, { include: "[role=dialog]" });

    await dialog.getByRole("button", { name: "Add meeting" }).click();

    await expect
      .poll(() => state.saveRequests.at(-1))
      .toMatchObject({
        meeting: {
          hostAgency: "Ministry of Finance (MoF)",
          hostDivision: "Ministry Headquarters",
          meetingTower: "tower_1",
          recurrenceDays: [2, 4],
          scheduleType: "weekly",
          startsAt: "10:00",
          floor: "7",
          title: "Synthetic Partner Sync",
          venue: "Room 4",
          wifiAccess: "yes",
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
    await expect(page.getByRole("heading", { name: "Booking requests" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Meetings section" })).toHaveCount(0);
  });

  // Waiting requests are decided on the dashboard; the Meetings page
  // only shows approved and closed bookings, approved first.
  test("shows approved and closed staff bookings, approved first", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const state = await installMockMeetingsApi(page, {
      bookings: [
        bookingRequest({ canDecide: false, status: "approved" }),
        bookingRequest({
          bookingId: "00000000-0000-4000-8000-000000000802",
          canDecide: false,
          decisionReason: "The conference room is booked.",
          referenceCode: "MTG-D4E5F6",
          status: "rejected",
          title: "Synthetic Partner Visit",
        }),
        bookingRequest({
          bookingId: "00000000-0000-4000-8000-000000000803",
          referenceCode: "MTG-G7H8J9",
          title: "Synthetic Waiting Request",
        }),
      ],
    });

    await signInAsStaff(page, { destination: "/staff/meetings" });

    const panel = page.getByRole("region", { name: "Booked by Ministry staff" });
    const views = panel.getByRole("group", { name: "Booking view" });

    const sections = page.getByRole("group", { name: "Meetings section" });

    await expect(sections.getByRole("button", { name: /^Booked Meetings/ })).toHaveAttribute("aria-pressed", "true");
    await expect(sections.getByRole("button", { name: /^Booked Meetings/ })).toContainText("1");
    await expect(page.locator("#meeting-schedule")).toBeHidden();

    await expect(views.getByRole("button")).toHaveText(["Approved1", "Closed1"]);
    await expect(views.getByRole("button", { name: /^Approved/ })).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByRole("heading", { name: "Synthetic Budget Review" })).toBeVisible();
    await expect(panel.getByText("Synthetic Waiting Request")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);

    await expect(panel.getByText("Two guests will bring laptops.")).toBeVisible();
    await panel.getByRole("button", { name: "Show 2 guests" }).click();
    await expect(panel.getByText("Kofi Boateng").filter({ visible: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Hide 2 guests" })).toBeVisible();

    await expectNoWcagViolations(page);
    await expectNoHorizontalOverflow(page);

    await views.getByRole("button", { name: /^Closed/ }).click();
    await expect(panel.getByRole("heading", { name: "Synthetic Partner Visit" })).toBeVisible();
    await expect(panel.getByText("The conference room is booked.")).toBeVisible();

    expect(state.bookingRequests.map((body) => body.view)).toEqual(["approved", "closed"]);
  });
});
