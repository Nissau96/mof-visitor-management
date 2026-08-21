import {
  expect,
  test,
} from "@playwright/test";
import {
  expectNoWcagViolations,
} from "./support/accessibility.js";
import {
  installMockVisitorAccess,
} from "./support/visitor-access.js";

const LOOKUP_TOKEN =
  "lookup-token-for-synthetic-e2e-visitor";

const VERIFICATION_TOKEN =
  "verification-token-for-synthetic-e2e-visitor";

const PRIVACY_ACKNOWLEDGEMENT =
  /I acknowledge that I have read and understood privacy notice version 2\.0/i;

async function fulfillJson(
  route,
  body,
  status = 200,
) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function configureVerificationRoutes(
  page,
) {
  const requests = {
    search: [],
    verification: [],
  };

  await page.route(
    "**/api/returning/search",
    async (route) => {
      requests.search.push(
        route.request().postDataJSON(),
      );

      await fulfillJson(route, {
        hasMore: false,
        results: [
          {
            lookupToken: LOOKUP_TOKEN,
            maskedName: "S******** V******",
            maskedOrganization:
              "Q****** T*** O***********",
            maskedPhone: "2233",
          },
        ],
      });
    },
  );

  await page.route(
    "**/api/returning/verify",
    async (route) => {
      requests.verification.push(
        route.request().postDataJSON(),
      );

      await fulfillJson(route, {
        expiresIn: 600,
        profile: {
          email:
            "synthetic@example.invalid",
          fullName: "Synthetic Visitor",
          organization:
            "Quality Test Organisation",
        },
        verificationToken:
          VERIFICATION_TOKEN,
      });
    },
  );

  return requests;
}

async function reachVerifiedVisitor(page) {
  const requests =
    await configureVerificationRoutes(page);

  await installMockVisitorAccess(page);

  await page.goto("/visit/returning");

  await expect(
    page.getByRole("heading", {
      name: "Continue your visit",
    }),
  ).toBeVisible();

  await page
    .getByLabel("Name search")
    .fill("  Syn  ");

  await page
    .getByRole("button", {
      name: "Search records",
    })
    .click();

  const resultButton =
    page.getByRole("button", {
      name: /Phone ending: 2233/i,
    });

  await expect(resultButton).toBeVisible();
  await resultButton.click();

  await page
    .getByLabel("Registered mobile number")
    .fill("024 111 2233");

  await page
    .getByRole("button", {
      name: "Verify mobile number",
    })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "Identity verified",
    }),
  ).toBeVisible();

  expect(requests.search).toEqual([
    {
      query: "Syn",
    },
  ]);

  expect(requests.verification).toEqual([
    {
      lookupToken: LOOKUP_TOKEN,
      phone: "+233241112233",
    },
  ]);

  return requests;
}

async function fillReturningVisit(page) {
  await page
    .getByLabel("Agency being visited")
    .selectOption("IAA");

  await page
    .getByLabel("Purpose of visit")
    .selectOption("Official");

  await page
    .getByLabel("Person being visited")
    .fill("Quality Test Officer");
}

test.describe("returning visitor workflow", () => {
  test("searches, verifies and completes check-in", async ({
    page,
  }) => {
    let checkInPayload = null;

    await page.route(
      "**/api/returning/check-in",
      async (route) => {
        checkInPayload =
          route.request().postDataJSON();

        await fulfillJson(
          route,
          {
            reference: "VIS-E2E2001",
          },
          201,
        );
      },
    );

    await reachVerifiedVisitor(page);
    await fillReturningVisit(page);

    await page
      .getByLabel(PRIVACY_ACKNOWLEDGEMENT)
      .check();

    await expectNoWcagViolations(page);

    await page
      .getByRole("button", {
        name: "Complete check-in",
      })
      .click();

    await expect(
      page.getByRole("heading", {
        name: "Welcome back",
      }),
    ).toBeVisible();

    await expect(
      page.getByLabel(
        "Visit reference VIS-E2E2001",
      ),
    ).toBeVisible();

   expect(checkInPayload).toMatchObject({
  agency: "IAA",
  personVisiting:
    "Quality Test Officer",
  privacyAcknowledged: true,
  purpose: "Official",
  verificationToken:
    VERIFICATION_TOKEN,
});

expect(
  checkInPayload,
).not.toHaveProperty("division");

    await expectNoWcagViolations(page);
  });

  test("blocks check-in without current privacy acknowledgement", async ({
    page,
  }) => {
    let checkInCalls = 0;

    await page.route(
      "**/api/returning/check-in",
      async (route) => {
        checkInCalls += 1;

        await fulfillJson(
          route,
          {
            reference: "VIS-UNEXPECTED",
          },
          201,
        );
      },
    );

    await reachVerifiedVisitor(page);
    await fillReturningVisit(page);

    await page
      .getByRole("button", {
        name: "Complete check-in",
      })
      .click();

    await expect(
      page.locator(
        "#privacyAcknowledged-error",
      ),
    ).toHaveText(
      "Acknowledge the current privacy notice before continuing.",
    );

    expect(checkInCalls).toBe(0);
  });

  test("resets the workflow when verification expires", async ({
    page,
  }) => {
    let checkInPayload = null;

    await page.route(
      "**/api/returning/check-in",
      async (route) => {
        checkInPayload =
          route.request().postDataJSON();

        await fulfillJson(
          route,
          {
            error:
              "Your verification has expired. Verify your mobile number again.",
          },
          401,
        );
      },
    );

    await reachVerifiedVisitor(page);
    await fillReturningVisit(page);

    await page
      .getByLabel(PRIVACY_ACKNOWLEDGEMENT)
      .check();

    await page
      .getByRole("button", {
        name: "Complete check-in",
      })
      .click();

    await expect(
      page.getByRole("status"),
    ).toContainText(
      "Your verification has expired. Verify your mobile number again.",
    );

    await expect(
      page.getByRole("heading", {
        name: "Identity verified",
      }),
    ).toHaveCount(0);

    await expect(
      page.getByLabel("Name search"),
    ).toHaveValue("");

    expect(checkInPayload).toMatchObject({
      agency: "IAA",
      privacyAcknowledged: true,
      verificationToken:
        VERIFICATION_TOKEN,
    });
  });
});