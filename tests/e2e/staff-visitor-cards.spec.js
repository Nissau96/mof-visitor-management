import {
  expect,
  test,
} from "@playwright/test";
import {
  expectNoWcagViolations,
} from "./support/accessibility.js";
import {
  installMockStaffAuthentication,
  signInAsStaff,
} from "./support/staff-authentication.js";

const NOW = new Date();
const HOUR_MS = 3_600_000;

function iso(offsetHours) {
  return new Date(
    NOW.getTime() + offsetHours * HOUR_MS,
  ).toISOString();
}

function page(totalCount) {
  return {
    page: 1,
    pageSize: 10,
    totalCount,
    totalPages: totalCount ? 1 : 0,
  };
}

const PENDING = [
  {
    destinationAgency: "Ghana Investment Promotion Centre (GIPC)",
    email: "synthetic.pending@example.com",
    fullName: "Synthetic Pending Visitor",
    organization: "",
    personVisiting: "Synthetic Host",
    purpose: "",
    referenceCode: "VIS-PEND01",
    status: "pending_admission",
    submittedAt: iso(-1),
    tower: "tower_1",
    visitId: "00000000-0000-4000-8000-000000000101",
    visitorType: null,
  },
];

const CHECKED_IN = [
  {
    assignmentStatus: "assigned",
    canCheckout: true,
    cardNumber: "MOF-V101",
    checkedInAt: iso(-2),
    destinationAgency: "Ministry of Finance (MoF)",
    destinationDivision: "Synthetic Division",
    fullName: "Synthetic VIP Visitor",
    organization: "Synthetic Institution",
    phone: "+233200000001",
    purpose: "Official",
    referenceCode: "VIS-CHK001",
    tower: "tower_2",
    visitId: "00000000-0000-4000-8000-000000000201",
    visitorType: "vip",
  },
  {
    assignmentStatus: "not_returned",
    canCheckout: false,
    cardNumber: "MOF-V102",
    checkedInAt: iso(-30),
    destinationAgency: "Ghana Investment Promotion Centre (GIPC)",
    email: "synthetic.overdue@example.com",
    fullName: "Synthetic Overdue Visitor",
    personVisiting: "Synthetic Host",
    purpose: "",
    referenceCode: "VIS-CHK002",
    tower: "tower_1",
    visitId: "00000000-0000-4000-8000-000000000202",
    visitorType: "regular",
  },
];

const INCIDENTS = [
  {
    assignedOfficer: null,
    canReprint: false,
    canResolve: false,
    canStartInvestigation: true,
    cardNumber: "MOF-V102",
    email: "synthetic.overdue@example.com",
    fullName: "Synthetic Overdue Visitor",
    incidentId: "00000000-0000-4000-8000-000000000301",
    incidentStatus: "open",
    openedReason: "overdue",
    overdueSince: iso(-50),
    purpose: "",
    tower: "tower_1",
    visitId: "00000000-0000-4000-8000-000000000202",
    visitorType: "regular",
  },
];

async function installMockCardsApi(browserPage) {
  const fulfil = (body) => async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      json: body,
      status: 200,
    });
  };

  await browserPage.route(
    "**/api/staff/cards/pending",
    fulfil({
      admissions: PENDING,
      pagination: page(PENDING.length),
    }),
  );

  await browserPage.route(
    "**/api/staff/cards/checked-in",
    fulfil({
      pagination: page(CHECKED_IN.length),
      visitors: CHECKED_IN,
    }),
  );

  await browserPage.route(
    "**/api/staff/cards/incidents",
    fulfil({
      incidents: INCIDENTS,
      pagination: page(INCIDENTS.length),
    }),
  );

  await browserPage.route(
    "**/api/staff/cards/checked-in-count",
    fulfil({
      checkedIn: CHECKED_IN.length,
      scope: { role: "client_service_head", tower: null },
    }),
  );

  await browserPage.route(
    "**/api/staff/dashboard",
    fulfil({
      cardAssignment: {
        assigned: 2,
        notAssigned: 1,
      },
      pagination: page(0),
      stats: {
        active: 3,
        checkedInThisMonth: 3,
        checkedInToday: 3,
        checkedOutToday: 0,
      },
      visitors: [],
    }),
  );
}

async function expectNoHorizontalOverflow(browserPage) {
  expect(
    await browserPage.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test.describe("visitor cards page", () => {
  test("shows stat cards and all three views without accessibility or overflow problems", async ({
    page: browserPage,
  }) => {
    await installMockStaffAuthentication(browserPage, {
      fullName: "Synthetic Administrator",
      role: "admin",
    });
    await installMockCardsApi(browserPage);

    await signInAsStaff(browserPage, {
      destination: "/staff/cards",
    });

    await expect(
      browserPage.getByRole("heading", {
        name: "Visitor cards",
      }),
    ).toBeVisible();

    // Phones show compact cards (short label, no note); wider screens
    // show the full cards with notes.
    const phone =
      (browserPage.viewportSize()?.width ?? 1280) < 768;

    if (phone) {
      for (const label of ["Pending", "Checked-in", "Incidents"]) {
        await expect(
          browserPage
            .getByLabel("Visitor-card statistics")
            .getByText(label, { exact: true }),
        ).toBeVisible();
      }
    } else {
      await expect(
        browserPage.getByText("Waiting at reception"),
      ).toBeVisible();
      await expect(
        browserPage.getByText("1 awaiting a card"),
      ).toBeVisible();
      await expect(
        browserPage.getByText("MOF-V102 overdue"),
      ).toBeVisible();
    }

    const visible = (text) =>
      browserPage
        .getByText(text, { exact: true })
        .filter({ visible: true })
        .first();

    await expect(
      visible("Synthetic Pending Visitor"),
    ).toBeVisible();
    await expect(
      visible("Pending admission"),
    ).toBeVisible();

    await expectNoWcagViolations(browserPage);
    await expectNoHorizontalOverflow(browserPage);

    await browserPage
      .getByRole("tab", { name: /Checked-in visitors/ })
      .click();

    await expect(
      visible("Synthetic VIP Visitor"),
    ).toBeVisible();
    await expect(
      visible("Synthetic Institution"),
    ).toBeVisible();
    await expect(
      visible("Not returned"),
    ).toBeVisible();
    await expect(
      browserPage
        .getByRole("button", {
          name: "MOF-V102 requires incident action",
        })
        .filter({ visible: true }),
    ).toBeDisabled();

    await expectNoWcagViolations(browserPage);
    await expectNoHorizontalOverflow(browserPage);

    await browserPage
      .getByRole("tab", { name: /Card incidents/ })
      .click();

    await expect(
      browserPage
        .getByRole("button", {
          name: "Investigate incident for MOF-V102",
        })
        .filter({ visible: true }),
    ).toBeEnabled();
    await expect(
      visible("2 days overdue"),
    ).toBeVisible();

    await expectNoWcagViolations(browserPage);
    await expectNoHorizontalOverflow(browserPage);
  });

  test("lists checked-in visitors who have no card", async ({
    page: browserPage,
  }) => {
    await installMockStaffAuthentication(browserPage, {
      fullName: "Synthetic Administrator",
      role: "admin",
    });
    await installMockCardsApi(browserPage);

    // Registered last, so it overrides the default checked-in mock.
    await browserPage.route(
      "**/api/staff/cards/checked-in",
      async (route) => {
        await route.fulfill({
          contentType: "application/json",
          json: {
            pagination: page(1),
            visitors: [
              {
                assignmentStatus: "unassigned",
                canCheckout: false,
                cardNumber: null,
                checkedInAt: iso(-200),
                destinationAgency: "Ministry of Finance (MoF)",
                destinationDivision: "Finance Division",
                fullName: "Synthetic Cardless Visitor",
                phone: "+233200000009",
                purpose: "Official",
                referenceCode: "VIS-CARD01",
                tower: "tower_2",
                visitId: "00000000-0000-4000-8000-000000000209",
                visitorType: null,
              },
            ],
          },
          status: 200,
        });
      },
    );

    await signInAsStaff(browserPage, {
      destination: "/staff/cards",
    });

    await browserPage
      .getByRole("tab", { name: /Checked-in visitors/ })
      .click();

    await expect(
      browserPage
        .getByText("Synthetic Cardless Visitor", { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await expect(
      browserPage
        .getByRole("button", {
          name: "No card was issued. Check this visitor out from the dashboard.",
        })
        .filter({ visible: true }),
    ).toBeDisabled();
  });

  test("gives client service heads a read-only checked-in count", async ({
    page: browserPage,
  }) => {
    await installMockStaffAuthentication(browserPage, {
      fullName: "Synthetic Client Service Head",
      role: "client_service_head",
    });
    await installMockCardsApi(browserPage);

    await signInAsStaff(browserPage, {
      destination: "/staff/cards",
    });

    const stats = browserPage.getByLabel(
      "Visitor-card statistics",
    );

    await expect(
      stats.getByText(String(CHECKED_IN.length), { exact: true }),
    ).toBeVisible();

    await expect(
      browserPage.getByRole("button", {
        name: "Show checked-in visitors",
      }),
    ).toHaveCount(0);

    await expect(
      browserPage.getByRole("button", {
        name: "Show open card incidents",
      }),
    ).toBeVisible();

    await expectNoWcagViolations(browserPage);
    await expectNoHorizontalOverflow(browserPage);
  });
});
