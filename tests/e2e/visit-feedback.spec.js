import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/accessibility.js";
import { installMockStaffAuthentication, signInAsStaff } from "./support/staff-authentication.js";

const CODE = "K7pQ2xZm";

test.describe("visitor feedback link", () => {
  test("rates a visit and thanks the visitor", async ({ page }) => {
    const submitted = [];

    await page.route("**/api/feedback/view", (route) =>
      route.fulfill({ json: { feedback: { checkedOutAt: null, reference: "VIS-7F31A2", status: "open" } } }),
    );
    await page.route("**/api/feedback/submit", async (route) => {
      submitted.push(route.request().postDataJSON());
      await route.fulfill({ json: { saved: true }, status: 201 });
    });

    await page.goto(`/f/${CODE}`);

    await expect(page.getByRole("heading", { level: 1, name: "How was your visit?" })).toBeVisible();
    await expect(page.getByText("VIS-7F31A2")).toBeVisible();
    await expectNoWcagViolations(page);

    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByRole("alert")).toHaveText("Choose a rating from 1 to 5 stars.");

    await page.getByRole("radio", { name: "4 stars, Very good" }).locator("..").click();
    await expect(page.getByRole("radio", { name: "4 stars, Very good" })).toBeChecked();
    await page.getByLabel(/Anything we should know/).fill("Quick check-in, friendly staff.");
    await page.getByRole("button", { name: "Send feedback" }).click();

    await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();
    expect(submitted[0]).toEqual({ comment: "Quick check-in, friendly staff.", rating: 4, code: CODE });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("sends the code from the short link", async ({ page }) => {
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
    await expect(page.getByRole("heading", { level: 1, name: "How was your visit?" })).toBeVisible();
    await page.getByRole("radio", { name: "5 stars, Excellent" }).locator("..").click();
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();

    expect(requests).toEqual([{ code: "K7pQ2xZm" }, { code: "K7pQ2xZm", comment: "", rating: 5 }]);
  });

  test("explains an expired or unknown link", async ({ page }) => {
    await page.route("**/api/feedback/view", (route) =>
      route.fulfill({ json: { feedback: { reference: "VIS-7F31A2", status: "expired" } } }),
    );
    await page.goto(`/f/${CODE}`);
    await expect(page.getByRole("heading", { name: "Link expired" })).toBeVisible();

    await page.unroute("**/api/feedback/view");
    await page.route("**/api/feedback/view", (route) => route.fulfill({ json: { error: "This feedback link is not valid." }, status: 404 }));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Link not valid" })).toBeVisible();
  });
});

test.describe("staff visitor feedback", () => {
  const response = {
    feedback: [
      { comment: "Quick check-in, friendly staff.", id: "f1", rating: 5, reference: "VIS-7F31A2", submittedAt: "2026-11-24T11:05:00Z", tower: "tower_2" },
      { comment: "", id: "f2", rating: 3, reference: "VIS-11AA22", submittedAt: "2026-11-23T15:40:00Z", tower: "tower_1" },
    ],
    requested: 4,
    summary: {
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
