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

const STAFF_SETUP_PATH =
  "/staff/setup";

const VALID_PASSWORD =
  "SecurePassword!2026";

async function expectNoHorizontalOverflow(
  page,
) {
  const dimensions = await page.evaluate(
    () => {
      const documentElement =
        document.documentElement;

      const body = document.body;

      return {
        clientWidth:
          documentElement.clientWidth,
        scrollWidth: Math.max(
          documentElement.scrollWidth,
          body?.scrollWidth || 0,
        ),
      };
    },
  );

  expect(
    dimensions.scrollWidth,
  ).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function openPendingSetup(
  page,
  options = {},
) {
  const state =
    await installMockStaffAuthentication(
      page,
      {
        fullName:
          "Synthetic Invited Staff",
        passwordChangeRequired:
          true,
        role: "receptionist",
        temporaryPasswordExpiresAt:
          "2099-08-25T14:30:00.000Z",
        ...options,
      },
    );

  await signInAsStaff(page, {
    destination: "/staff",
    expectedDestination:
      STAFF_SETUP_PATH,
  });

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Create your password",
    }),
  ).toBeVisible();

  return state;
}

function newPasswordInput(page) {
  return page.getByLabel(
    /^New password/i,
  );
}

function confirmationInput(page) {
  return page.getByLabel(
    /^Confirm new password/i,
  );
}

test.describe(
  "temporary staff password setup",
  () => {
    test(
      "requires a temporary-password sign-in when no session exists",
      async ({ page }) => {
        await page.goto(
          STAFF_SETUP_PATH,
        );

        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Sign in required",
          }),
        ).toBeVisible();

        await expect(
          page.getByText(
            /temporary password provided in your staff account email/i,
          ),
        ).toBeVisible();

        await expect(
          page.getByRole("link", {
            name:
              "Go to staff sign-in",
          }),
        ).toHaveAttribute(
          "href",
          "/staff/login",
        );

        await expectNoWcagViolations(
          page,
        );

        await expectNoHorizontalOverflow(
          page,
        );
      },
    );

    test(
      "validates passwords and supports password visibility controls",
      async ({ page }) => {
        const state =
          await openPendingSetup(
            page,
          );

        await expect(
          page.getByText(
            "Welcome, Synthetic Invited Staff.",
            {
              exact: false,
            },
          ),
        ).toBeVisible();

        await expect(
          page.locator(
            "p:visible",
            {
              hasText:
                "Temporary password expires",
            },
          ),
        ).toBeVisible();

        await page
          .getByRole("button", {
            name: "Create password",
          })
          .click();

        await expect(
          page.getByText(
            "Password must contain at least 12 characters.",
          ),
        ).toHaveCount(2);

        expect(
          state.passwordSetupRequests,
        ).toHaveLength(0);

        await newPasswordInput(
          page,
        ).fill(VALID_PASSWORD);

        await confirmationInput(
          page,
        ).fill(
          "DifferentPassword!2026",
        );

        await page
          .getByRole("button", {
            name: "Create password",
          })
          .click();

        await expect(
          page.getByText(
            "Passwords do not match.",
          ),
        ).toBeVisible();

        expect(
          state.passwordSetupRequests,
        ).toHaveLength(0);

        await page
          .getByRole("button", {
            name: "Show passwords",
          })
          .click();

        await expect(
          newPasswordInput(page),
        ).toHaveAttribute(
          "type",
          "text",
        );

        await expect(
          confirmationInput(page),
        ).toHaveAttribute(
          "type",
          "text",
        );

        await expect(
          page.getByRole("button", {
            name: "Hide passwords",
          }),
        ).toBeVisible();

        await expectNoWcagViolations(
          page,
        );

        await expectNoHorizontalOverflow(
          page,
        );
      },
    );

    test(
      "creates a personal password, signs out and requires fresh sign-in",
      async ({ page }) => {
        const state =
          await openPendingSetup(
            page,
          );

        await newPasswordInput(
          page,
        ).fill(VALID_PASSWORD);

        await confirmationInput(
          page,
        ).fill(VALID_PASSWORD);

        await page
          .getByRole("button", {
            name: "Create password",
          })
          .click();

        await expect
          .poll(
            () =>
              state
                .passwordSetupRequests
                .length,
          )
          .toBe(1);

        expect(
          state.passwordSetupRequests[0],
        ).toEqual({
          confirmPassword:
            VALID_PASSWORD,
          password:
            VALID_PASSWORD,
        });

        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Password created",
          }),
        ).toBeVisible();

        await expect(
          page.getByText(
            /temporary password has been replaced successfully/i,
          ),
        ).toBeVisible();

        await expect
          .poll(
            () =>
              state.logoutRequests,
          )
          .toBe(1);

        await expect(
          page.getByRole("link", {
            name:
              "Sign in with your new password",
          }),
        ).toHaveAttribute(
          "href",
          "/staff/login",
        );

        await expectNoWcagViolations(
          page,
        );

        await expectNoHorizontalOverflow(
          page,
        );
      },
    );

    test(
      "shows the API error when the temporary password has expired",
      async ({ page }) => {
        const state =
          await openPendingSetup(
            page,
            {
              passwordSetupError: {
                message:
                  "Your temporary password has expired. Contact an administrator for a new temporary password.",
                status: 403,
              },
            },
          );

        await newPasswordInput(
          page,
        ).fill(VALID_PASSWORD);

        await confirmationInput(
          page,
        ).fill(VALID_PASSWORD);

        await page
          .getByRole("button", {
            name: "Create password",
          })
          .click();

        await expect
          .poll(
            () =>
              state
                .passwordSetupRequests
                .length,
          )
          .toBe(1);

        await expect(
          page.getByRole("alert"),
        ).toContainText(
          "Your temporary password has expired. Contact an administrator for a new temporary password.",
        );

        await expect(
          page.getByRole("heading", {
            level: 1,
            name:
              "Create your password",
          }),
        ).toBeVisible();

        await expect(
          page.getByRole("button", {
            name: "Create password",
          }),
        ).toBeEnabled();
      },
    );

    test(
      "cancels setup by signing out and returning to sign-in",
      async ({ page }) => {
        const state =
          await openPendingSetup(
            page,
          );

        await page
          .getByRole("button", {
            name: "Cancel setup",
          })
          .click();

        await expect
          .poll(
            () =>
              state.logoutRequests,
          )
          .toBe(1);

        await expect
          .poll(() => {
            return new URL(
              page.url(),
            ).pathname;
          })
          .toBe("/staff/login");

        await expect(
          page.getByRole("heading", {
            name: "Sign in",
          }),
        ).toBeVisible();
      },
    );

    test(
      "redirects a completed account away from password setup",
      async ({ page }) => {
        await installMockStaffAuthentication(
          page,
          {
            fullName:
              "Synthetic Receptionist",
            passwordChangeRequired:
              false,
            role: "receptionist",
          },
        );

        await signInAsStaff(page);

        await page.goto(
          STAFF_SETUP_PATH,
        );

        await expect
          .poll(() => {
            return new URL(
              page.url(),
            ).pathname;
          })
          .toBe("/staff");
      },
    );
  },
);
