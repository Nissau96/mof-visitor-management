import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/accessibility.js";
import { installMockStaffAuthentication, signInAsStaff } from "./support/staff-authentication.js";

const CODE = "K7pQ2xZm";

const VISIT = {
  contact: { email: "k•••••@example.invalid", phone: "020 ••• ••81" },
  firstName: "Kofi",
  hostName: "Ama Mensah",
  office: "Budget Office",
  reference: "VIS-7F31A2",
  status: "open",
  visitedAt: "2026-11-19T09:00:00Z",
};

test.describe("visitor feedback link", () => {
  test("walks through the four questions and thanks the visitor", async ({ page }) => {
    const submitted = [];

    await page.route("**/api/feedback/view", (route) => route.fulfill({ json: { feedback: VISIT } }));
    await page.route("**/api/feedback/submit", async (route) => {
      submitted.push(route.request().postDataJSON());
      await route.fulfill({ json: { saved: true }, status: 201 });
    });

    await page.goto(`/f/${CODE}`);

    await expect(page.getByRole("heading", { level: 1, name: "How was your visit to the Ministry today?" })).toBeVisible();
    await expect(page.getByText("VIS-7F31A2").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("Budget Office · Ama Mensah").filter({ visible: true }).first()).toBeVisible();
    await expectNoWcagViolations(page);

    await page.getByRole("button", { name: "Continue" }).click({ force: true });
    await expect(page.getByRole("alert")).toHaveText("Choose a face to continue.");

    await page.getByText("Good", { exact: true }).click();
    await expect(page.getByRole("radio", { exact: true, name: "Good" })).toBeChecked();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "What stood out?" })).toBeFocused();
    await page.getByText("Quick check-in").click();
    await page.getByText("Friendly reception staff").click();
    await expectNoWcagViolations(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Check-in speed: good" }).click();
    await page.getByRole("button", { name: "Finding your way: not good" }).click();
    await expect(page.getByRole("button", { name: "Check-in speed: good" })).toHaveAttribute("aria-pressed", "true");
    await expectNoWcagViolations(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Your comment (optional)").fill("Thank you to the front desk.");
    await expect(page.getByText("We would use 020 ••• ••81 or k•••••@example.invalid")).toBeVisible();
    await page.getByRole("switch", { name: "You may contact me about this feedback" }).click();
    await expectNoWcagViolations(page);
    await page.getByRole("button", { name: "Send feedback" }).click();

    await expect(page.getByRole("heading", { name: "Thank you, Kofi!" })).toBeVisible();
    await expect(page.getByText("You rated: Good")).toBeVisible();
    expect(submitted[0]).toEqual({
      checkInOk: true,
      code: CODE,
      comment: "Thank you to the front desk.",
      contactOk: true,
      courtesyOk: null,
      highlights: ["quick_check_in", "friendly_staff"],
      rating: 4,
      wayfindingOk: false,
    });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("asks what went wrong after a low rating and allows skipping", async ({ page }) => {
    const requests = [];

    await page.route("**/api/feedback/view", async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: { feedback: { reference: "VIS-7F31A2", status: "open" } } });
    });
    await page.route("**/api/feedback/submit", async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: { saved: true }, status: 201 });
    });

    await page.goto("/f/K7pQ2xZm");
    await page.getByText("Very poor", { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "What went wrong?" })).toBeVisible();
    await page.getByText("Long wait at reception").click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Skip" }).click();

    // No contact details on file, so there is no contact switch.
    await expect(page.getByRole("switch")).toHaveCount(0);
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();

    expect(requests).toEqual([
      { code: "K7pQ2xZm" },
      {
        checkInOk: null,
        code: "K7pQ2xZm",
        comment: "",
        contactOk: false,
        courtesyOk: null,
        highlights: ["long_wait"],
        rating: 1,
        wayfindingOk: null,
      },
    ]);
  });

  test("explains an expired or unknown link", async ({ page }) => {
    await page.route("**/api/feedback/view", (route) =>
      route.fulfill({ json: { feedback: { reference: "VIS-7F31A2", status: "expired" } } }),
    );
    await page.goto(`/f/${CODE}`);
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();

    await page.unroute("**/api/feedback/view");
    await page.route("**/api/feedback/view", (route) => route.fulfill({ json: { error: "This feedback link is not valid." }, status: 404 }));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Link not valid" })).toBeVisible();
  });
});

test.describe("staff visitor feedback", () => {
  const response = {
    feedback: [
      { checkInOk: true, comment: "Quick check-in, friendly staff.", contactOk: true, highlights: ["quick_check_in"], id: "f1", rating: 5, reference: "VIS-7F31A2", submittedAt: "2026-11-24T11:05:00Z", tower: "tower_2" },
      { comment: "", id: "f2", rating: 3, reference: "VIS-11AA22", submittedAt: "2026-11-23T15:40:00Z", tower: "tower_1" },
    ],
    requested: 4,
    summary: {
      aspects: [
        { down: 0, key: "check_in", label: "Check-in speed", up: 1 },
        { down: 0, key: "courtesy", label: "Staff courtesy", up: 0 },
        { down: 0, key: "wayfinding", label: "Finding your way", up: 0 },
      ],
      average: 4,
      distribution: [
        { count: 0, stars: 1 },
        { count: 0, stars: 2 },
        { count: 1, stars: 3 },
        { count: 0, stars: 4 },
        { count: 1, stars: 5 },
      ],
      total: 2,
    },
  };

  test("the client service head sees ratings and comments", async ({ page }) => {
    await installMockStaffAuthentication(page, { role: "client_service_head" });
    await page.route("**/api/staff/feedback", (route) => route.fulfill({ json: response }));

    await signInAsStaff(page, { destination: "/staff/feedback" });

    await expect(page.getByRole("heading", { level: 1, name: "Visitor feedback" })).toBeVisible();
    await expect(page.getByText("50% of requests answered")).toBeAttached();
    await expect(page.getByText("Quick check-in, friendly staff.")).toBeVisible();
    await expect(page.getByText("No comment")).toBeVisible();
    await expect(page.getByText("May be contacted")).toBeVisible();
    await expect(page.getByText("100% good · 1 answer")).toBeVisible();
    await expectNoWcagViolations(page);
  });

  test("is not available to receptionists", async ({ page }) => {
    await installMockStaffAuthentication(page, { role: "receptionist" });
    await signInAsStaff(page);

    await expect(page.getByRole("link", { name: "Visitor Feedback" })).toHaveCount(0);
    await page.goto("/staff/feedback");
    await expect(page.getByRole("heading", { level: 1, name: "Visitor feedback" })).toHaveCount(0);
  });
});
