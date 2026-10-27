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

const SUMMARY = {
  assignedCount: 1,
  availableCount: 347,
  deactivatedCount: 0,
  investigatingCount: 0,
  notReturnedCount: 1,
  regularCount: 299,
  tower1Count: 100,
  tower2Count: 249,
  towerCountsByType: {
    regular: { tower_1: 100, tower_2: 199 },
    vip: { tower_1: 0, tower_2: 50 },
  },
  vipCount: 50,
};

function makeCard(cardType, index, overrides = {}) {
  const number = String(index + 1).padStart(3, "0");

  return {
    activeAssignment: null,
    activeIncident: null,
    baseNumber: index + 1,
    canChangeTower: true,
    cardId: `00000000-0000-4000-8000-${cardType === "vip" ? "1" : "0"}${String(index).padStart(11, "0")}`,
    cardNumber: `MOF-${cardType === "vip" ? "VIP" : "V"}${number}`,
    cardType,
    replacementSequence: 0,
    status: "available",
    tower: "tower_2",
    ...overrides,
  };
}

async function installMockInventory(page, requests) {
  await page.route(
    "**/api/admin/cards/inventory",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const body = route.request().postDataJSON();
      requests.push(body);

      const total =
        body.cardType === "vip" ? 50 : 199;

      const cards = Array.from(
        { length: body.pageSize },
        (_, index) =>
          makeCard(
            body.cardType,
            (body.page - 1) * body.pageSize + index,
            index === 1
              ? {
                  activeAssignment: {
                    assignmentId: "00000000-0000-4000-8000-000000000901",
                    fullName: "Synthetic Assigned Visitor",
                    referenceCode: "VIS-ASSIGN1",
                    returnDueAt: new Date().toISOString(),
                    visitId: "00000000-0000-4000-8000-000000000902",
                  },
                  canChangeTower: false,
                  status: "assigned",
                }
              : {},
          ),
      );

      await route.fulfill({
        contentType: "application/json",
        json: {
          cards,
          filters: body,
          pagination: {
            page: body.page,
            pageSize: body.pageSize,
            totalCount: total,
            totalPages: Math.ceil(total / body.pageSize),
          },
          summary: SUMMARY,
        },
        status: 200,
      });
    },
  );
}

async function expectNoHorizontalOverflow(page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test.describe("visitor-card inventory page", () => {
  test("shows card tiles by type and tower without accessibility or overflow problems", async ({
    page,
  }) => {
    const requests = [];

    await installMockStaffAuthentication(page, {
      fullName: "Synthetic Administrator",
      role: "admin",
    });
    await installMockInventory(page, requests);

    await signInAsStaff(page, {
      destination: "/staff/admin/cards",
    });

    await expect(
      page.getByRole("heading", {
        name: "Visitor-card inventory",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "MOF-V001" }),
    ).toBeVisible();
    await expect(
      page.getByText("199 matching cards"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Tower 1\s*100/ }),
    ).toBeVisible();

    expect(requests.at(-1)).toMatchObject({
      cardType: "regular",
      pageSize: 24,
      tower: "all",
    });

    await expectNoWcagViolations(page);
    await expectNoHorizontalOverflow(page);

    await page
      .getByRole("button", { name: /^VIP/ })
      .click();

    await expect(
      page.getByRole("heading", { name: "MOF-VIP001" }),
    ).toBeVisible();
    await expect(
      page.getByText("50 matching cards"),
    ).toBeVisible();

    // VIP cards are all in Tower 2, so Tower 1 has no tab.
    await expect(
      page.getByRole("button", { name: /^Tower 1/ }),
    ).toHaveCount(0);

    await page
      .getByRole("group", { name: "Card status" })
      .getByRole("button", { name: "Assigned" })
      .click();

    await expect
      .poll(() => requests.at(-1))
      .toMatchObject({
        cardType: "vip",
        status: "assigned",
      });

    await expectNoWcagViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  test("opens card details and only offers a tower change for available cards", async ({
    page,
  }) => {
    await installMockStaffAuthentication(page, {
      fullName: "Synthetic Administrator",
      role: "admin",
    });
    await installMockInventory(page, []);

    await signInAsStaff(page, {
      destination: "/staff/admin/cards",
    });

    await page
      .getByRole("button", { name: "View MOF-V002 details" })
      .click();

    const dialog = page.getByRole("dialog", {
      name: "MOF-V002",
    });

    await expect(
      dialog.getByText("Synthetic Assigned Visitor"),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Change tower" }),
    ).toBeDisabled();

    await expectNoWcagViolations(page);

    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .click();

    await page
      .getByRole("button", { name: "View MOF-V001 details" })
      .click();

    await page
      .getByRole("dialog", { name: "MOF-V001" })
      .getByRole("button", { name: "Change tower" })
      .click();

    await expect(
      page.getByRole("dialog", {
        name: "Change issuing tower",
      }),
    ).toBeVisible();
  });
});
