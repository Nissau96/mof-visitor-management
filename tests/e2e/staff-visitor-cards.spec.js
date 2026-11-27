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
  {
    destinationAgency: "Ghana Investment Promotion Centre (GIPC)",
    fullName: "Synthetic Group Guest",
    groupLeadName: "Synthetic Pending Visitor",
    organization: "",
    personVisiting: "Synthetic Host",
    phone: "+233200000009",
    purpose: "",
    referenceCode: "VIS-PEND01-2",
    status: "pending_admission",
    submittedAt: iso(-1),
    tower: "tower_1",
    visitId: "00000000-0000-4000-8000-000000000102",
    visitorType: null,
  },
];

const CHECKED_IN = [
  {
    assignmentStatus: "assigned",
    canCheckout: true,
    cardNumber: "MOF-VIP101",
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

// Today's check-outs, as the visit history API returns them.
const CHECKED_OUT = [
  {
    agency: "Ministry of Finance (MoF)",
    cardNumber: "MOF-V140",
    cardStatus: "returned",
    checkedInAt: iso(-5),
    checkedOutAt: iso(-1),
    division: "Budget Office",
    email: "synthetic.left@example.com",
    fullName: "Synthetic Departed Visitor",
    meetingTitle: "",
    organization: "Synthetic Consulting",
    personVisiting: "Synthetic Host",
    phone: "+233200000011",
    purpose: "Official",
    reference: "VIS-OUT001",
    status: "checked_out",
    tower: "tower_1",
    visitId: "00000000-0000-4000-8000-000000000401",
    visitorType: "regular",
  },
  {
    agency: "Ghana Investment Promotion Centre (GIPC)",
    cardNumber: null,
    cardStatus: null,
    checkedInAt: iso(-3),
    checkedOutAt: iso(-2),
    division: "",
    email: null,
    fullName: "Synthetic Cardless Departure",
    meetingTitle: "",
    organization: "",
    personVisiting: "Synthetic Host",
    phone: "+233200000012",
    purpose: "Follow up",
    reference: "VIS-OUT002",
    status: "checked_out",
    tower: "tower_1",
    visitId: "00000000-0000-4000-8000-000000000402",
    visitorType: null,
  },
];

// Every check-out ever, for the count under the Checked-out list.
const CHECKED_OUT_TOTAL = 1234;

const INCIDENTS = [
  {
    assignedOfficer: null,
    canReprint: false,
    canResolve: false,
    canStartInvestigation: true,
    // Visit fields the API adds so incidents match Visit History.
    agency: "Ghana Investment Promotion Centre (GIPC)",
    cardNumber: "MOF-V102",
    checkedInAt: iso(-74),
    checkedOutAt: null,
    division: "",
    email: "synthetic.overdue@example.com",
    fullName: "Synthetic Overdue Visitor",
    incidentId: "00000000-0000-4000-8000-000000000301",
    organization: "Synthetic Traders",
    personVisiting: "Synthetic Host",
    phone: "+233200000002",
    referenceCode: "VIS-CHK002",
    incidentStatus: "open",
    openedReason: "overdue",
    overdueSince: iso(-50),
    purpose: "",
    tower: "tower_1",
    visitId: "00000000-0000-4000-8000-000000000202",
    visitorType: "regular",
  },
];

async function installMockCardsApi(browserPage, state = { history: [] }) {
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

  // Checked-out visitors come from the visit history API: today's
  // check-outs when a date is sent, otherwise every check-out.
  await browserPage.route("**/api/staff/history", async (route) => {
    const body = route.request().postDataJSON();
    state.history.push(body);

    const today = Boolean(body.dateFrom);

    await route.fulfill({
      contentType: "application/json",
      json: {
        generatedAt: NOW.toISOString(),
        pagination: {
          page: 1,
          pageSize: body.pageSize,
          totalCount: today ? CHECKED_OUT.length : CHECKED_OUT_TOTAL,
          totalPages: 1,
        },
        towerScope: body.tower || null,
        visits: today ? CHECKED_OUT.slice(0, body.pageSize) : [],
      },
      status: 200,
    });
  });

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
    const state = { history: [] };
    await installMockCardsApi(browserPage, state);

    await signInAsStaff(browserPage, {
      destination: "/staff/cards",
    });

    await expect(
      browserPage.getByRole("heading", {
        name: "Visitor cards",
      }),
    ).toBeVisible();

    // Pending admissions live on the Dashboard only.
    await expect(
      browserPage.getByRole("tab", { name: /Pending/ }),
    ).toHaveCount(0);

    // Phones show compact cards (short label, no note); wider screens
    // show the full cards with notes.
    const phone =
      (browserPage.viewportSize()?.width ?? 1280) < 768;

    if (phone) {
      for (const label of ["Checked-in", "Checked-out", "Incidents"]) {
        await expect(
          browserPage
            .getByLabel("Visitor-card statistics")
            .getByText(label, { exact: true }),
        ).toBeVisible();
      }
    } else {
      await expect(
        browserPage.getByText("Checked out today"),
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

    // Visitors are checked in, so the page opens on that tab.
    await expect(
      browserPage.getByRole("tab", { name: /Checked-in visitors/ }),
    ).toHaveAttribute("aria-selected", "true");

    // VIP cards are burgundy; regular cards stay teal.
    await expect(
      browserPage
        .getByTitle("VIP visitor card")
        .filter({ visible: true })
        .first(),
    ).toHaveText(/MOF-VIP101/);

    // Kept cards move to incidents after a day; the tab says so.
    await expect(
      browserPage.getByText(
        "Cards not returned within 24 hours of check-in move to Card incidents.",
      ),
    ).toBeVisible();

    await expect(
      visible("Synthetic VIP Visitor"),
    ).toBeVisible();
    await expect(
      visible("Synthetic Institution"),
    ).toBeVisible();
    // A card kept past its return time reads as not returned.
    await expect(
      visible("Card not returned"),
    ).toBeVisible();

    // The same columns as Visit History, with no action column:
    // check-out happens on the Dashboard.
    if (!phone) {
      const checkedInTable = browserPage.getByRole("region", { name: "Checked-in visitors table" });

      for (const column of ["Visitor", "Organisation", "Contact", "Purpose", "Visiting", "Agency", "Date", "Check-in", "Check-out", "Card", "Status"]) {
        await expect(
          checkedInTable.getByRole("columnheader", { exact: true, name: column }),
        ).toBeVisible();
      }

      await expect(checkedInTable.getByRole("columnheader", { name: "Action" })).toHaveCount(0);

      // Only real emails show; there is no "No email" placeholder.
      await expect(checkedInTable.getByText("synthetic.overdue@example.com")).toBeVisible();
      await expect(checkedInTable.getByText("No email")).toHaveCount(0);
    }

    await expect(
      browserPage.getByRole("button", { name: /Check out/ }),
    ).toHaveCount(0);

    await expectNoWcagViolations(browserPage);
    await expectNoHorizontalOverflow(browserPage);

    // Checked-out: today's departures, newest first, with every
    // check-out counted underneath.
    await browserPage
      .getByRole("tab", { name: /Checked-out visitors/ })
      .click();

    await expect(
      visible("Synthetic Departed Visitor"),
    ).toBeVisible();
    await expect(
      visible("Checked out"),
    ).toBeVisible();
    await expect(
      visible("None"),
    ).toBeVisible();

    if (!phone) {
      const checkedOutTable = browserPage.getByRole("region", { name: "Checked-out visitors table" });

      await expect(checkedOutTable.getByRole("columnheader", { exact: true, name: "Agency" })).toBeVisible();
      await expect(checkedOutTable.getByRole("columnheader", { name: "Action" })).toHaveCount(0);
    }
    await expect(
      browserPage.getByText("2 checked out today · 1,234 checked out in total"),
    ).toBeVisible();

    const todayRequest = state.history.find(
      (body) => body.dateFrom && body.pageSize === 10,
    );

    expect(todayRequest).toMatchObject({
      dateBasis: "check_out",
      dateFrom: NOW.toISOString().slice(0, 10),
      dateTo: NOW.toISOString().slice(0, 10),
      direction: "desc",
      sort: "date",
      status: "checked_out",
    });

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

    // The same columns as Visit History, plus Action.
    if (!phone) {
      const incidentsTable = browserPage.getByRole("region", { name: "Card incidents table" });

      for (const column of ["Visitor", "Organisation", "Contact", "Purpose", "Visiting", "Agency", "Date", "Check-in", "Check-out", "Card", "Status", "Action"]) {
        await expect(
          incidentsTable.getByRole("columnheader", { exact: true, name: column }),
        ).toBeVisible();
      }

      await expect(incidentsTable.getByText("VIS-CHK002")).toBeVisible();
      await expect(incidentsTable.getByText("GIPC", { exact: true })).toBeVisible();
    }

    await expectNoWcagViolations(browserPage);
    await expectNoHorizontalOverflow(browserPage);
  });

  test("opens on checked-in visitors even when nobody is checked in", async ({
    page: browserPage,
  }) => {
    await installMockStaffAuthentication(browserPage);
    await installMockCardsApi(browserPage);
    await browserPage.route(
      "**/api/staff/cards/checked-in",
      async (route) => {
        await route.fulfill({
          contentType: "application/json",
          json: { pagination: page(0), visitors: [] },
          status: 200,
        });
      },
    );

    await signInAsStaff(browserPage, { destination: "/staff/cards" });

    await expect(
      browserPage.getByRole("tab", { name: /Checked-in visitors/ }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      browserPage.getByText("There are no checked-in visitors matching these filters."),
    ).toBeVisible();
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
        .getByText("Awaiting card", { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  });

  // Admitting moved to the Dashboard with the pending admissions list;
  // it uses the same table and card dialog.
  test("finds a card as the receptionist types and admits the visitor from the dashboard", async ({
    page: browserPage,
  }) => {
    const searches = [];
    const admissions = [];

    await installMockStaffAuthentication(browserPage, {
      fullName: "Synthetic Administrator",
      role: "admin",
    });
    await installMockCardsApi(browserPage);
    await browserPage.route(
      "**/api/staff/cards/search",
      async (route) => {
        const body = route.request().postDataJSON();
        const prefix = body.cardType === "vip" ? "MOF-VIP" : "MOF-V";

        searches.push(body);
        await route.fulfill({
          contentType: "application/json",
          json: {
            cards: [
              {
                cardId: `synthetic-${body.cardType}-card`,
                cardNumber: `${prefix}${body.lastThreeDigits}`,
                cardType: body.cardType,
                status: "available",
                tower: body.tower,
              },
            ],
          },
          status: 200,
        });
      },
    );
    await browserPage.route(
      "**/api/staff/cards/admit",
      async (route) => {
        const body = route.request().postDataJSON();

        admissions.push(body);
        await route.fulfill({
          contentType: "application/json",
          json: {
            admitted: true,
            cardAssignment: {
              cardId: body.cardId,
              cardNumber: "MOF-VIP268",
            },
            visit: {
              status: "checked_in",
              visitId: body.visitId,
            },
          },
          status: 200,
        });
      },
    );

    await signInAsStaff(browserPage, {
      destination: "/staff",
    });

    await browserPage
      .getByRole("button", {
        name: "Assign card to Synthetic Pending Visitor",
      })
      .filter({ visible: true })
      .first()
      .click();

    const dialog = browserPage.getByRole("dialog", {
      name: "Assign visitor card",
    });

    await expect(dialog.getByText("VIS-PEND01")).toBeVisible();
    await expect(dialog.getByText("GIPC · Synthetic Host")).toBeVisible();

    const admit = dialog.getByRole("button", {
      name: "Assign card and admit",
    });

    await expect(admit).toBeDisabled();

    // Three digits search without pressing the search button.
    await dialog.getByLabel("Last three digits").fill("268");
    await expect(dialog.getByText("MOF-V268")).toBeVisible();
    await expect(admit).toBeEnabled();

    await expectNoWcagViolations(browserPage, {
      include: "[role=dialog]",
    });

    // Switching the card type searches again.
    await dialog.getByText("VIP", { exact: true }).click();
    await expect(dialog.getByText("MOF-VIP268")).toBeVisible();
    expect(searches.at(-1)).toMatchObject({
      cardType: "vip",
      lastThreeDigits: "268",
      tower: "tower_1",
    });

    await admit.click();

    await expect(dialog).toHaveCount(0);
    // The confirmation arrives as a dismissable toast.
    const toast = browserPage.getByRole("status").filter({
      hasText: "Visitor card updated",
    });

    await expect(toast).toContainText(
      "Synthetic Pending Visitor was admitted with MOF-VIP268.",
    );
    await expectNoWcagViolations(browserPage, {
      include: "[aria-label=Notifications]",
    });
    await toast
      .getByRole("button", { name: "Dismiss Visitor card updated" })
      .click();
    await expect(toast).toHaveCount(0);
    expect(admissions).toEqual([
      expect.objectContaining({
        cardId: "synthetic-vip-card",
        visitId: "00000000-0000-4000-8000-000000000101",
      }),
    ]);
  });

  test("marks booked meeting guests on the dashboard and confirms the privacy notice before admitting them", async ({
    page: browserPage,
  }) => {
    const admissions = [];
    const bookedGuest = {
      ...PENDING[0],
      bookedGuest: true,
      email: null,
      fullName: "Synthetic Booked Guest",
      personVisiting: null,
      purpose: "Meeting",
      referenceCode: "MTG-A1B2C3-1",
      visitId: "00000000-0000-4000-8000-000000000109",
    };

    await installMockStaffAuthentication(browserPage);
    await installMockCardsApi(browserPage);
    await browserPage.route("**/api/staff/cards/pending", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        json: { admissions: [bookedGuest], pagination: page(1) },
        status: 200,
      });
    });
    await browserPage.route("**/api/staff/cards/search", async (route) => {
      const body = route.request().postDataJSON();

      await route.fulfill({
        contentType: "application/json",
        json: {
          cards: [
            {
              cardId: "synthetic-regular-card",
              cardNumber: `MOF-V${body.lastThreeDigits}`,
              cardType: "regular",
              status: "available",
              tower: body.tower,
            },
          ],
        },
        status: 200,
      });
    });
    await browserPage.route("**/api/staff/cards/admit", async (route) => {
      const body = route.request().postDataJSON();

      admissions.push(body);
      await route.fulfill({
        contentType: "application/json",
        json: {
          admitted: true,
          cardAssignment: { cardId: body.cardId, cardNumber: "MOF-V268" },
          visit: { status: "checked_in", visitId: body.visitId },
        },
        status: 200,
      });
    });

    await signInAsStaff(browserPage, { destination: "/staff" });

    await expect(
      browserPage
        .getByRole("img", { name: "Booked meeting guest" })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await browserPage
      .getByRole("button", { name: "Assign card to Synthetic Booked Guest" })
      .filter({ visible: true })
      .first()
      .click();

    const dialog = browserPage.getByRole("dialog", { name: "Assign visitor card" });
    const admit = dialog.getByRole("button", { name: "Assign card and admit" });

    await dialog.getByLabel("Last three digits").fill("268");
    await expect(dialog.getByText("MOF-V268")).toBeVisible();

    // The card alone is not enough for a booked guest.
    await expect(admit).toBeDisabled();
    await expectNoWcagViolations(browserPage, { include: "[role=dialog]" });

    await dialog.getByRole("checkbox", { name: /privacy notice/ }).check();
    await expect(admit).toBeEnabled();
    await admit.click();

    await expect(dialog).toHaveCount(0);
    expect(admissions).toEqual([
      expect.objectContaining({
        privacyConfirmed: true,
        visitId: "00000000-0000-4000-8000-000000000109",
      }),
    ]);
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
