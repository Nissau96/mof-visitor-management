import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/accessibility.js";

test.describe("public privacy notice", () => {
  test("opens without signing in and names the WhatsApp and SMS sharing", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { level: 1, name: "Visitor service privacy notice" })).toBeVisible();
    await expect(page.getByText(/Version \d+\.\d+ · Effective/)).toBeVisible();
    await expect(page.getByText(/shared with Meta \(WhatsApp\)/)).toBeVisible();
    await expect(page.getByText(/never the message text/)).toBeVisible();
    await expect(page).toHaveURL(/\/privacy$/);

    await expectNoWcagViolations(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
