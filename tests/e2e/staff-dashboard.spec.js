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
import { chooseOption } from "./support/select.js";

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

const PENDING = [
  {
    destinationAgency: "Public Procurement Authority (PPA)",
    email: "synthetic.waiting@example.com",
    fullName: "Synthetic Waiting Visitor",
    organization: "Synthetic Waiting Organisation",
    personVisiting: "Synthetic Host",
    phone: "+233200000077",
    purpose: "Follow up",
    referenceCode: "VIS-WAIT01",
    status: "pending_admission",
    submittedAt: "2026-08-17T07:30:00.000Z",
    tower: "tower_1",
    visitId: "00000000-0000-4000-8000-000000000201",
    visitorType: null,
  },
];

async function installMockDashboardApi(
  page,
  { bookings = [], pending = [] } = {},
) {
  const checkedOutVisitIds = new Set();

  const state = {
    bookingListRequests: [],
    checkoutRequests: [],
    dashboardRequests: [],
    decideRequests: [],
    pendingRequests: [],
    sessionExpired: false,

    expireSession() {
      state.sessionExpired = true;
    },
  };

  // Meetings booked by Ministry staff waiting for reception's decision.
  let waitingBookings = [...bookings];

  await page.route("**/api/staff/meetings/bookings", async (route) => {
    const body = route.request().postDataJSON();
    state.bookingListRequests.push(body);

    await route.fulfill({
      contentType: "application/json",
      json: {
        bookings: body.view === "pending" ? waitingBookings : [],
        pendingCount: waitingBookings.length,
        scope: { role: "receptionist", tower: "tower_1" },
      },
      status: 200,
    });
  });

  await page.route("**/api/staff/meetings/bookings/decide", async (route) => {
    const body = route.request().postDataJSON();
    state.decideRequests.push(body);

    const decided = waitingBookings.find((booking) => booking.bookingId === body.bookingId);
    waitingBookings = waitingBookings.filter((booking) => booking.bookingId !== body.bookingId);

    await route.fulfill({
      contentType: "application/json",
      json: {
        ...decided,
        canDecide: false,
        emailSent: true,
        status: body.decision === "approve" ? "approved" : "rejected",
      },
      status: 200,
    });
  });

  await page.route(
    "**/api/staff/cards/pending",
    async (route) => {
      const body = route.request().postDataJSON();

      state.pendingRequests.push(body);

      const matching = pending.filter(
        (record) =>
          !body.search ||
          record.fullName
            .toLowerCase()
            .includes(body.search.toLowerCase()),
      );
      const shown = body.pageSize === 1 ? matching.slice(0, 1) : matching;

      await route.fulfill({
        contentType: "application/json",
        json: {
          admissions: shown,
          pagination: {
            page: 1,
            pageSize: body.pageSize,
            totalCount: matching.length,
            totalPages: matching.length > 0 ? 1 : 0,
          },
        },
        status: 200,
      });
    },
  );

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
            checkedInThisMonth: 87,
          },
          cardAssignment: {
            assigned: 4,
            notAssigned:
              VISITORS.length -
              checkedOutVisitIds.size -
              4,
          },
          towerScope: body.tower,
          weeklyArrivals: createWeeklyArrivals(),
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

// Monday-to-Sunday counts for the current UTC (Accra) week; days after
// today are null, matching the API contract.
function createWeeklyArrivals() {
  const today = new Date();
  const todayStart = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const monday =
    todayStart -
    ((today.getUTCDay() + 6) % 7) * 86_400_000;

  return Array.from({ length: 7 }, (_, index) => {
    const start = monday + index * 86_400_000;

    return {
      count:
        start > todayStart ? null : 3 + index,
      date: new Date(start)
        .toISOString()
        .slice(0, 10),
    };
  });
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
            "Welcome to your Reception Workspace",
        }),
      ).toBeVisible();

      await expect(
        page.getByText(
          "11 checked in · Tower 1",
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

      await expect(
        statistics.getByText("87", {
          exact: true,
        }),
      ).toBeVisible();

      await expect(
        statistics
        .getByText(/^Tower 1 · /)
        .filter({ visible: true }),
      ).toBeVisible();

      await expect(
        page.getByLabel("Ministry division"),
      ).toHaveCount(0);

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

    test("opens pending admissions first and keeps the chosen tab in the URL", async ({
      page,
    }) => {
      await installMockStaffAuthentication(
        page,
      );

      const dashboard =
        await installMockDashboardApi(page, {
          pending: PENDING,
        });

      await signInAsStaff(page);

      const pendingTab = page.getByRole("tab", {
        name: /Pending admissions/,
      });

      await expect(pendingTab).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await expect(
        page.getByText("1 waiting · Tower 1"),
      ).toBeVisible();

      await expect(
        page
          .getByText("Synthetic Waiting Visitor", {
            exact: true,
          })
          .filter({ visible: true }),
      ).toBeVisible();

      // Agency filters only apply to checked-in visitors.
      await expect(
        page.getByLabel("Agency"),
      ).toHaveCount(0);

      await expectNoWcagViolations(page);

      await page
        .getByRole("button", {
          name: "Assign card to Synthetic Waiting Visitor",
        })
        .filter({ visible: true })
        .click();

      await expect(
        page.getByRole("dialog"),
      ).toBeVisible();

      await page.keyboard.press("Escape");

      await page
        .getByRole("tab", {
          name: /Currently checked in/,
        })
        .click();

      await expect(page).toHaveURL(/view=checked-in/);

      await expect(
        page.getByText("11 checked in · Tower 1"),
      ).toBeVisible();

      // Reference first, then the Visit History columns, with an
      // icon-only Action and no Check-out (everyone listed is inside).
      if ((page.viewportSize()?.width ?? 1280) >= 1024) {
        const checkedIn = page.getByRole("region", { name: "Checked-in visitors table" });

        for (const column of ["Reference", "Visitor", "Organisation", "Contact", "Purpose", "Visiting", "Agency", "Date", "Check-in", "Card", "Status", "Action"]) {
          await expect(
            checkedIn.getByRole("columnheader", { exact: true, name: column }),
          ).toBeVisible();
        }

        await expect(
          checkedIn.getByRole("columnheader", { name: "Check-out" }),
        ).toHaveCount(0);

        // Only real emails show; there is no "No email" placeholder.
        await expect(checkedIn.getByText("No email")).toHaveCount(0);

        // The check-out button is an icon; its name stays for screen readers.
        const checkout = checkedIn.getByRole("button", { name: /^Check out / }).first();
        await expect(checkout).toBeVisible();
        await expect(checkout).toHaveText("");
      }

      await page.reload();

      await expect(
        page.getByRole("tab", {
          name: /Currently checked in/,
        }),
      ).toHaveAttribute("aria-selected", "true");

      expect(
        dashboard.pendingRequests[0],
      ).toMatchObject({ tower: "tower_1" });
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

      await chooseOption(
    page,
    "Agency",
    "IAA",
  );


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
          "1 checked in · Tower 1",
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
          "11 checked in · Tower 1",
        ),
      ).toBeVisible();

      dashboard.expireSession();

      await page
        .getByRole("button", {
          name: "Refresh",
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

    test("shows derived notifications and marks them read", async ({
      page,
    }) => {
      const recent =
        new Date().toISOString();

      const authentication =
        await installMockStaffAuthentication(
          page,
          {
            notifications: [
              {
                id: "pending_admission:visit-a",
                kind: "pending_admission",
                occurredAt: recent,
                reference: "VIS-PEND01",
                sortAt: recent,
                tower: "tower_1",
                visitorName: "Synthetic Pending Visitor",
              },
              {
                id: "overstay:visit-b",
                kind: "overstay",
                occurredAt:
                  "2026-08-16T08:45:00.000Z",
                reference: "VIS-OVER01",
                sortAt: recent,
                tower: "tower_1",
                visitorName: "Synthetic Overstay Visitor",
              },
            ],
          },
        );

      await installMockDashboardApi(page);
      await signInAsStaff(page);

      const bell = page.getByRole(
        "button",
        {
          name: "Notifications, 2 unread",
        },
      );

      await expect(bell).toBeVisible();

      expect(
        authentication.notificationRequests[0],
      ).toEqual({
        tower: "tower_1",
      });

      await bell.click();

      const panel = page.getByRole(
        "region",
        {
          name: "Notifications",
        },
      );

      await expect(
        panel.getByRole("link", {
          name: /Synthetic Pending Visitor is waiting for admission/,
        }),
      ).toHaveAttribute("href", "/staff?view=pending");

      await expect(
        panel.getByRole("link", {
          name: /Synthetic Overstay Visitor has not been checked out/,
        }),
      ).toHaveAttribute(
        "href",
        "/staff/history",
      );

      await expectNoWcagViolations(page);

      await page.keyboard.press("Escape");

      await expect(
        page.getByRole("button", {
          exact: true,
          name: "Notifications",
        }),
      ).toBeVisible();
    });

    test("switches to a persistent dark theme without accessibility problems", async ({
      page,
    }) => {
      await installMockStaffAuthentication(
        page,
      );

      await installMockDashboardApi(page);
      await signInAsStaff(page);

      await page
        .getByRole("button", {
          name: "Switch to dark theme",
        })
        .click();

      await expect(
        page.locator("html"),
      ).toHaveClass(/\bdark\b/);

      await page.reload();

      await expect(
        page.locator("html"),
      ).toHaveClass(/\bdark\b/);

      await expect(
        page.getByRole("button", {
          name: "Switch to light theme",
        }),
      ).toBeVisible();

      await expect(
        page.getByText("11 checked in · Tower 1"),
      ).toBeVisible();

      await expectNoWcagViolations(page);
    });

    test("warns before signing out an idle session and explains it on the sign-in page", async ({
      page,
    }) => {
      await page.clock.install();

      const authentication =
        await installMockStaffAuthentication(
          page,
        );

      await installMockDashboardApi(page);
      await signInAsStaff(page);

      await expect(
        page.getByRole("heading", {
          name: "Welcome to your Reception Workspace",
        }),
      ).toBeVisible();

      await page.clock.fastForward("23:30");

      const warning = page.getByRole("dialog", {
        name: "Are you still there?",
      });

      await expect(warning).toBeVisible();
      await expectNoWcagViolations(page);

      await warning
        .getByRole("button", { name: "Stay signed in" })
        .last()
        .click();

      await expect(warning).toBeHidden();

      await page.clock.fastForward("23:30");
      await expect(warning).toBeVisible();

      await page.clock.fastForward("02:00");

      await expect(
        page.getByRole("heading", { name: "Sign in" }),
      ).toBeVisible();

      await expect(
        page.getByText(
          "You were signed out after 25 minutes without activity.",
        ),
      ).toBeVisible();

      expect(authentication.logoutRequests).toBeGreaterThan(0);
    });
  },
);

function bookingRequest(overrides = {}) {
  return {
    bookerEmail: "ama.mensah@mofep.gov.gh",
    bookerName: "Ama Mensah",
    bookingId: "00000000-0000-4000-8000-000000000801",
    canDecide: true,
    decisionReason: null,
    endsAt: "11:00",
    guests: [
      {
        email: null,
        fullName: "Kofi Boateng",
        guestId: "00000000-0000-4000-8000-000000000901",
        organization: "World Bank",
        phone: "+233240000001",
        status: "expected",
      },
      {
        email: null,
        fullName: "Efua Owusu",
        guestId: "00000000-0000-4000-8000-000000000902",
        organization: "World Bank",
        phone: "+233240000002",
        status: "expected",
      },
    ],
    hostAgency: "Ministry of Finance (MoF)",
    hostDivision: "Budget Division",
    meetingDate: new Date().toISOString().slice(0, 10),
    notes: "Two guests will bring laptops.",
    referenceCode: "MTG-A1B2C3",
    startsAt: "10:00",
    status: "pending",
    title: "Synthetic Budget Review",
    tower: "tower_1",
    venue: "Conference Room B",
    ...overrides,
  };
}

test.describe("staff booking requests on the dashboard", () => {
  test("hides the card while nothing is waiting", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const state = await installMockDashboardApi(page);

    await signInAsStaff(page);

    await expect.poll(() => state.bookingListRequests.length).toBeGreaterThan(0);
    expect(state.bookingListRequests[0]).toMatchObject({ view: "pending" });
    await expect(page.getByRole("region", { name: /^Booking requests/ })).toHaveCount(0);
  });

  test("approves and rejects meetings booked by Ministry staff", async ({ page }) => {
    await installMockStaffAuthentication(page);
    const state = await installMockDashboardApi(page, {
      bookings: [
        bookingRequest(),
        bookingRequest({
          bookingId: "00000000-0000-4000-8000-000000000802",
          referenceCode: "MTG-D4E5F6",
          title: "Synthetic Partner Visit",
        }),
      ],
    });

    await signInAsStaff(page);

    const panel = page.getByRole("region", { name: /^Booking requests/ });

    await expect(panel.getByText("2 meetings are waiting for your approval.")).toBeVisible();
    await expect(panel.getByRole("group", { name: "Booking view" })).toHaveCount(0);
    await expect(panel.getByText("Ama Mensah").first()).toBeVisible();

    await panel.getByRole("button", { name: "Show 2 guests" }).first().click();
    await expect(panel.getByText("Kofi Boateng").filter({ visible: true })).toBeVisible();

    await expectNoWcagViolations(page);

    await panel.getByRole("button", { name: "Approve", exact: true }).first().click();

    await expect
      .poll(() => state.decideRequests.at(-1))
      .toMatchObject({
        bookingId: "00000000-0000-4000-8000-000000000801",
        decision: "approve",
        tower: "tower_1",
      });

    await expect(panel.getByText("1 meeting is waiting for your approval.")).toBeVisible();

    await panel.getByRole("button", { name: "Reject", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Reject “Synthetic Partner Visit”?" });
    const reject = dialog.getByRole("button", { name: "Reject request" });

    await expect(reject).toBeDisabled();
    await dialog.getByLabel("Reason").fill("The conference room is booked.");
    await expectNoWcagViolations(page, { include: "[role=dialog]" });
    await reject.click();

    await expect
      .poll(() => state.decideRequests.at(-1))
      .toMatchObject({
        decision: "reject",
        reason: "The conference room is booked.",
      });

    // Nothing left to decide, so the card goes away.
    await expect(panel).toHaveCount(0);
  });
});
