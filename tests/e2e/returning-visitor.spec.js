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
import { chooseOption } from "./support/select.js";

const VERIFICATION_TOKEN =
  "verification-token-for-synthetic-e2e-visitor";

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

const SMS_CODE = "123456";

// SMS codes are off unless the server switches them on.
async function configureVerificationRoutes(
  page,
  profile = {},
  { smsCodes = false } = {},
) {
  const requests = {
    codes: [],
    verification: [],
  };

  await page.route(
    "**/api/returning/verify?operation=mode",
    (route) => fulfillJson(route, { smsCodes }),
  );

  await page.route(
    "**/api/returning/send-code",
    async (route) => {
      requests.codes.push(route.request().postDataJSON());

      // The same answer whether or not the number is registered.
      await fulfillJson(route, {
        codeLength: 6,
        expiresIn: 300,
        maskedPhone: "024 ••• ••33",
        resendAfterSeconds: 60,
      });
    },
  );

  await page.route(
    "**/api/returning/verify",
    async (route) => {
      const body = route.request().postDataJSON();

      requests.verification.push(body);

      if (!smsCodes && body.phone !== "+233241112233") {
        await fulfillJson(
          route,
          {
            error:
              "We couldn't find a visitor with that mobile number. Check it and try again, or register as a first-time visitor.",
            notFound: true,
          },
          400,
        );
        return;
      }

      if (smsCodes && body.code !== SMS_CODE) {
        await fulfillJson(
          route,
          {
            attemptsLeft: 4,
            error:
              "That code is not right. You have 4 tries left.",
          },
          400,
        );
        return;
      }

      await fulfillJson(route, {
        expiresIn: 600,
        // Thirty days before the test runs.
        lastVisitAt: new Date(
          Date.now() - 30 * 86_400_000,
        ).toISOString(),
        profile: {
          email: "s•••••@example.invalid",
          fullName: "Synthetic Visitor",
          organization:
            "Quality Test Organisation",
          phone: "024 ••• ••33",
          ...profile,
        },
        verificationToken:
          VERIFICATION_TOKEN,
      });
    },
  );

  return requests;
}

async function requestCode(page) {
  await page
    .getByLabel("Mobile number")
    .fill("024 111 2233");

  await page
    .getByRole("button", { name: "Send code" })
    .click();

  await expect(
    page.getByRole("status").filter({ hasText: "we have sent a 6-digit code" }),
  ).toBeVisible();
}

// Codes off: the number alone finds the record.
async function findByNumber(page, number = "024 111 2233") {
  await page
    .getByLabel("Mobile number")
    .fill(number);

  await page
    .getByRole("button", { name: "Find my record" })
    .click();
}

async function findRecord(page, code = SMS_CODE) {
  await requestCode(page);

  await page
    .getByLabel("Code from the SMS")
    .fill(code);

  await page
    .getByRole("button", { name: "Verify and continue" })
    .click();
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

  await findByNumber(page);

  await expect(
    page.getByRole("heading", {
      name: "Identity verified",
    }),
  ).toBeVisible();

  expect(requests.codes).toEqual([]);
  expect(requests.verification).toEqual([
    { phone: "+233241112233" },
  ]);

  return requests;
}

async function fillReturningVisit(page) {
  await chooseOption(
    page,
    "Agency being visited",
    "Internal Audit Agency (IAA)",
  );

  await chooseOption(
    page,
    "Purpose of visit",
    "Official",
  );

  await page
    .getByLabel("Person being visited")
    .fill("Quality Test Officer");

  await chooseOption(
    page,
    "Wi-Fi access",
    "No, I don't need Wi-Fi",
  );
}

test.describe("returning visitor workflow", () => {
  test("finds the record by mobile number and completes check-in", async ({
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

  test("offers to fill in a missing organisation and email", async ({
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
          { reference: "VIS-E2E2002" },
          201,
        );
      },
    );

    await configureVerificationRoutes(page, {
      email: "",
      organization: "",
    });
    await installMockVisitorAccess(page);
    await page.goto("/visit/returning");
    await findByNumber(page);

    await page
      .getByLabel("Organisation (optional)")
      .fill("Synthetic Holdings");
    await page
      .getByLabel("Email address (optional)")
      .fill("not-an-email");

    await fillReturningVisit(page);
    await page
      .getByRole("button", { name: "Complete check-in" })
      .click();

    await expect(
      page.locator("#returning-email-error"),
    ).toContainText("valid email");
    expect(checkInPayload).toBeNull();

    await page
      .getByLabel("Email address (optional)")
      .fill("Visitor@Example.com");

    // The privacy notice opens from the line above the buttons.
    await page
      .getByRole("button", { name: "Read the privacy notice" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Privacy notice" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close", exact: true })
      .click();

    await expectNoWcagViolations(page);
    await page
      .getByRole("button", { name: "Complete check-in" })
      .click();

    await expect(
      page.getByLabel("Visit reference VIS-E2E2002"),
    ).toBeVisible();
    expect(checkInPayload).toMatchObject({
      email: "visitor@example.com",
      organization: "Synthetic Holdings",
      privacyAcknowledged: true,
    });
  });

  test("shows existing details without letting them change", async ({
    page,
  }) => {
    await reachVerifiedVisitor(page);

    await expect(
      page.getByText("Quality Test Organisation"),
    ).toBeVisible();
    await expect(
      page.getByText("024 ••• ••33"),
    ).toBeVisible();
    await expect(
      page.getByText("Last visit"),
    ).toBeVisible();
    await expect(
      page.getByText("· 30 days ago"),
    ).toBeVisible();
    await expect(
      page.getByLabel("Organisation (optional)"),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Email address (optional)"),
    ).toHaveCount(0);
  });

  test("counts down the verification and starts over when it runs out", async ({
    page,
  }) => {
    await page.clock.install();
    await reachVerifiedVisitor(page);

    const timer = page.getByRole("timer");

    await expect(timer).toContainText("Finish within 10:00");

    await page.clock.fastForward(9 * 60_000);

    await expect(timer).toContainText("Finish within 1:00");

    await page.clock.fastForward(60_000);

    await expect(
      page.getByRole("heading", {
        name: "Identity verified",
      }),
    ).toHaveCount(0);

    await expect(
      page.getByRole("status"),
    ).toContainText(
      "Your verification expired. Enter your mobile number to get a new code.",
    );
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
      page.getByLabel("Mobile number"),
    ).toHaveValue("");

    expect(checkInPayload).toMatchObject({
      agency: "IAA",
      privacyAcknowledged: true,
      verificationToken:
        VERIFICATION_TOKEN,
    });
  });

  test("finds the record by number alone while SMS codes are off", async ({
    page,
  }) => {
    await configureVerificationRoutes(page);
    await installMockVisitorAccess(page);
    await page.goto("/visit/returning");

    await expect(page.getByLabel("First name")).toHaveCount(0);
    await expect(page.getByLabel("Code from the SMS")).toHaveCount(0);

    await findByNumber(page, "024 999 8877");

    const notFound = page.getByRole("alert");
    await expect(notFound).toContainText("Record not found");
    await expect(page.getByText("Synthetic Visitor")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Register here" }),
    ).toHaveAttribute("href", "/visit/new");
    await expectNoWcagViolations(page);

    await findByNumber(page);
    await expect(
      page.getByRole("heading", { name: "Today’s visit details" }),
    ).toBeFocused();
  });

  test("asks for an SMS code when the server switches codes on", async ({
    page,
  }) => {
    await configureVerificationRoutes(page, {}, { smsCodes: true });
    await installMockVisitorAccess(page);
    await page.goto("/visit/returning");

    const currentStep = page
      .getByRole("list", { name: "Check-in steps" })
      .locator("[aria-current=step]");

    await expect(currentStep).toContainText("Find your record");
    await expect(page.getByLabel("First name")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Register here" }),
    ).toHaveAttribute("href", "/visit/new");
    await expectNoWcagViolations(page);

    await findRecord(page, "000000");

    await expect(
      page.getByText("That code is not right. You have 4 tries left."),
    ).toBeVisible();
    await expect(page.getByText("Synthetic Visitor")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Resend code in / }),
    ).toBeDisabled();
    await expectNoWcagViolations(page);

    await page.getByLabel("Code from the SMS").fill(SMS_CODE);
    await page
      .getByRole("button", { name: "Verify and continue" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Today’s visit details" }),
    ).toBeFocused();
    await expect(currentStep).toContainText("Visit details");
    await expect(
      page.getByText("s•••••@example.invalid"),
    ).toBeVisible();

    // Going back keeps the number; a new code is needed.
    await page
      .getByRole("button", { name: "Previous step" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Find your record" }),
    ).toBeFocused();
    await expect(page.getByLabel("Mobile number")).toHaveValue(
      "024 111 2233",
    );
    await expect(
      page.getByRole("button", { name: "Send code" }),
    ).toBeVisible();
  });
});
