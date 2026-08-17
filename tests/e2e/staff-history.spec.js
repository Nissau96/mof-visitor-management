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

const HISTORY_VISITS = Array.from(
  {
    length: 12,
  },
  (_, index) => {
    const number = index + 1;
    const paddedNumber = String(number).padStart(
      2,
      "0",
    );

    const status =
      number % 3 === 0
        ? "cancelled"
        : number % 2 === 0
          ? "checked_out"
          : "checked_in";

    return {
      agency: "IAA",
      checkedInAt:
        `2026-08-${paddedNumber}T07:30:00.000Z`,
      checkedOutAt:
        status === "checked_out"
          ? `2026-08-${paddedNumber}T09:15:00.000Z`
          : null,
      division: "",
      fullName:
        `Synthetic History Visitor ${paddedNumber}`,
      meetingTitle: "",
      organization:
        "Synthetic History Organisation",
      personVisiting:
        "Synthetic History Officer",
      phone: `+2332400010${paddedNumber}`,
      purpose: "Official",
      reference:
        `VIS-HIST${String(number).padStart(
          4,
          "0",
        )}`,
      status,
      visitId:
        `00000000-0000-4000-8001-${String(
          number,
        ).padStart(12, "0")}`,
    };
  },
);

async function installMockHistoryApi(page) {
  const state = {
    requests: [],
  };

  await page.route(
    "**/api/staff/history",
    async (route) => {
      const request = route.request();

      expect(request.method()).toBe("POST");

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      const body = request.postDataJSON();

      state.requests.push(body);

      let matchingVisits = [
        ...HISTORY_VISITS,
      ];

      if (body.search) {
        const search =
          body.search.toLowerCase();

        matchingVisits =
          matchingVisits.filter(
            (visit) =>
              visit.fullName
                .toLowerCase()
                .includes(search) ||
              visit.reference
                .toLowerCase()
                .includes(search),
          );
      }

      if (body.status) {
        matchingVisits =
          matchingVisits.filter(
            (visit) =>
              visit.status === body.status,
          );
      }

      if (body.agency) {
        matchingVisits =
          matchingVisits.filter(
            (visit) =>
              visit.agency === body.agency,
          );
      }

      if (body.division) {
        matchingVisits =
          matchingVisits.filter(
            (visit) =>
              visit.division ===
              body.division,
          );
      }

      if (body.dateFrom) {
        matchingVisits =
          matchingVisits.filter(
            (visit) =>
              visit.checkedInAt.slice(0, 10) >=
              body.dateFrom,
          );
      }

      if (body.dateTo) {
        matchingVisits =
          matchingVisits.filter(
            (visit) =>
              visit.checkedInAt.slice(0, 10) <=
              body.dateTo,
          );
      }

      const totalCount =
        matchingVisits.length;

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
            "2026-08-17T08:30:00.000Z",
          pagination: {
            page: pageNumber,
            pageSize: PAGE_SIZE,
            totalCount,
            totalPages,
          },
          visits: matchingVisits.slice(
            start,
            start + PAGE_SIZE,
          ),
        },
        status: 200,
      });
    },
  );

  return state;
}

test.describe(
  "authenticated visit history",
  () => {
    test("loads visit records without detectable accessibility or overflow problems", async ({
      page,
    }) => {
      await installMockStaffAuthentication(
        page,
      );

      await installMockHistoryApi(page);

      await signInAsStaff(page, {
        destination: "/staff/history",
      });

      await expect(
        page.getByRole("heading", {
          name: "Visit history",
        }),
      ).toBeVisible();

      await expect(
        page.getByText(
          "12 matching visits",
        ),
      ).toBeVisible();

      await expect(
        page
          .getByText(
            "Synthetic History Visitor 01",
            {
              exact: true,
            },
          )
          .filter({
            visible: true,
          }),
      ).toBeVisible();

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

    test("supports pagination and submits filters in the request body", async ({
      page,
    }) => {
      await installMockStaffAuthentication(
        page,
      );

      const history =
        await installMockHistoryApi(page);

      await signInAsStaff(page, {
        destination: "/staff/history",
      });

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
            "Synthetic History Visitor 11",
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
            history.requests.at(-1)?.page,
        )
        .toBe(2);

      await page
        .getByRole("searchbox", {
          name: /Name or reference/i,
        })
        .fill("History Visitor 02");

      await page
        .getByLabel("Visit status")
        .selectOption("checked_out");

      await page
        .getByLabel("Agency")
        .selectOption("IAA");

      await page
        .getByLabel("Check-in date from")
        .fill("2026-08-01");

      await page
        .getByLabel("Check-in date to")
        .fill("2026-08-31");

      await page
        .getByRole("button", {
          name: "Apply filters",
        })
        .click();

      await expect(
        page
          .getByText(
            "Synthetic History Visitor 02",
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
          "1 matching visit",
        ),
      ).toBeVisible();

      await expect
        .poll(
          () =>
            history.requests.at(-1),
        )
        .toMatchObject({
          agency: "IAA",
          dateFrom: "2026-08-01",
          dateTo: "2026-08-31",
          division: "",
          page: 1,
          pageSize: 10,
          search: "History Visitor 02",
          status: "checked_out",
        });

      expect(page.url()).not.toContain(
        "History%20Visitor%2002",
      );
    });

    test("rejects a reversed date range without sending another request", async ({
      page,
    }) => {
      await installMockStaffAuthentication(
        page,
      );

      const history =
        await installMockHistoryApi(page);

      await signInAsStaff(page, {
        destination: "/staff/history",
      });

      await expect(
        page.getByText(
          "12 matching visits",
        ),
      ).toBeVisible();

      expect(history.requests).toHaveLength(
        1,
      );

      await page
        .getByLabel("Check-in date from")
        .fill("2026-08-20");

      await page
        .getByLabel("Check-in date to")
        .fill("2026-08-10");

      await page
        .getByRole("button", {
          name: "Apply filters",
        })
        .click();

      await expect(
        page.getByRole("alert"),
      ).toContainText(
        "The start date must not be after the end date.",
      );

      expect(history.requests).toHaveLength(
        1,
      );
    });
  },
);