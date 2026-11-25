import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/accessibility.js";
import { chooseOption } from "./support/select.js";
import { installMockVisitorAccess } from "./support/visitor-access.js";

const KIOSK_ACCESS_URL =
  "http://127.0.0.1:4173/visit#weeklyAccess=synthetic-weekly-token";

async function installKioskQr(page, status = 200) {
  await page.route(/\/api\/register\?kiosk=1$/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json:
        status === 200
          ? {
              access: {
                accessUrl: KIOSK_ACCESS_URL,
                valid: true,
                weekEndsOn: "2026-08-23",
                weekStartsOn: "2026-08-17",
              },
            }
          : { error: "Scan the current reception QR code." },
      status,
    });
  });
}

async function openKiosk(page) {
  await installMockVisitorAccess(page);
  await page.goto("/visit/kiosk");

  await expect(
    page.getByRole("heading", {
      name: "How would you like to check in?",
    }),
  ).toBeVisible();
}

test.describe("reception kiosk", () => {
  test("shows the banner and two ways to check in", async ({ page }) => {
    await openKiosk(page);

    await expect(
      page.getByRole("heading", { name: "Visitor check-in" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Show QR code" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Check in" }),
    ).toHaveAttribute("href", "/visit");

    await expectNoWcagViolations(page);

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );

    expect(hasHorizontalOverflow).toBe(false);
  });

  test("shows this week's QR poster and closes it after a minute", async ({
    page,
  }) => {
    await page.clock.install();
    await installKioskQr(page);
    await openKiosk(page);

    const showQr = page.getByRole("button", { name: "Show QR code" });

    await showQr.click();

    const dialog = page.getByRole("dialog", {
      name: "Visitor Registration",
    });

    await expect(
      dialog.getByRole("img", { name: /Weekly visitor QR code, valid/ }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Done" }),
    ).toBeFocused();
    await expectNoWcagViolations(page, { include: "[role=dialog]" });

    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(showQr).toBeFocused();

    await showQr.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("timer")).toHaveText(
      "This screen closes in 1:00",
    );
    await page.clock.fastForward(15_000);
    await expect(dialog.getByRole("timer")).toHaveText(
      "This screen closes in 0:45",
    );
    await page.clock.fastForward(60_000);
    await expect(dialog).toHaveCount(0);
  });

  test("explains when the kiosk's weekly access has ended", async ({
    page,
  }) => {
    await installKioskQr(page, 401);
    await openKiosk(page);

    await page.getByRole("button", { name: "Show QR code" }).click();

    await expect(
      page.getByRole("alert"),
    ).toContainText("no longer set up");
  });

  test("returns to the kiosk after a pause on another page", async ({
    page,
  }) => {
    await page.clock.install();
    await openKiosk(page);

    await page.getByRole("link", { name: "Check in" }).click();
    await expect(
      page.getByRole("link", { name: /This is my first visit/ }),
    ).toBeVisible();

    await page.getByRole("link", { name: /This is my first visit/ }).click();
    await page.getByLabel("First name").fill("Synthetic");

    await page.clock.fastForward(2 * 60_000);

    await expect(page).toHaveURL(/\/visit\/kiosk$/);

    // The form starts empty for the next visitor.
    await page.goto("/visit/new");
    await expect(page.getByLabel("First name")).toHaveValue("");
  });

  test("clears a finished check-in for the next visitor", async ({
    page,
  }) => {
    await page.clock.install();
    await page.route("**/api/register", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        json: { reference: "VIS-KIOSK1" },
        status: 201,
      });
    });
    await openKiosk(page);

    await page.goto("/visit/new");
    await page.getByLabel("First name").fill("Synthetic");
    await page.getByLabel("Last name").fill("Visitor");
    await page.getByLabel("Mobile number").fill("024 111 2233");
    await page
      .getByRole("button", { name: "Continue to visit details" })
      .click();
    await chooseOption(
      page,
      "Agency being visited",
      "Value for Money Office (VFM)",
    );
    await chooseOption(page, "Purpose of visit", "Official");
    await page.getByLabel("Person being visited").fill("Quality Officer");
    await chooseOption(page, "Wi-Fi access", "No, I don't need Wi-Fi");
    await page
      .getByRole("button", { name: "Register and check in" })
      .click();

    await expect(
      page.getByLabel("Visit reference VIS-KIOSK1"),
    ).toBeVisible();
    await expect(
      page.getByText("clears for the next visitor in 20 seconds"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Return to visitor home" }),
    ).toHaveAttribute("href", "/visit/kiosk");

    await page.clock.fastForward(20_000);

    await expect(page).toHaveURL(/\/visit\/kiosk$/);
  });

  test("opens the kiosk from the site root", async ({ page }) => {
    await installMockVisitorAccess(page);
    await page.goto("/");

    await expect(page).toHaveURL(/\/visit\/kiosk$/);
    await expect(
      page.getByRole("button", { name: "Show QR code" }),
    ).toBeVisible();
  });

  test("points reception staff to kiosk setup when access is missing", async ({
    page,
  }) => {
    await page.route("**/api/register", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: { error: "Scan the current reception QR code." },
        status: 401,
      }),
    );
    await page.goto("/visit/kiosk");

    await expect(page.getByText("choose Set up kiosk in the menu")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "sign in" }),
    ).toHaveAttribute("href", "/staff");
  });

  test("leaves phone visitors' pages alone", async ({ page }) => {
    await installMockVisitorAccess(page);
    await page.goto("/visit");

    await expect(
      page.getByRole("link", { name: "Visitor Management home" }),
    ).toHaveCount(0);
    // The returning page carries its own Back pill to the phone start.
    await page.goto("/visit/returning");
    await expect(
      page.getByRole("link", { name: "Back" }),
    ).toHaveAttribute("href", "/visit");
  });
});
