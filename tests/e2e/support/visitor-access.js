export async function installMockVisitorAccess(
  page,
) {
  const state = {
    accessChecks: 0,
  };

  await page.route(
    "**/api/register",
    async (route) => {
      const request = route.request();

      if (request.method() !== "GET") {
        await route.fallback();
        return;
      }

      state.accessChecks += 1;

      await route.fulfill({
        contentType: "application/json",
        json: {
          access: {
            valid: true,
            validThrough:
              "2026-08-23T23:59:59.999Z",
            weekEndsOn: "2026-08-23",
            weekStartsOn: "2026-08-17",
          },
        },
        status: 200,
      });
    },
  );

  return state;
}
