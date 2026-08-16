import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
} from "@playwright/test";

test.describe("visitor landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/visit");

    await expect(
      page.getByRole("heading", {
        name: "Visitor check-in",
      }),
    ).toBeVisible();
  });

  test("presents both visitor journeys", async ({
    page,
  }) => {
    const firstVisitLink =
      page.getByRole("link", {
        name:
          /This is my first visit/i,
      });

    const returningVisitLink =
      page.getByRole("link", {
        name:
          /I have visited before/i,
      });

    await expect(firstVisitLink).toBeVisible();

    await expect(firstVisitLink).toHaveAttribute(
      "href",
      "/visit/new",
    );

    await expect(
      returningVisitLink,
    ).toBeVisible();

    await expect(
      returningVisitLink,
    ).toHaveAttribute(
      "href",
      "/visit/returning",
    );
  });

  test("supports keyboard access to main content", async ({
    page,
  }) => {
    const skipLink =
      page.getByRole("link", {
        name: "Skip to main content",
      });

    await expect(skipLink).toBeAttached();

    await page.evaluate(() => {
      if (
        document.activeElement instanceof
        HTMLElement
      ) {
        document.activeElement.blur();
      }

      window.scrollTo(0, 0);
    });

    await page.keyboard.press("Tab");

    await expect(skipLink).toBeFocused();

    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(
      /#main-content$/,
    );

    await expect(
      page.locator("#main-content"),
    ).toBeFocused();
  });

  test("does not overflow the viewport", async ({
    page,
  }) => {
    const hasHorizontalOverflow =
      await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
        );
      });

    expect(hasHorizontalOverflow).toBe(false);
  });

  test("has no automatically detectable WCAG violations", async ({
    page,
  }) => {
    const results =
      await new AxeBuilder({
        page,
      })
        .withTags([
          "wcag2a",
          "wcag2aa",
          "wcag21a",
          "wcag21aa",
          "wcag22aa",
        ])
        .analyze();

    expect(
      results.violations,
      JSON.stringify(
        results.violations,
        null,
        2,
      ),
    ).toEqual([]);
  });
});