// Picks an option from a Plex UI select (AppSelect). Playwright's
// selectOption only works on native <select>, so open the trigger and
// click the option instead. `scope` may be the page or a locator such as
// a dialog; options render in a portal, so they are found on the page.
const REGEXP_SPECIALS = new Set([..."\\^$.*+?()[]{}|"]);

function escapeRegExp(text) {
  return [...text]
    .map((character) =>
      REGEXP_SPECIALS.has(character)
        ? `\\${character}`
        : character,
    )
    .join("");
}

export async function chooseOption(scope, label, optionLabel) {
  const page =
    typeof scope.page === "function"
      ? scope.page()
      : scope;

  // The trigger's accessible name is "<label> <current value>".
  const name =
    label instanceof RegExp
      ? new RegExp(`^(?:${label.source})`, label.flags)
      : new RegExp(`^${escapeRegExp(label)}`);

  await scope
    .getByRole("button", { name })
    .click();

  await page
    .getByRole("option", {
      exact: true,
      name: optionLabel,
    })
    .click();
}
