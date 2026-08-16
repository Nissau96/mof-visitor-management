import AxeBuilder from "@axe-core/playwright";
import {
  expect,
} from "@playwright/test";

export async function expectNoWcagViolations(
  page,
) {
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
}