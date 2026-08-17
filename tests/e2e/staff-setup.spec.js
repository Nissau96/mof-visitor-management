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
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_STAFF_EMAIL,
} from "./support/staff-authentication.js";

const STAFF_SETUP_PATH =
  "/staff/setup";

const VALID_PASSWORD =
  "SecurePassword!2026";

function createUpdatedUser() {
  const timestamp =
    "2026-08-17T10:30:00.000Z";

  return {
    app_metadata: {
      provider: "email",
      providers: [
        "email",
      ],
    },
    aud: "authenticated",
    confirmed_at: timestamp,
    created_at: timestamp,
    email: SYNTHETIC_STAFF_EMAIL,
    email_confirmed_at: timestamp,
    id:
      "00000000-0000-4000-8000-000000000020",
    identities: [],
    is_anonymous: false,
    last_sign_in_at: timestamp,
    phone: "",
    role: "authenticated",
    updated_at: timestamp,
    user_metadata: {},
  };
}

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

async function installMockPasswordUpdate(
  page,
  {
    rejectUpdate = false,
  } = {},
) {
  const state = {
    updateRequests: [],
  };

  await page.route(
    "**/auth/v1/user",
    async (route) => {
      const request = route.request();

      if (request.method() !== "PUT") {
        await route.fallback();
        return;
      }

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      const body = request.postDataJSON();

      state.updateRequests.push(body);

      if (rejectUpdate) {
        await route.fulfill({
          contentType: "application/json",
          json: {
            code:
              "invite_token_expired",
            message:
              "The invitation has expired.",
          },
          status: 422,
        });

        return;
      }

      await route.fulfill({
        contentType: "application/json",
        json: {
          user: createUpdatedUser(),
        },
        status: 200,
      });
    },
  );

  return state;
}

async function openAuthenticatedSetup(
  page,
  options = {},
) {
  await installMockStaffAuthentication(
    page,
    {
      fullName:
        "Synthetic Invited Staff",
      role: "receptionist",
    },
  );

  const state =
    await installMockPasswordUpdate(
      page,
      options,
    );

  await signInAsStaff(page, {
    destination: "/staff",
  });

  await page.goto(STAFF_SETUP_PATH);

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
  "invited staff password setup",
  () => {
    test(
      "shows an unavailable invitation when no authenticated session exists",
      async ({ page }) => {
        await page.goto(
          STAFF_SETUP_PATH,
        );

        await expect(
          page.getByRole("heading", {
            level: 1,
            name:
              "Invitation unavailable",
          }),
        ).toBeVisible();

        await expect(
          page.getByText(
            /invalid, has expired or has already been used/i,
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
          await openAuthenticatedSetup(
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
          state.updateRequests,
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
          state.updateRequests,
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
      "creates a password and continues to the staff portal",
      async ({ page }) => {
        const state =
          await openAuthenticatedSetup(
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
      state.updateRequests.at(-1)
        ?.password,
  )
  .toBe(VALID_PASSWORD);

expect(
  state.updateRequests,
).toHaveLength(1);

        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Password created",
          }),
        ).toBeVisible();

        await expect(
          page.getByText(
            /staff account has been secured successfully/i,
          ),
        ).toBeVisible();

        await page
          .getByRole("button", {
            name:
              "Continue to staff portal",
          })
          .click();

        await expect
          .poll(() => {
            const url = new URL(
              page.url(),
            );

            return url.pathname;
          })
          .toBe("/staff");
      },
    );

    test(
      "shows an error when the invitation can no longer update the password",
      async ({ page }) => {
        const state =
          await openAuthenticatedSetup(
            page,
            {
              rejectUpdate: true,
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
              state.updateRequests.length,
          )
          .toBe(1);

        await expect(
          page.getByRole("alert"),
        ).toContainText(
          "Your password could not be set. The invitation may have expired.",
        );

        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Create your password",
          }),
        ).toBeVisible();

        await expect(
          page.getByRole("button", {
            name: "Create password",
          }),
        ).toBeEnabled();
      },
    );
  },
);