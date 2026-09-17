import {
  expect,
  test,
} from "@playwright/test";
import {
  expectNoWcagViolations,
} from "./support/accessibility.js";
import {
  SYNTHETIC_ACCESS_TOKEN,
  installMockStaffAuthentication,
  signInAsStaff,
} from "./support/staff-authentication.js";

const PAGE_SIZE = 10;

const VISITORS = Array.from(
  {
    length: 11,
  },
  (_, index) => {
    const number = index + 1;
    const paddedNumber = String(number).padStart(
      2,
      "0",
    );

    return {
      agency: "IAA",
      checkedInAt:
        `2026-08-17T07:${paddedNumber}:00.000Z`,
      division: "",
      fullName:
        `Synthetic Visitor ${paddedNumber}`,
      meetingTitle: "",
      organization:
        "Synthetic Test Organisation",
      personVisiting:
        "Synthetic Test Officer",
      phone: `+2332400000${paddedNumber}`,
      purpose: "Official",
      tower: "tower_1",
      reference:
        `VIS-TEST${String(number).padStart(
          4,
          "0",
        )}`,
      visitId:
        `00000000-0000-4000-8000-${String(
          number,
        ).padStart(12, "0")}`,
    };
  },
);

async function installMockDashboardApi(page) {
  const checkedOutVisitIds = new Set();

  const state = {
    checkoutRequests: [],
    dashboardRequests: [],
    sessionExpired: false,

    expireSession() {
      state.sessionExpired = true;
    },
  };

  await page.route(
    "**/api/staff/dashboard",
    async (route) => {
      const request = route.request();

      expect(request.method()).toBe("POST");

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      const body = request.postDataJSON();

      state.dashboardRequests.push(body);

      if (state.sessionExpired) {
        await route.fulfill({
          contentType: "application/json",
          json: {
            error:
              "Your staff session is invalid or has expired.",
          },
          status: 401,
        });
        return;
      }

      let matchingVisitors = VISITORS.filter(
        (visitor) =>
          !checkedOutVisitIds.has(
            visitor.visitId,
          ),
      );

      if (body.query) {
        const query = body.query.toLowerCase();

        matchingVisitors =
          matchingVisitors.filter(
            (visitor) =>
              visitor.fullName
                .toLowerCase()
                .includes(query) ||
              visitor.reference
                .toLowerCase()
                .includes(query),
          );
      }

      if (body.agency) {
        matchingVisitors =
          matchingVisitors.filter(
            (visitor) =>
              visitor.agency === body.agency,
          );
      }

      if (body.division) {
        matchingVisitors =
          matchingVisitors.filter(
            (visitor) =>
              visitor.division ===
              body.division,
          );
      }

      if (body.tower) {
        matchingVisitors =
          matchingVisitors.filter(
            (visitor) =>
              visitor.tower ===
              body.tower,
          );
      }

      const totalCount =
        matchingVisitors.length;

      const totalPages =
        totalCount === 0
          ? 0
          : Math.ceil(
              totalCount / PAGE_SIZE,
            );

      const pageNumber = body.page || 1;
      const start =
        (pageNumber - 1) * PAGE_SIZE;

      await route.fulfill({
        contentType: "application/json",
        json: {
          generatedAt:
            "2026-08-17T08:00:00.000Z",
          pagination: {
            page: pageNumber,
            pageSize: PAGE_SIZE,
            totalCount,
            totalPages,
          },
          stats: {
            active:
              VISITORS.length -
              checkedOutVisitIds.size,
            checkedInToday: 14,
            checkedOutToday:
              3 + checkedOutVisitIds.size,
          },
          towerScope: body.tower,
          visitors:
            matchingVisitors.slice(
              start,
              start + PAGE_SIZE,
            ),
        },
        status: 200,
      });
    },
  );

  await page.route(
    "**/api/staff/checkout",
    async (route) => {
      const request = route.request();

      expect(request.method()).toBe("POST");

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      const body = request.postDataJSON();

      state.checkoutRequests.push(body);
      checkedOutVisitIds.add(body.visitId);

      const visitor = VISITORS.find(
        (candidate) =>
          candidate.visitId === body.visitId,
      );

      await route.fulfill({
        contentType: "application/json",
        json: {
          checkout: {
            alreadyCheckedOut: false,
            checkedOutAt:
              "2026-08-17T08:15:00.000Z",
            reference:
              visitor?.reference ||
              "VIS-UNKNOWN",
            status: "checked_out",
            tower:
              visitor?.tower ||
              "tower_1",
            visitId: body.visitId,
          },
        },
        status: 200,
      });
    },
  );

  return state;
}

test.describe(
  "authenticated reception dashboard",
  () => {
    test("loads active visitors without detectable accessibility or overflow problems", async ({
      page,
    }) => {
      const authentication =
        await installMockStaffAuthentication(
          page,
        );

      await installMockDashboardApi(page);
      await signInAsStaff(page);

      await expect(
        page.getByRole("heading", {
          name:
            "Welcome, Synthetic Receptionist",
        }),
      ).toBeVisible();

      await expect(
        page.getByText(
          "11 matching visitors",
        ),
      ).toBeVisible();

      await expect(
        page
          .getByText(
            "Synthetic Visitor 01",
            {
              exact: true,
            },
          )
          .filter({
            visible: true,
          }),
      ).toBeVisible();

      const statistics = page.locator(
        'section[aria-label="Reception statistics"]',
      );

      await expect(
        statistics.getByText("11", {
          exact: true,
        }),
      ).toBeVisible();

      expect(
        authentication.credentialRequests,
      ).toHaveLength(1);

      expect(
        authentication.credentialRequests[0],
      ).toMatchObject({
        email:
          "receptionist.test@example.invalid",
        password:
          "Invented development password",
      });

      await expectNoWcagViolations(page);

      const hasHorizontalOverflow =
        await page.evaluate(
          () =>
            document.documentElement
              .scrollWidth >
            document.documentElement
              .clientWidth,
        );

      expect(hasHorizontalOverflow).toBe(
        false,
      );
    });

    test("supports server-side pagination and request-body filtering", async ({
      page,
    }) => {
      await installMockStaffAuthentication(
        page,
      );

      const dashboard =
        await installMockDashboardApi(page);

      await signInAsStaff(page);

      await page
        .getByRole("button", {
          name: "Next page",
        })
        .click();

      await expect(
        page.getByText("Page 2 of 2"),
      ).toBeVisible();

      await expect(
        page
          .getByText(
            "Synthetic Visitor 11",
            {
              exact: true,
            },
          )
          .filter({
            visible: true,
          }),
      ).toBeVisible();

      await expect
        .poll(
          () =>
            dashboard.dashboardRequests.at(
              -1,
            )?.page,
        )
        .toBe(2);

      await page
        .getByRole("searchbox", {
          name: /Name or reference/i,
        })
        .fill("Visitor 03");

      await page
        .getByLabel("Agency")
        .selectOption("IAA");

      await page
        .getByRole("button", {
          name: "Apply",
        })
        .click();

      await expect(
        page
          .getByText(
            "Synthetic Visitor 03",
            {
              exact: true,
            },
          )
          .filter({
            visible: true,
          }),
      ).toBeVisible();

      await expect(
        page.getByText(
          "1 matching visitor",
        ),
      ).toBeVisible();

      await expect
        .poll(
          () =>
            dashboard.dashboardRequests.at(
              -1,
            ),
        )
        .toMatchObject({
          agency: "IAA",
          division: "",
          page: 1,
          query: "Visitor 03",
          tower: "tower_1",
        });

      expect(page.url()).not.toContain(
        "Visitor%2003",
      );
    });

    test("confirms and completes visitor checkout", async ({
      page,
    }) => {
      await installMockStaffAuthentication(
        page,
      );

      const dashboard =
        await installMockDashboardApi(page);

      await signInAsStaff(page);

      await page
        .getByRole("button", {
          name: "Check out",
        })
        .first()
        .click();

      const dialog = page.getByRole(
        "dialog",
        {
          name:
            "Confirm visitor check-out",
        },
      );

      await expect(dialog).toBeVisible();

      await expect(
        dialog.getByText(
          "Synthetic Visitor 01",
        ),
      ).toBeVisible();

      await expectNoWcagViolations(page);

      await dialog
        .getByRole("button", {
          name: "Confirm check-out",
        })
        .click();

      const checkoutConfirmation = page
  .getByRole("status")
  .filter({
    hasText:
      "Synthetic Visitor 01 has been checked out successfully",
  });

await expect(
  checkoutConfirmation,
).toBeVisible();

      expect(
        dashboard.checkoutRequests,
      ).toEqual([
        {
          tower: "tower_1",
          visitId:
            VISITORS[0].visitId,
        },
      ]);

      await expect
        .poll(
          () =>
            dashboard.dashboardRequests.length,
        )
        .toBeGreaterThan(1);
    });

    test("signs out when the dashboard session expires", async ({
      page,
    }) => {
      const authentication =
        await installMockStaffAuthentication(
          page,
        );

      const dashboard =
        await installMockDashboardApi(page);

      await signInAsStaff(page);

      await expect(
        page.getByText(
          "11 matching visitors",
        ),
      ).toBeVisible();

      dashboard.expireSession();

      await page
        .getByRole("button", {
          name: "Refresh dashboard",
        })
        .click();

      await expect(
        page.getByRole("heading", {
          name: "Sign in",
        }),
      ).toBeVisible();

      await expect
        .poll(
          () =>
            authentication.logoutRequests,
        )
        .toBeGreaterThan(0);
    });
  },
);