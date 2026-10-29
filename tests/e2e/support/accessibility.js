import AxeBuilder from "@axe-core/playwright";
import {
  expect,
} from "@playwright/test";

// include: optional CSS selector to check only part of the page, such as
// an open dialog (the dimmed page behind a modal is not what users read).
export async function expectNoWcagViolations(
  page,
  { include } = {},
) {
  const builder = new AxeBuilder({
    page,
  });

  if (include) {
    builder.include(include);
  }

  const results =
    await builder
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
}