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

const MEETING_ID =
  "00000000-0000-4000-8000-000000000013";

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

async function openRegistration(page) {
  await installMockVisitorAccess(page);

  await page.goto("/visit/new");

  await expect(
    page.getByRole("heading", {
      name: "Visitor time-in details",
    }),
  ).toBeVisible();
}

async function fillVisitorDetails(page) {
  await page
    .getByLabel("First name")
    .fill("Synthetic");

  await page
    .getByLabel("Last name")
    .fill("Visitor");

  await page
    .getByLabel("Phone number")
    .fill("024 111 2233");

  await page
    .getByLabel("Email address (optional)")
    .fill("SYNTHETIC@EXAMPLE.INVALID");

  await page
    .getByLabel("Your organisation (optional)")
    .fill("Quality Test Organisation");
}

async function fillNonMeetingVisit(page) {
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

test.describe("first-time visitor workflow", () => {
  test("registers a valid non-meeting visit", async ({
    page,
  }) => {
    let registrationPayload = null;

    await page.route(
      "**/api/register",
      async (route) => {
        expect(
          route.request().method(),
        ).toBe("POST");

        registrationPayload =
          route.request().postDataJSON();

        await fulfillJson(
          route,
          {
            reference: "VIS-E2E1001",
          },
          201,
        );
      },
    );

    await openRegistration(page);
    await fillVisitorDetails(page);
    await fillNonMeetingVisit(page);

    await page
      .getByLabel(PRIVACY_ACKNOWLEDGEMENT)
      .check();

    await expectNoWcagViolations(page);

    await page
      .getByRole("button", {
        name: "Register and check in",
      })
      .click();

    await expect(
      page.getByRole("heading", {
        name: "Welcome to the Ministry",
      }),
    ).toBeVisible();

    await expect(
      page.getByLabel(
        "Visit reference VIS-E2E1001",
      ),
    ).toBeVisible();

    expect(registrationPayload).toMatchObject({
  agency: "IAA",
  consent: true,
  email: "synthetic@example.invalid",
  firstName: "Synthetic",
  fullName: "Synthetic Visitor",
  lastName: "Visitor",
  organization:
    "Quality Test Organisation",
  personVisiting:
    "Quality Test Officer",
  phone: "+233241112233",
  purpose: "Official",
});

expect(
  registrationPayload,
).not.toHaveProperty("division");

    await expectNoWcagViolations(page);
  });

  test("blocks submission without privacy acknowledgement", async ({
    page,
  }) => {
    let registrationCalls = 0;

    await page.route(
      "**/api/register",
      async (route) => {
        registrationCalls += 1;

        await fulfillJson(
          route,
          {
            reference: "VIS-UNEXPECTED",
          },
          201,
        );
      },
    );

    await openRegistration(page);
    await fillVisitorDetails(page);
    await fillNonMeetingVisit(page);

    await page
      .getByRole("button", {
        name: "Register and check in",
      })
      .click();

    await expect(
      page.locator("#consent-error"),
    ).toHaveText(
      "Acknowledge the privacy notice before continuing.",
    );

    expect(registrationCalls).toBe(0);
  });

  test("registers an official Ministry meeting", async ({
    page,
  }) => {
    let registrationPayload = null;

    await page.route(
      "**/api/meetings",
      async (route) => {
        expect(
          route.request().method(),
        ).toBe("GET");

        await fulfillJson(route, {
          meetings: [
            {
              id: MEETING_ID,
              title:
                "Stage 13 Quality Meeting",
            },
          ],
        });
      },
    );

    await page.route(
      "**/api/register",
      async (route) => {
        registrationPayload =
          route.request().postDataJSON();

        await fulfillJson(
          route,
          {
            reference: "VIS-E2E1002",
          },
          201,
        );
      },
    );

    await openRegistration(page);
    await fillVisitorDetails(page);

    await page
      .getByLabel("Agency being visited")
      .selectOption(
        "Ministry of Finance (MoF)",
      );

    await page
      .getByLabel(
        "Ministry of Finance division",
      )
      .selectOption("Budget Office");

    await page
      .getByLabel("Purpose of visit")
      .selectOption("Meeting");

    await expect(
      page.getByLabel("Title of meeting"),
    ).toBeVisible();

    await page
      .getByLabel("Title of meeting")
      .selectOption(MEETING_ID);

    await page
      .getByLabel(PRIVACY_ACKNOWLEDGEMENT)
      .check();

    await page
      .getByRole("button", {
        name: "Register and check in",
      })
      .click();

    await expect(
      page.getByLabel(
        "Visit reference VIS-E2E1002",
      ),
    ).toBeVisible();

    expect(registrationPayload).toMatchObject({
      agency: "Ministry of Finance (MoF)",
      consent: true,
      division: "Budget Office",
      meetingId: MEETING_ID,
      purpose: "Meeting",
    });

    expect(
      registrationPayload.personVisiting,
    ).toBeUndefined();

    expect(
      registrationPayload.customMeetingTitle,
    ).toBeUndefined();
  });
});