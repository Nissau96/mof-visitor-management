import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/accessibility.js";
import { chooseOption } from "./support/select.js";
import {
  installMockStaffAuthentication,
  signInAsStaff,
} from "./support/staff-authentication.js";

const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Accra",
}).format(new Date());

const TOKEN = "Synthetic-Token_0123456789abcdefghijklmnopq";
const VISIT_ID = "00000000-0000-4000-8000-000000000b01";

// Pages behind the floating button load their own data; the tests here
// only look at the button and its dialogs, so other API calls get an
// empty answer.
async function quietOtherApis(page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({ contentType: "application/json", json: {}, status: 200 }),
  );
}

test.describe("Visitor booking links", () => {
  test("reception finds a booked visitor by code and admits them", async ({ page }) => {
    await quietOtherApis(page);
    await installMockStaffAuthentication(page, { role: "receptionist" });

    const searches = [];

    await page.route("**/api/staff/bookings/find", async (route) => {
      searches.push(route.request().postDataJSON());
      await route.fulfill({
        contentType: "application/json",
        json: {
          floor: "3",
          hostName: "Ama Mensah",
          referenceCode: "VIS-1A2B3C4D",
          state: "waiting",
          tower: "tower_1",
          visitDate: TODAY,
          visitorName: "Kofi Boateng",
        },
        status: 200,
      });
    });

    await page.route("**/api/staff/cards/pending", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          admissions: [
            {
              email: "",
              fullName: "Kofi Boateng",
              organization: "Synthetic Consulting",
              phone: "+233240000000",
              purpose: "Official",
              referenceCode: "VIS-1A2B3C4D",
              visitId: VISIT_ID,
            },
          ],
          pagination: { page: 1, pageSize: 5, totalCount: 1, totalPages: 1 },
        },
        status: 200,
      }),
    );

    await signInAsStaff(page);

    await page.getByRole("button", { name: "Bookings" }).click();
    await page.getByRole("menuitem", { name: "Find booking" }).click();

    const dialog = page.getByRole("dialog", { name: "Find booking" });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Reference code").fill("1a2b 3c4d");
    await dialog.getByRole("button", { name: "Search" }).click();

    await expect(dialog.getByText("Kofi Boateng")).toBeVisible();
    expect(searches[0]).toEqual({ code: "VIS-1A2B3C4D", tower: "tower_1" });

    await expectNoWcagViolations(page);

    await dialog.getByRole("button", { name: "Admit and assign card" }).click();

    await expect(page.getByRole("dialog", { name: "Assign visitor card" })).toBeVisible();
  });

  test("the dashboard switches to booked visitors and admits one", async ({ page }) => {
    await quietOtherApis(page);
    await installMockStaffAuthentication(page, { role: "receptionist" });

    const views = [];

    await page.route("**/api/staff/bookings/visitors", async (route) => {
      const body = route.request().postDataJSON();
      views.push(body.view);
      await route.fulfill({
        contentType: "application/json",
        json: {
          bookings: [
            {
              agency: "Ministry of Finance (MoF)",
              division: "Budget Office",
              floor: "3",
              hostName: "Ama Mensah",
              id: "00000000-0000-4000-8000-000000000b02",
              organization: "Synthetic Consulting",
              purpose: "Official",
              referenceCode: "VIS-1A2B3C4D",
              status: "waiting",
              tower: "tower_1",
              visitDate: TODAY,
              visitId: VISIT_ID,
              visitorName: "Kofi Boateng",
            },
          ],
          todayCount: 1,
        },
        status: 200,
      });
    });

    await page.route("**/api/staff/cards/pending", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          admissions: [
            {
              bookedVisit: true,
              fullName: "Kofi Boateng",
              phone: "+233240000000",
              purpose: "Official",
              referenceCode: "VIS-1A2B3C4D",
              visitId: VISIT_ID,
            },
          ],
          pagination: { page: 1, pageSize: 5, totalCount: 1, totalPages: 1 },
        },
        status: 200,
      }),
    );

    await signInAsStaff(page);

    await page.getByRole("tablist", { name: "Visitor lists" }).getByRole("tab", { name: /Booked/ }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Booked visitors" })).toBeVisible();
    await expect(page.getByText("Waiting at reception").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("img", { name: "Booked visit" }).first()).toBeAttached();

    await expectNoWcagViolations(page);

    const bookedDates = page.getByRole("tablist", { name: "Booked dates" });
    await bookedDates.getByRole("tab", { name: "Next 30 days" }).click();
    await expect.poll(() => views.at(-1)).toBe("upcoming");
    await bookedDates.getByRole("tab", { exact: true, name: "Today" }).click();

    await page
      .getByRole("button", { name: "Assign card to Kofi Boateng" })
      .filter({ visible: true })
      .first()
      .click();

    await expect(page.getByRole("dialog", { name: "Assign visitor card" })).toBeVisible();
  });

  test("reception is told when a booking is for another day", async ({ page }) => {
    await quietOtherApis(page);
    await installMockStaffAuthentication(page, { role: "receptionist" });

    await page.route("**/api/staff/bookings/find", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          referenceCode: "VIS-1A2B3C4D",
          state: "upcoming",
          tower: "tower_1",
          visitDate: "2099-01-05",
          visitorName: "Kofi Boateng",
        },
        status: 200,
      }),
    );

    await signInAsStaff(page);

    await page.getByRole("button", { name: "Bookings" }).click();
    await page.getByRole("menuitem", { name: "Find booking" }).click();

    const dialog = page.getByRole("dialog", { name: "Find booking" });
    await dialog.getByLabel("Reference code").fill("VIS-1A2B3C4D");
    await dialog.getByRole("button", { name: "Search" }).click();

    await expect(dialog.getByText(/booked for Mon, 5 Jan 2099, not today/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Admit and assign card" })).toHaveCount(0);
  });

  test("a Unit Head creates a link from the floating button", async ({ page }) => {
    await quietOtherApis(page);
    await installMockStaffAuthentication(page, {
      fullName: "Synthetic Unit Head",
      role: "client_service_head",
    });

    const created = [];

    await page.route("**/api/staff/invites/create", async (route) => {
      created.push(route.request().postDataJSON());
      await route.fulfill({
        contentType: "application/json",
        json: {
          emailRequested: false,
          emailSent: false,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          hostName: "Synthetic Unit Head",
          id: VISIT_ID,
          state: "unused",
          url: `https://visitors.example.invalid/invite/${TOKEN}`,
        },
        status: 200,
      });
    });

    await signInAsStaff(page, { expectedDestination: "/staff/cards" });

    // Unit Heads only create links, so there is no menu.
    await expect(page.getByRole("button", { name: "Bookings" })).toHaveCount(0);
    await page.getByRole("button", { name: "Create visitor link" }).click();

    const dialog = page.getByRole("dialog", { name: "Create visitor link" });
    await expect(dialog.getByLabel(/^Host/)).toHaveValue("Synthetic Unit Head");

    await chooseOption(dialog, "Division", "Budget Office");
    await dialog.getByRole("button", { name: "Create link" }).click();

    const ready = page.getByRole("dialog", { name: "Link ready to send" });
    await expect(ready.getByLabel("Booking link")).toHaveValue(
      `https://visitors.example.invalid/invite/${TOKEN}`,
    );
    expect(created[0]).toMatchObject({
      agency: "Ministry of Finance (MoF)",
      division: "Budget Office",
      floor: "3",
      hostName: "Synthetic Unit Head",
    });

    await expectNoWcagViolations(page);
  });

  test("a visitor books with the link and gets a code", async ({ page }) => {
    const submissions = [];

    await page.route("**/api/invites/view", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          invite: {
            agency: "Ministry of Finance (MoF)",
            division: "Budget Office",
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            floor: "3",
            hostName: "Ama Mensah",
            state: "unused",
            tower: "tower_2",
          },
        },
        status: 200,
      }),
    );

    await page.route("**/api/invites/submit", async (route) => {
      submissions.push(route.request().postDataJSON());
      await route.fulfill({
        contentType: "application/json",
        json: {
          booking: {
            agency: "Ministry of Finance (MoF)",
            division: "Budget Office",
            floor: "3",
            hostName: "Ama Mensah",
            referenceCode: "VIS-1A2B3C4D",
            tower: "tower_2",
            visitDate: TODAY,
          },
          emailSent: false,
          smsSent: false,
        },
        status: 201,
      });
    });

    await page.goto(`/invite/${TOKEN}`);

    await expect(page.getByRole("heading", { level: 1, name: "Book your visit" })).toBeVisible();
    await expect(page.getByText("Visiting Ama Mensah")).toBeVisible();

    await expectNoWcagViolations(page);

    await page.getByLabel(/^First name/).fill("Kofi");
    await page.getByLabel(/^Last name/).fill("Boateng");
    await page.getByLabel(/^Mobile number/).fill("024 000 0000");
    await page.getByLabel(/^Date of visit/).fill(TODAY);
    await chooseOption(page, "Purpose of visit", "Official");
    await chooseOption(page, "Wi-Fi access", "No, I don't need Wi-Fi");

    await page.getByRole("button", { name: "Book my visit" }).click();

    await expect(page.getByLabel("Visit reference VIS-1A2B3C4D")).toBeVisible();
    expect(submissions[0]).toMatchObject({
      consent: true,
      firstName: "Kofi",
      purpose: "Official",
      token: TOKEN,
      visitDate: TODAY,
      wifiAccess: "no",
    });

    await expectNoWcagViolations(page);
  });

  test("a used link cannot be used again", async ({ page }) => {
    await page.route("**/api/invites/view", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: { invite: { state: "used" } },
        status: 200,
      }),
    );

    await page.goto(`/invite/${TOKEN}`);

    await expect(page.getByRole("heading", { name: "This link cannot be used" })).toBeVisible();
    await expect(page.getByText(/already used to book a visit/)).toBeVisible();
  });
});
