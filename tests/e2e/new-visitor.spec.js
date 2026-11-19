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

const MEETING_ID =
  "00000000-0000-4000-8000-000000000013";

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
      name: "Register your visit",
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
    .getByLabel("Email (optional)")
    .fill("SYNTHETIC@EXAMPLE.INVALID");

  await page
    .getByLabel("Organisation (optional)")
    .fill("Quality Test Organisation");

  await page
    .getByRole("button", { name: "Continue to visit details" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Visit details" }),
  ).toBeVisible();
}

async function fillNonMeetingVisit(page) {
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

    // Let the submit button finish turning teal before axe samples it.
    await page.waitForTimeout(300);
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

  test("counts required details and shows the privacy notice", async ({
    page,
  }) => {
    await openRegistration(page);

    const progress = page.getByRole("progressbar", {
      name: /required details/,
    });

    await expect(progress).toHaveAccessibleName("0 of 5 required details");

    await fillVisitorDetails(page);
    await fillNonMeetingVisit(page);

    // A purpose adds "Person being visited" and "Wi-Fi access" to the count.
    await expect(progress).toHaveAccessibleName("7 of 7 required details");

    const noticeButton = page.getByRole("button", {
      name: "Read the privacy notice",
    });

    await noticeButton.click();

    const dialog = page.getByRole("dialog", { name: "Privacy notice" });

    await expect(dialog.getByRole("region", { name: "Full privacy notice" })).toBeFocused();
    await expect(dialog.getByText("Who is responsible")).toBeVisible();
    await expectNoWcagViolations(page, { include: "[role=dialog]" });

    await dialog.getByRole("button", { name: "Close", exact: true }).click();

    await expect(dialog).toHaveCount(0);
    await expect(noticeButton).toBeFocused();
  });

  test("moves between the two steps without losing details", async ({
    page,
  }) => {
    await openRegistration(page);

    const steps = page.getByRole("list", { name: "Registration steps" });
    const continueButton = page.getByRole("button", {
      name: "Continue to visit details",
    });

    await expect(steps.locator("[aria-current=step]")).toContainText("Your details");

    // Step 1 must be valid before moving on.
    await continueButton.click();
    await expect(page.locator("#firstName-error")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Visit details" })).toBeHidden();

    await fillVisitorDetails(page);

    await expect(steps.locator("[aria-current=step]")).toContainText("Visit details");
    await expect(page.getByLabel("First name")).toBeHidden();
    await expectNoWcagViolations(page);

    await page.getByRole("button", { name: "Previous step" }).click();

    await expect(page.getByLabel("First name")).toHaveValue("Synthetic");
    await expect(page.getByLabel("Phone number")).toHaveValue("024 111 2233");
  });

  test("registers a group with a card for each guest", async ({
    page,
  }) => {
    let registrationPayload = null;

    await page.route(
      "**/api/register",
      async (route) => {
        registrationPayload =
          route.request().postDataJSON();

        await fulfillJson(
          route,
          {
            guestCount: 2,
            reference: "VIS-E2E1003",
          },
          201,
        );
      },
    );

    await openRegistration(page);

    const progress = page.getByRole("progressbar", {
      name: /required details/,
    });
    const addPerson = page.getByRole("button", { name: "Add a person" });
    const removePerson = page.getByRole("button", {
      name: "Remove a person",
    });

    await expect(removePerson).toHaveAttribute("aria-disabled", "true");

    await addPerson.click();
    await addPerson.click();
    await addPerson.click();

    await expect(page.getByRole("group", { name: "Guest 4" })).toBeVisible();
    await expect(progress).toHaveAccessibleName("0 of 14 required details");

    // Fewer people drops the last guest; Remove drops a specific one.
    await removePerson.click();
    await expect(page.getByRole("group", { name: "Guest 4" })).toHaveCount(0);

    await page.getByLabel("First name").first().fill("Synthetic");
    await page.getByLabel("Last name").first().fill("Visitor");
    await page.getByLabel("Phone number").first().fill("024 111 2233");

    // Guests are recorded under the lead's organisation.
    await expect(page.getByText("Guests are recorded under")).toHaveCount(0);
    await page.getByLabel("Organisation").fill("Synthetic Holdings");
    await expect(
      page.getByText("Guests are recorded under Synthetic Holdings."),
    ).toBeVisible();

    const guestTwo = page.getByRole("group", { name: "Guest 2" });
    const guestThree = page.getByRole("group", { name: "Guest 3" });

    await guestTwo.getByLabel("First name").fill("Ama");
    await guestTwo.getByLabel("Last name").fill("Mensah");
    await guestTwo.getByLabel("Phone number").fill("0241112233");
    await guestThree.getByLabel("First name").fill("Kofi");
    await guestThree.getByLabel("Last name").fill("Owusu");
    await guestThree.getByLabel("Phone number").fill("0244445566");

    await expect(progress).toHaveAccessibleName("9 of 11 required details");

    // Every person needs their own phone.
    await page
      .getByRole("button", { name: "Continue to visit details" })
      .click();

    await expect(page.locator("#guest-0-phone-error")).toHaveText(
      /different mobile number/,
    );
    await expect(guestTwo.getByLabel("Phone number")).toBeFocused();

    await guestTwo.getByLabel("Phone number").fill("0247778899");
    await expectNoWcagViolations(page);

    await page
      .getByRole("button", { name: "Continue to visit details" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Visit details" }),
    ).toBeVisible();
    await expect(
      page.getByText("you confirm you and your guests agree"),
    ).toBeVisible();

    await fillNonMeetingVisit(page);

    await page
      .getByRole("button", { name: "Register and check in" })
      .click();

    await expect(
      page.getByLabel("Visit reference VIS-E2E1003"),
    ).toBeVisible();
    await expect(page.getByText("For you and 2 guests")).toBeVisible();

    expect(registrationPayload.guests).toEqual([
      {
        firstName: "Ama",
        fullName: "Ama Mensah",
        lastName: "Mensah",
        phone: "+233247778899",
      },
      {
        firstName: "Kofi",
        fullName: "Kofi Owusu",
        lastName: "Owusu",
        phone: "+233244445566",
      },
    ]);
  });

  test("does not submit while required details are missing", async ({
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

    await page
      .getByRole("button", {
        name: "Register and check in",
      })
      .click();

    await expect(page.locator("#agency-error")).toBeVisible();

    expect(registrationCalls).toBe(0);
  });

  test("registers an official Ministry meeting", async ({
    page,
  }) => {
    let registrationPayload = null;
    const meetingRequests = [];

    // Only the Budget Office hosts a meeting today.
    await page.route(
      "**/api/meetings?**",
      async (route) => {
        expect(
          route.request().method(),
        ).toBe("GET");

        const query = new URL(route.request().url()).searchParams;

        meetingRequests.push(Object.fromEntries(query));

        await fulfillJson(route, {
          meetings:
            query.get("division") === "Budget Office"
              ? [
                  {
                    id: MEETING_ID,
                    title:
                      "Stage 13 Quality Meeting",
                  },
                ]
              : [],
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

    await chooseOption(
    page,
    "Agency being visited",
    "Ministry of Finance (MoF)",
  );

    await chooseOption(
    page,
    "Ministry of Finance division",
    "Budget Office",
  );

    await chooseOption(
    page,
    "Purpose of visit",
    "Meeting",
  );

    await expect(
      page.getByLabel("Title of meeting"),
    ).toBeVisible();

    await chooseOption(
    page,
    "Title of meeting",
    "Stage 13 Quality Meeting",
  );

    expect(meetingRequests.at(-1)).toEqual({
      agency: "Ministry of Finance (MoF)",
      division: "Budget Office",
    });

    // Another division has no meetings, and the chosen one is cleared.
    await chooseOption(
      page,
      "Ministry of Finance division",
      "Legal Directorate",
    );
    await expect(
      page.getByText("No meeting is listed for this agency today."),
    ).toBeVisible();
    expect(meetingRequests.at(-1)).toEqual({
      agency: "Ministry of Finance (MoF)",
      division: "Legal Directorate",
    });

    await chooseOption(
      page,
      "Ministry of Finance division",
      "Budget Office",
    );
    await expect(
      page.getByRole("button", { name: /^Title of meeting/ }),
    ).toContainText("Select a meeting");
    await chooseOption(
      page,
      "Title of meeting",
      "Stage 13 Quality Meeting",
    );

    // The meeting has not asked for Wi-Fi, so the visitor is asked.
    await chooseOption(
      page,
      "Wi-Fi access",
      "Yes, I need Wi-Fi access",
    );

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
      meetingCoversWifi: false,
      meetingId: MEETING_ID,
      purpose: "Meeting",
      wifiAccess: "yes",
    });

    expect(
      registrationPayload.personVisiting,
    ).toBeUndefined();

    expect(
      registrationPayload.customMeetingTitle,
    ).toBeUndefined();
  });
});