import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/accessibility.js";
import {
  installMockStaffAuthentication,
  signInAsStaff,
} from "./support/staff-authentication.js";

const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Accra",
}).format(new Date());

const VISIT_ID = "00000000-0000-4000-8000-000000000a01";
const MEETING_ID = "00000000-0000-4000-8000-000000000a02";

function todayEntries() {
  return [
    {
      agency: "IAA",
      date: TODAY,
      decidedAt: null,
      decidedByName: null,
      division: null,
      email: "synthetic.visitor@example.invalid",
      fullName: "Synthetic Visitor",
      id: VISIT_ID,
      meetingFloor: null,
      meetingTitle: null,
      note: null,
      organization: "Quality Test Organisation",
      personVisiting: "Quality Officer",
      phone: "+233241112233",
      registeredAt: new Date().toISOString(),
      status: "waiting",
      tower: "tower_1",
      type: "visit",
      visitStatus: "checked_in",
    },
    {
      date: TODAY,
      decidedAt: new Date().toISOString(),
      decidedByName: "Synthetic IT Officer",
      endsAt: "12:00",
      floor: "5",
      guests: [
        {
          email: null,
          fullName: "Kofi Boateng",
          organization: "World Bank",
          phone: "+233240000001",
          source: "booked",
        },
        {
          email: "efua.owusu@example.invalid",
          fullName: "Efua Owusu",
          organization: "World Bank",
          phone: "+233240000002",
          source: "walk_in",
        },
      ],
      hostAgency: "Ministry of Finance (MoF)",
      hostDivision: "Research Division",
      id: MEETING_ID,
      note: "Voucher sent by SMS",
      organiserEmail: "ama.mensah@mofep.gov.gh",
      organiserName: "Ama Mensah",
      referenceCode: "MTG-A1B2C3",
      startsAt: "10:00",
      status: "given",
      title: "Synthetic Research Review",
      tower: "tower_2",
      type: "meeting",
      venue: "Conference Room 5A",
    },
  ];
}

async function installMockWifiApi(page) {
  const state = { grantRequests: [], listRequests: [], updateRequests: [] };
  let entries = todayEntries();

  await page.route("**/api/staff/wifi/count", (route) =>
    route.fulfill({
      contentType: "application/json",
      json: { waitingCount: entries.filter((entry) => entry.status === "waiting").length },
      status: 200,
    }),
  );

  await page.route("**/api/staff/wifi/list", async (route) => {
    const body = route.request().postDataJSON();
    state.listRequests.push(body);

    await route.fulfill({
      contentType: "application/json",
      json: {
        entries: body.view === "today" ? entries : [],
        settings: {
          emailAvailable: true,
          networkNames: { tower_1: "PEACE - HUB - Guest", tower_2: "MoF-Guest" },
          smsAvailable: false,
        },
        summary: {},
        today: TODAY,
        view: body.view,
        waitingCount: entries.filter((entry) => entry.status === "waiting").length,
      },
      status: 200,
    });
  });

  await page.route("**/api/staff/wifi/grant", async (route) => {
    const body = route.request().postDataJSON();
    state.grantRequests.push(body);

    const expiresAt = `${TODAY}T23:59:59Z`;

    entries = entries.map((entry) =>
      entry.id === body.id
        ? { ...entry, expiresAt, hasPassword: true, sentBy: ["email"], status: "given" }
        : entry,
    );

    await route.fulfill({
      contentType: "application/json",
      json: {
        decidedAt: new Date().toISOString(),
        decidedByName: "Synthetic IT Officer",
        expiresAt,
        id: body.id,
        networkName: "MoF-Guest",
        note: null,
        problems: [],
        sentBy: ["email"],
        status: "given",
        type: body.type,
      },
      status: 200,
    });
  });

  await page.route("**/api/staff/wifi/update", async (route) => {
    const body = route.request().postDataJSON();
    state.updateRequests.push(body);

    entries = entries.map((entry) =>
      entry.id === body.id
        ? {
            ...entry,
            decidedAt: new Date().toISOString(),
            decidedByName: "Synthetic IT Officer",
            note: body.note || null,
            status: body.status,
          }
        : entry,
    );

    await route.fulfill({
      contentType: "application/json",
      json: {
        decidedAt: new Date().toISOString(),
        decidedByName: "Synthetic IT Officer",
        id: body.id,
        note: body.note || null,
        status: body.status,
        type: body.type,
      },
      status: 200,
    });
  });

  return state;
}

test.describe("WiFi Access page", () => {
  test("IT network staff land on Wi-Fi requests and record a decision", async ({
    page,
  }) => {
    await installMockStaffAuthentication(page, {
      fullName: "Synthetic IT Officer",
      role: "it_network_admin",
    });
    const state = await installMockWifiApi(page);

    await signInAsStaff(page, { expectedDestination: "/staff/wifi" });

    await expect(
      page.getByRole("heading", { level: 1, name: "WiFi Access" }),
    ).toBeVisible();

    // The IT team sees only the Wi-Fi page in the menu. On phones the
    // menu is a closed drawer, so hidden links count too.
    const navigation = page.getByRole("navigation", {
      includeHidden: true,
      name: "Staff navigation",
    });
    const menuLink = (name) =>
      navigation.getByRole("link", { includeHidden: true, name });

    await expect(menuLink(/WiFi Access/)).toHaveCount(1);
    await expect(menuLink(/Visitor Cards/)).toHaveCount(0);
    await expect(menuLink(/Meetings/)).toHaveCount(0);
    await expect(menuLink(/WiFi Access, 1 need attention/)).toHaveCount(1);

    const visitorRow = page.getByRole("listitem").filter({ hasText: "Synthetic Visitor" });
    await expect(visitorRow.getByText("Waiting", { exact: true })).toBeVisible();
    await expect(visitorRow.getByRole("link", { name: "+233241112233" })).toHaveAttribute("href", "tel:+233241112233");
    await expect(visitorRow.getByText("Tower 1 · Floor 1")).toBeVisible();

    const meetingRow = page.getByRole("listitem").filter({ hasText: "Synthetic Research Review" });
    await expect(meetingRow.getByText("Tower 2 · Floor 5 – Conference rooms")).toBeVisible();
    await expect(meetingRow.getByText(/Access given by Synthetic IT Officer/)).toBeVisible();

    await meetingRow.getByRole("button", { name: "Show guests (2)" }).click();
    await expect(meetingRow.getByText("Kofi Boateng")).toBeVisible();
    await expect(meetingRow.getByText("Walk-in")).toBeVisible();

    await expectNoWcagViolations(page);

    await visitorRow.getByRole("button", { name: "Grant WiFi access" }).click();

    const dialog = page.getByRole("dialog", { name: "Grant WiFi access" });
    // The visitor is going to Tower 1.
    await expect(dialog.getByText("PEACE - HUB - Guest")).toBeVisible();

    // SMS is not set up, so only email is chosen.
    await expect(dialog.getByRole("checkbox", { name: /SMS/ })).toBeDisabled();
    await expect(dialog.getByRole("checkbox", { name: /Email/ })).toBeChecked();

    await dialog.getByRole("button", { name: "Grant access" }).click();
    await expect(dialog.getByText("Paste the password from the WiFi system.")).toBeVisible();

    await dialog.getByLabel(/^Password/).fill("Volta-Cedar-4821");
    await dialog.getByText("End of day", { exact: true }).click();
    await page.waitForTimeout(300);
    await expectNoWcagViolations(page, { include: "[role=dialog]" });
    await dialog.getByRole("button", { name: "Grant access" }).click();

    await expect(dialog).toHaveCount(0);
    expect(state.grantRequests.at(-1)).toEqual({
      channels: ["email"],
      date: TODAY,
      duration: "end_of_day",
      id: VISIT_ID,
      note: "",
      password: "Volta-Cedar-4821",
      tower: "tower_1",
      type: "visit",
    });
    await expect(visitorRow.getByText("Access given", { exact: true })).toBeVisible();
    await expect(visitorRow.getByText("Today, 11:59 pm")).toBeVisible();
    await expect(visitorRow.getByText("Sent by email")).toBeVisible();
    await expect(menuLink("WiFi Access")).toHaveCount(1);

    await visitorRow.getByRole("button", { name: "Add note" }).click();
    await visitorRow.getByLabel("Note for the IT team").fill("Sent by email");
    await visitorRow.getByRole("button", { name: "Save note" }).click();

    await expect
      .poll(() => state.updateRequests.at(-1))
      .toEqual({ id: VISIT_ID, note: "Sent by email", status: "given", type: "visit" });
    await expect(visitorRow.getByText("“Sent by email”")).toBeVisible();

    await page.getByRole("button", { name: "Upcoming", exact: true }).click();
    await expect(page.getByText("No upcoming meetings have asked for WiFi.")).toBeVisible();
    expect(state.listRequests.at(-1)).toEqual({ view: "upcoming" });
  });

  test("keeps the IT team out of reception pages", async ({ page }) => {
    await installMockStaffAuthentication(page, {
      fullName: "Synthetic IT Officer",
      role: "it_network_admin",
    });
    await installMockWifiApi(page);

    await signInAsStaff(page, {
      destination: "/staff/meetings",
      expectedDestination: "/staff/wifi",
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "WiFi Access" }),
    ).toBeVisible();
  });
});
