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
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_STAFF_ID,
} from "./support/staff-authentication.js";

const ADMIN_STAFF_PATH =
  "/staff/admin/staff";

function createStaffMember(index) {
  const sequence =
    String(index).padStart(2, "0");

  return {
    active: index % 3 !== 0,
    createdAt: new Date(
      Date.UTC(2026, 7, index, 8, 0, 0),
    ).toISOString(),
    email:
      `synthetic.staff.${sequence}@example.invalid`,
    emailConfirmed: index % 4 !== 0,
    fullName:
      `Synthetic Staff ${sequence}`,
    lastSignInAt:
      index % 4 === 0
        ? null
        : new Date(
            Date.UTC(
              2026,
              7,
              index,
              10,
              30,
              0,
            ),
          ).toISOString(),
    passwordChangeRequired:
      index === 1 || index === 4,
    passwordSetupCompletedAt:
      index === 2
        ? "2026-08-18T11:00:00.000Z"
        : null,
    role:
      index % 2 === 0
        ? "admin"
        : "receptionist",
    temporaryPasswordExpiresAt:
      index === 1
        ? "2099-08-26T13:30:00.000Z"
        : index === 4
          ? "2020-01-01T00:00:00.000Z"
          : null,
    userId:
      index === 13
        ? SYNTHETIC_STAFF_ID
        : `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  };
}

function createStaffRecords() {
  return Array.from(
    {
      length: 13,
    },
    (_, index) =>
      createStaffMember(index + 1),
  );
}

function filterStaff(
  staff,
  {
    role,
    search,
    status,
  },
) {
  const normalizedSearch =
    search.trim().toLowerCase();

  return staff.filter((staffMember) => {
    const matchesSearch =
      !normalizedSearch ||
      staffMember.fullName
        .toLowerCase()
        .includes(normalizedSearch) ||
      staffMember.email
        .toLowerCase()
        .includes(normalizedSearch);

    const matchesRole =
      role === "all" ||
      staffMember.role === role;

    const matchesStatus =
      status === "all" ||
      (
        status === "active" &&
        staffMember.active
      ) ||
      (
        status === "inactive" &&
        !staffMember.active
      );

    return (
      matchesSearch &&
      matchesRole &&
      matchesStatus
    );
  });
}

async function expectNoHorizontalOverflow(
  page,
) {
  const dimensions = await page.evaluate(
    () => {
      const documentElement =
        document.documentElement;

      const body = document.body;

      return {
        clientWidth:
          documentElement.clientWidth,
        scrollWidth: Math.max(
          documentElement.scrollWidth,
          body?.scrollWidth || 0,
        ),
      };
    },
  );

  expect(
    dimensions.scrollWidth,
  ).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

function visibleText(page, text) {
  return page
    .getByText(text, {
      exact: true,
    })
    .filter({
      visible: true,
    });
}

async function installMockStaffAdministration(
  page,
) {
  const state = {
    deletionRequests: [],
    invitationRequests: [],
    listRequests: [],
    passwordReissueRequests: [],
    staff: createStaffRecords(),
    updateRequests: [],
  };

  await page.route(
    "**/api/admin/staff/list",
    async (route) => {
      const request = route.request();

      expect(request.method()).toBe("POST");

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      const body = request.postDataJSON();

      state.listRequests.push(body);

      const matchingStaff = filterStaff(
        state.staff,
        body,
      );

      const start =
        (body.page - 1) * body.pageSize;

      const staff = matchingStaff.slice(
        start,
        start + body.pageSize,
      );

      await route.fulfill({
        contentType: "application/json",
        json: {
          pagination: {
            page: body.page,
            pageSize: body.pageSize,
            totalCount:
              matchingStaff.length,
            totalPages: Math.ceil(
              matchingStaff.length /
                body.pageSize,
            ),
          },
          staff,
        },
        status: 200,
      });
    },
  );

  await page.route(
    "**/api/admin/staff/invite",
    async (route) => {
      const request = route.request();

      expect(request.method()).toBe("POST");

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      const body = request.postDataJSON();

      state.invitationRequests.push(body);

      const staffMember = {
        active: true,
        createdAt:
          "2026-08-17T10:00:00.000Z",
        email: body.email,
        emailConfirmed: false,
        fullName: body.fullName,
        lastSignInAt: null,
        passwordChangeRequired: true,
        passwordSetupCompletedAt: null,
        role: body.role,
        temporaryPasswordExpiresAt:
          "2099-08-26T13:30:00.000Z",
        userId:
          "00000000-0000-4000-8000-000000000099",
      };

      state.staff.unshift(staffMember);

      await route.fulfill({
        contentType: "application/json",
        json: {
          invitationSent: true,
          staff: staffMember,
        },
        status: 201,
      });
    },
  );

  await page.route(
    "**/api/admin/staff/update",
    async (route) => {
      const request = route.request();

      expect(request.method()).toBe("POST");

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      const body = request.postDataJSON();

      state.updateRequests.push(body);

      const existingIndex =
        state.staff.findIndex(
          (staffMember) =>
            staffMember.userId ===
            body.userId,
        );

      expect(existingIndex).toBeGreaterThanOrEqual(
        0,
      );

      const staffMember = {
        ...state.staff[existingIndex],
        active: body.active,
        fullName: body.fullName,
        role: body.role,
      };

      state.staff[existingIndex] =
        staffMember;

      await route.fulfill({
        contentType: "application/json",
        json: {
          staff: staffMember,
        },
        status: 200,
      });
    },
  );

  await page.route(
    "**/api/admin/staff/reissue-password",
    async (route) => {
      const request = route.request();

      expect(request.method()).toBe("POST");

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      const body =
        request.postDataJSON();

      state.passwordReissueRequests.push(
        body,
      );

      const existingIndex =
        state.staff.findIndex(
          (staffMember) =>
            staffMember.userId ===
            body.userId,
        );

      expect(existingIndex)
        .toBeGreaterThanOrEqual(0);

      const staffMember = {
        ...state.staff[existingIndex],
        passwordChangeRequired: true,
        passwordSetupCompletedAt: null,
        temporaryPasswordExpiresAt:
          "2099-08-27T13:30:00.000Z",
      };

      state.staff[existingIndex] =
        staffMember;

      await route.fulfill({
        contentType: "application/json",
        json: {
          staff: {
            email: staffMember.email,
            fullName:
              staffMember.fullName,
            role: staffMember.role,
            userId: staffMember.userId,
          },
          temporaryPasswordReissued:
            true,
        },
        status: 200,
      });
    },
  );

  await page.route(
    "**/api/admin/staff/delete",
    async (route) => {
      const request = route.request();

      expect(request.method()).toBe("POST");

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      const body =
        request.postDataJSON();

      state.deletionRequests.push(body);

      const existingIndex =
        state.staff.findIndex(
          (staffMember) =>
            staffMember.userId ===
            body.userId,
        );

      expect(existingIndex)
        .toBeGreaterThanOrEqual(0);

      const [
        staffMember,
      ] = state.staff.splice(
        existingIndex,
        1,
      );

      expect(
        body.confirmationEmail,
      ).toBe(staffMember.email);

      await route.fulfill({
        contentType: "application/json",
        json: {
          accountDeleted: true,
          staff: {
            email: staffMember.email,
            fullName:
              staffMember.fullName,
            role: staffMember.role,
            userId: staffMember.userId,
          },
        },
        status: 200,
      });
    },
  );

  return state;
}

async function openStaffAdministration(
  page,
) {
  await installMockStaffAuthentication(
    page,
    {
      fullName:
        "Synthetic Administrator",
      role: "admin",
    },
  );

  const state =
    await installMockStaffAdministration(
      page,
    );

  await signInAsStaff(page, {
    destination: ADMIN_STAFF_PATH,
  });

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Staff accounts",
    }),
  ).toBeVisible();

  return state;
}

test.describe(
  "administrator staff-account management",
  () => {
    test(
      "loads staff accounts without detectable accessibility or overflow problems",
      async ({ page }) => {
        const state =
          await openStaffAdministration(
            page,
          );

        await expect(
          visibleText(
            page,
            "Synthetic Staff 01",
          ).first(),
        ).toBeVisible();

        await expect(
          page.getByText(
            "13 matching staff accounts",
          ),
        ).toBeVisible();

        await expect
          .poll(
            () =>
              state.listRequests.at(-1),
          )
          .toEqual({
            page: 1,
            pageSize: 10,
            role: "all",
            search: "",
            status: "all",
          });

        await expect(
  page.getByRole("link", {
    name: "Staff",
    exact: true,
  }),
).toHaveAttribute(
  "aria-current",
  "page",
);

        await expectNoWcagViolations(
          page,
        );

        await expectNoHorizontalOverflow(
          page,
        );
      },
    );

    test(
      "supports server-side pagination and staff filtering",
      async ({ page }) => {
        const state =
          await openStaffAdministration(
            page,
          );

        await page
          .getByRole("button", {
            name: "Next page",
          })
          .click();

        await expect
          .poll(
            () =>
              state.listRequests.at(-1),
          )
          .toEqual({
            page: 2,
            pageSize: 10,
            role: "all",
            search: "",
            status: "all",
          });

        await expect(
          visibleText(
            page,
            "Synthetic Staff 11",
          ).first(),
        ).toBeVisible();

        await expect(
          page.getByText("Page 2 of 2"),
        ).toBeVisible();

        await page
          .getByRole("searchbox", {
            name:
              "Staff name or email",
          })
          .fill("Staff 12");

        await page
          .getByLabel("Role")
          .selectOption("admin");

        await page
          .getByLabel("Status")
          .selectOption("inactive");

        await page
          .getByRole("button", {
            name: "Apply",
          })
          .click();

        await expect
          .poll(
            () =>
              state.listRequests.at(-1),
          )
          .toEqual({
            page: 1,
            pageSize: 10,
            role: "admin",
            search: "Staff 12",
            status: "inactive",
          });

        await expect(
          visibleText(
            page,
            "Synthetic Staff 12",
          ).first(),
        ).toBeVisible();

        await expect(
          page.getByText(
            "1 matching staff account",
          ),
        ).toBeVisible();

        await expect(
          visibleText(
            page,
            "Synthetic Staff 11",
          ),
        ).toHaveCount(0);
      },
    );

    test(
      "validates and sends a staff invitation",
      async ({ page }) => {
        const state =
          await openStaffAdministration(
            page,
          );

        await page
          .getByRole("button", {
            name: "Invite staff",
          })
          .click();

        const dialog =
          page.getByRole("dialog", {
            name:
              "Invite staff member",
          });

        await expect(dialog).toBeVisible();

        await dialog
          .getByRole("button", {
            name: "Send invitation",
          })
          .click();

        await expect(
          dialog.getByText(
            "Staff name must contain at least 2 characters.",
          ),
        ).toBeVisible();

        await expect(
          dialog.getByText(
            "Enter a valid email address.",
          ),
        ).toBeVisible();

        expect(
          state.invitationRequests,
        ).toHaveLength(0);

        await dialog
          .getByLabel(/^Full name/i)
          .fill(
            "Synthetic Invited Staff",
          );

        await dialog
          .getByLabel(
            /^Email address/i,
          )
          .fill(
            "NEW.STAFF@example.invalid",
          );

        await dialog
          .getByLabel(
            /Authorised role/i,
          )
          .selectOption("admin");

        await dialog
          .getByRole("button", {
            name: "Send invitation",
          })
          .click();

        await expect
          .poll(
            () =>
              state.invitationRequests.at(
                -1,
              ),
          )
          .toEqual({
            email:
              "new.staff@example.invalid",
            fullName:
              "Synthetic Invited Staff",
            role: "admin",
          });

        await expect(
          page.getByRole("status").filter({
            hasText:
              "An invitation was sent to new.staff@example.invalid.",
          }),
        ).toBeVisible();

        await expect(dialog).toBeHidden();

        await expect(
          visibleText(
            page,
            "Synthetic Invited Staff",
          ).first(),
        ).toBeVisible();

        const invitedRecord = page
          .locator(
            "tr:visible, article:visible",
          )
          .filter({
            hasText:
              "Synthetic Invited Staff",
          });

        await expect(
          invitedRecord.getByText(
            "Invitation pending",
            {
              exact: true,
            },
          ),
        ).toBeVisible();
      },
    );

    test(
      "changes a staff role and deactivates access",
      async ({ page }) => {
        const state =
          await openStaffAdministration(
            page,
          );

        const staffRecord = page
          .locator(
            "tr:visible, article:visible",
          )
          .filter({
            hasText:
              "Synthetic Staff 01",
          });

        await staffRecord
          .getByRole("button", {
            name: "Edit",
          })
          .click();

        const dialog =
          page.getByRole("dialog", {
            name:
              "Edit staff account",
          });

        await expect(dialog).toBeVisible();

        await expect(
          dialog.getByText(
            "synthetic.staff.01@example.invalid",
          ),
        ).toBeVisible();

        await dialog
          .getByLabel(/^Full name/i)
          .fill(
            "Synthetic Staff 01 Updated",
          );

        await dialog
          .getByLabel(
            /Authorised role/i,
          )
          .selectOption("admin");

        await dialog
          .getByRole("checkbox", {
            name:
              /Active staff access/i,
          })
          .uncheck();

        await dialog
          .getByRole("button", {
            name: "Save changes",
          })
          .click();

        await expect
          .poll(
            () =>
              state.updateRequests.at(-1),
          )
          .toEqual({
            active: false,
            fullName:
              "Synthetic Staff 01 Updated",
            role: "admin",
            userId:
              "00000000-0000-4000-8000-000000000001",
          });

        await expect(
          page.getByRole("status").filter({
            hasText:
              "Synthetic Staff 01 Updated was updated successfully.",
          }),
        ).toBeVisible();

        await expect(dialog).toBeHidden();

        const updatedRecord = page
          .locator(
            "tr:visible, article:visible",
          )
          .filter({
            hasText:
              "Synthetic Staff 01 Updated",
          });

        await expect(
          updatedRecord,
        ).toBeVisible();

        await expect(
          updatedRecord.getByText(
            "Administrator",
            {
              exact: true,
            },
          ),
        ).toBeVisible();

        await expect(
          updatedRecord.getByText(
            "Inactive",
            {
              exact: true,
            },
          ),
        ).toBeVisible();
      },
    );

    test(
      "reissues a temporary password for a pending staff account",
      async ({ page }) => {
        const state =
          await openStaffAdministration(
            page,
          );

        const staffRecord = page
          .locator(
            "tr:visible, article:visible",
          )
          .filter({
            hasText:
              "Synthetic Staff 01",
          });

        await expect(
          staffRecord.getByText(
            "Password setup pending",
            {
              exact: true,
            },
          ),
        ).toBeVisible();

        await staffRecord
          .getByRole("button", {
            name: "Reissue password",
          })
          .click();

        const dialog =
          page.getByRole("dialog", {
            name:
              "Reissue temporary password",
          });

        await expect(dialog).toBeVisible();

        await expect(
          dialog.getByText(
            /previous temporary password will immediately stop working/i,
          ),
        ).toBeVisible();

        await dialog
          .getByRole("button", {
            name:
              "Reissue temporary password",
          })
          .click();

        await expect
          .poll(
            () =>
              state.passwordReissueRequests
                .at(-1),
          )
          .toEqual({
            userId:
              "00000000-0000-4000-8000-000000000001",
          });

        await expect(
          page.getByRole("status").filter({
            hasText:
              "A new temporary password was sent to synthetic.staff.01@example.invalid.",
          }),
        ).toBeVisible();

        await expect(dialog).toBeHidden();

        await expect(
          visibleText(
            page,
            "Synthetic Staff 01",
          ).first(),
        ).toBeVisible();
      },
    );

    test(
      "requires the exact email before permanently deleting a staff account",
      async ({ page }) => {
        const state =
          await openStaffAdministration(
            page,
          );

        const staffRecord = page
          .locator(
            "tr:visible, article:visible",
          )
          .filter({
            hasText:
              "Synthetic Staff 02",
          });

        await staffRecord
          .getByRole("button", {
            name: "Delete account",
          })
          .click();

        const dialog =
          page.getByRole("dialog", {
            name:
              "Delete staff account",
          });

        await expect(dialog).toBeVisible();

        const deleteButton =
          dialog.getByRole("button", {
            name:
              "Permanently delete account",
          });

        await expect(
          deleteButton,
        ).toBeDisabled();

        await dialog
          .getByLabel(
            /Type the staff email address/i,
          )
          .fill(
            "wrong.staff@example.invalid",
          );

        await expect(
          deleteButton,
        ).toBeDisabled();

        expect(
          state.deletionRequests,
        ).toHaveLength(0);

        await dialog
          .getByLabel(
            /Type the staff email address/i,
          )
          .fill(
            "SYNTHETIC.STAFF.02@EXAMPLE.INVALID",
          );

        await expect(
          deleteButton,
        ).toBeEnabled();

        await deleteButton.click();

        await expect
          .poll(
            () =>
              state.deletionRequests.at(-1),
          )
          .toEqual({
            confirmationEmail:
              "synthetic.staff.02@example.invalid",
            userId:
              "00000000-0000-4000-8000-000000000002",
          });

        await expect(
          page.getByRole("status").filter({
            hasText:
              "synthetic.staff.02@example.invalid was permanently deleted.",
          }),
        ).toBeVisible();

        await expect(dialog).toBeHidden();

        await expect(
          visibleText(
            page,
            "Synthetic Staff 02",
          ),
        ).toHaveCount(0);
      },
    );

    test(
      "does not offer deletion for the signed-in administrator",
      async ({ page }) => {
        await openStaffAdministration(
          page,
        );

        await page
          .getByRole("searchbox", {
            name:
              "Staff name or email",
          })
          .fill("Staff 13");

        await page
          .getByRole("button", {
            name: "Apply",
          })
          .click();

        const ownRecord = page
          .locator(
            "tr:visible, article:visible",
          )
          .filter({
            hasText:
              "Synthetic Staff 13",
          });

        await expect(
          ownRecord,
        ).toBeVisible();

        await expect(
          ownRecord.getByRole("button", {
            name: "Delete account",
          }),
        ).toHaveCount(0);
      },
    );
  },
);