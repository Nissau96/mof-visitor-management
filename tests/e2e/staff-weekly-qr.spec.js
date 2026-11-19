import {
  expect,
  test,
} from "@playwright/test";
import {
  expectNoWcagViolations,
} from "./support/accessibility.js";
import {
  SYNTHETIC_ACCESS_TOKEN,
  installMockStaffAuthentication,
  signInAsStaff,
} from "./support/staff-authentication.js";

const ACCESS_URL =
  "http://127.0.0.1:4173/visit#weeklyAccess=synthetic-weekly-token";

// Monday-to-Sunday week containing today (UTC = Accra time).
function currentWeek() {
  const today = new Date();
  const todayStart = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const monday =
    todayStart -
    ((today.getUTCDay() + 6) % 7) * 86_400_000;
  const sunday = monday + 6 * 86_400_000;
  const iso = (time) =>
    new Date(time).toISOString().slice(0, 10);

  return {
    expiresAt: new Date(
      sunday + 86_400_000,
    ).toISOString(),
    validFrom: new Date(monday).toISOString(),
    validThrough: new Date(
      sunday + 86_400_000 - 1000,
    ).toISOString(),
    weekEndsOn: iso(sunday),
    weekStartsOn: iso(monday),
  };
}

async function installMockWeeklyQr(page) {
  const state = {
    requests: 0,
  };

  // Registered after the auth mock, so it handles POST /api/staff/session.
  await page.route(
    "**/api/staff/session",
    async (route) => {
      const request = route.request();

      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      state.requests += 1;

      await route.fulfill({
        contentType: "application/json",
        json: {
          weeklyQr: {
            accessUrl: ACCESS_URL,
            ...currentWeek(),
          },
        },
        status: 200,
      });
    },
  );

  return state;
}

test.describe(
  "weekly visitor QR page",
  () => {
    test("shows the reception poster and week details without accessibility or overflow problems", async ({
      page,
    }) => {
      await installMockStaffAuthentication(
        page,
      );

      const weeklyQr =
        await installMockWeeklyQr(page);

      await signInAsStaff(page, {
        destination: "/staff/weekly-qr",
      });

      await expect(
        page.getByRole("heading", {
          name: "Weekly visitor QR code",
        }),
      ).toBeVisible();

      await expect(
        page.getByRole("img", {
          name: /Weekly visitor QR code, valid/,
        }),
      ).toBeVisible();

      await expect(
        page.getByRole("heading", {
          name: "Visitor Registration",
        }),
      ).toBeVisible();

      await expect(
        page.getByRole("heading", {
          name: "This week",
        }),
      ).toBeVisible();

      await expect(
        page.getByText("Day ", {
          exact: false,
        }).first(),
      ).toBeVisible();

      expect(weeklyQr.requests).toBe(1);

      await expectNoWcagViolations(page);

      const hasHorizontalOverflow =
        await page.evaluate(
          () =>
            document.documentElement
              .scrollWidth >
            document.documentElement
              .clientWidth,
        );

      expect(hasHorizontalOverflow).toBe(
        false,
      );
    });

    test("sets up and removes kiosk tablets from the sidebar", async ({
      page,
    }) => {
      const kioskRequests = [];

      await installMockStaffAuthentication(page);
      await installMockWeeklyQr(page);
      await page.route(/\/api\/staff\/session\?kiosks?=/, async (route) => {
        const request = route.request();

        kioskRequests.push({
          body: request.postDataJSON(),
          method: request.method(),
          url: request.url(),
        });

        if (request.method() === "GET") {
          await route.fulfill({
            contentType: "application/json",
            json: {
              kiosks: [
                {
                  createdAt: "2026-11-04T09:00:00.000Z",
                  createdByName: "Synthetic Receptionist",
                  expiresAt: "2027-11-04T09:00:00.000Z",
                  id: "00000000-0000-4000-8000-0000000000a1",
                  label: "Tower 2 lobby",
                  lastSeenAt: "2026-11-05T10:00:00.000Z",
                },
              ],
            },
          });
          return;
        }

        await route.fulfill({
          contentType: "application/json",
          json:
            request.method() === "DELETE"
              ? { removed: true }
              : { kiosk: { expiresAt: "2027-11-06T09:00:00.000Z" } },
          status: request.method() === "POST" ? 201 : 200,
        });
      });

      await signInAsStaff(page, {
        destination: "/staff/weekly-qr",
      });

      await expect(
        page.getByRole("heading", { name: "Weekly visitor QR code" }),
      ).toBeVisible();

      const menuButton = page.getByRole("button", {
        name: "Open navigation menu",
      });

      if (await menuButton.isVisible()) {
        await menuButton.click();
      }

      await page
        .getByRole("button", { name: "Set up kiosk" })
        .filter({ visible: true })
        .first()
        .click();

      const dialog = page.getByRole("dialog", { name: "Set up kiosk" });

      await expect(dialog.getByText("Tower 2 lobby")).toBeVisible();
      await expectNoWcagViolations(page, { include: "[role=dialog]" });

      // Remove a lost tablet.
      await dialog
        .getByRole("button", { name: "Remove Tower 2 lobby" })
        .click();
      await dialog.getByRole("button", { name: "Remove tablet" }).click();
      await expect(dialog.getByText("No tablets are set up yet.")).toBeVisible();
      expect(kioskRequests.at(-1)).toMatchObject({
        method: "DELETE",
        url: expect.stringContaining(
          "kiosk=00000000-0000-4000-8000-0000000000a1",
        ),
      });

      // Set up this device; it needs a name first.
      await dialog
        .getByRole("button", { name: "Set up and sign out" })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "2 to 60 characters",
      );

      await dialog.getByLabel("Tablet name").fill("Tower 1 reception");
      await dialog
        .getByRole("button", { name: "Set up and sign out" })
        .click();

      await expect(page).toHaveURL(/\/visit\/kiosk$/);
      expect(kioskRequests.at(-1)).toMatchObject({
        body: { label: "Tower 1 reception" },
        method: "POST",
      });
    });

    test("copies the full access link and downloads the poster", async ({
      context,
      page,
    }) => {
      await context.grantPermissions([
        "clipboard-read",
        "clipboard-write",
      ]);

      await installMockStaffAuthentication(
        page,
      );

      await installMockWeeklyQr(page);

      await signInAsStaff(page, {
        destination: "/staff/weekly-qr",
      });

      await page
        .getByRole("button", {
          name: "Copy link",
        })
        .click();

      await expect(
        page.getByRole("button", {
          name: "Copied",
        }),
      ).toBeVisible();

      expect(
        await page.evaluate(() =>
          navigator.clipboard.readText(),
        ),
      ).toBe(ACCESS_URL);

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page
          .getByRole("button", {
            name: "Download PNG",
          })
          .click(),
      ]);

      expect(
        download.suggestedFilename(),
      ).toMatch(
        /^mof-visitor-poster-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.png$/,
      );
    });
  },
);
