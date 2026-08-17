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
} from "./support/staff-authentication.js";

const ADMIN_HOSTS_PATH =
  "/staff/admin/hosts";

function createHost(index) {
  return {
    active: index % 3 !== 0,
    createdAt: new Date(
      Date.UTC(2026, 7, index, 9, 0, 0),
    ).toISOString(),
    department: `Synthetic Department ${String(index).padStart(2, "0")}`,
    fullName: `Synthetic Host ${String(index).padStart(2, "0")}`,
    hostId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  };
}

function createHostRecords() {
  return Array.from(
    {
      length: 13,
    },
    (_, index) => createHost(index + 1),
  );
}

function filterHosts(
  hosts,
  {
    search,
    status,
  },
) {
  const normalizedSearch =
    search.trim().toLowerCase();

  return hosts.filter((host) => {
    const matchesSearch =
      !normalizedSearch ||
      host.fullName
        .toLowerCase()
        .includes(normalizedSearch) ||
      host.department
        .toLowerCase()
        .includes(normalizedSearch);

    const matchesStatus =
      status === "all" ||
      (
        status === "active" &&
        host.active
      ) ||
      (
        status === "inactive" &&
        !host.active
      );

    return matchesSearch && matchesStatus;
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

async function installMockHostAdministration(
  page,
) {
  const state = {
    hosts: createHostRecords(),
    listRequests: [],
    saveRequests: [],
  };

  await page.route(
    "**/api/admin/hosts/list",
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

      const matchingHosts = filterHosts(
        state.hosts,
        body,
      );

      const start =
        (body.page - 1) * body.pageSize;

      const hosts = matchingHosts.slice(
        start,
        start + body.pageSize,
      );

      await route.fulfill({
        contentType: "application/json",
        json: {
          hosts,
          pagination: {
            page: body.page,
            pageSize: body.pageSize,
            totalCount:
              matchingHosts.length,
            totalPages: Math.ceil(
              matchingHosts.length /
                body.pageSize,
            ),
          },
        },
        status: 200,
      });
    },
  );

  await page.route(
    "**/api/admin/hosts/save",
    async (route) => {
      const request = route.request();

      expect(request.method()).toBe("POST");

      expect(
        request.headers().authorization,
      ).toBe(
        `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      );

      const body = request.postDataJSON();

      state.saveRequests.push(body);

      if (body.hostId === null) {
        const host = {
          active: body.active,
          createdAt:
            "2026-08-17T09:30:00.000Z",
          department: body.department,
          fullName: body.fullName,
          hostId:
            "00000000-0000-4000-8000-000000000099",
        };

        state.hosts.unshift(host);

        await route.fulfill({
          contentType: "application/json",
          json: {
            host,
          },
          status: 201,
        });

        return;
      }

      const existingIndex =
        state.hosts.findIndex(
          (host) =>
            host.hostId === body.hostId,
        );

      expect(existingIndex).toBeGreaterThanOrEqual(
        0,
      );

      const existingHost =
        state.hosts[existingIndex];

      const host = {
        ...existingHost,
        active: body.active,
        department: body.department,
        fullName: body.fullName,
      };

      state.hosts[existingIndex] = host;

      await route.fulfill({
        contentType: "application/json",
        json: {
          host,
        },
        status: 200,
      });
    },
  );

  return state;
}

async function openHostAdministration(page) {
  await installMockStaffAuthentication(
    page,
    {
      fullName:
        "Synthetic Administrator",
      role: "admin",
    },
  );

  const state =
    await installMockHostAdministration(
      page,
    );

  await signInAsStaff(page, {
    destination: ADMIN_HOSTS_PATH,
  });

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Hosts",
    }),
  ).toBeVisible();

  return state;
}

test.describe(
  "administrator host management",
  () => {
    test(
      "loads host records without detectable accessibility or overflow problems",
      async ({ page }) => {
        const state =
          await openHostAdministration(
            page,
          );

        await expect(
          visibleText(
            page,
            "Synthetic Host 01",
          ).first(),
        ).toBeVisible();

        await expect(
          page.getByText(
            "13 matching hosts",
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
            search: "",
            status: "all",
          });

        await expect(
          page.getByRole("link", {
            name: "Hosts",
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
      "supports server-side pagination and host filtering",
      async ({ page }) => {
        const state =
          await openHostAdministration(
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
            search: "",
            status: "all",
          });

        await expect(
          visibleText(
            page,
            "Synthetic Host 11",
          ).first(),
        ).toBeVisible();

        await expect(
          page.getByText("Page 2 of 2"),
        ).toBeVisible();

        await page
          .getByRole("searchbox", {
            name:
              "Host name or department",
          })
          .fill("Host 12");

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
            search: "Host 12",
            status: "inactive",
          });

        await expect(
          visibleText(
            page,
            "Synthetic Host 12",
          ).first(),
        ).toBeVisible();

        await expect(
          page.getByText(
            "1 matching host",
          ),
        ).toBeVisible();

        await expect(
          visibleText(
            page,
            "Synthetic Host 11",
          ),
        ).toHaveCount(0);
      },
    );

    test(
      "validates and adds a host",
      async ({ page }) => {
        const state =
          await openHostAdministration(
            page,
          );

        await page
          .getByRole("button", {
            name: "Add host",
          })
          .click();

        const dialog =
          page.getByRole("dialog", {
            name: "Add host",
          });

        await expect(dialog).toBeVisible();

        await dialog
          .getByRole("button", {
            name: "Add host",
          })
          .click();

        await expect(
          dialog.getByText(
            "Host name must contain at least 2 characters.",
          ),
        ).toBeVisible();

        await expect(
          dialog.getByText(
            "Department must contain at least 2 characters.",
          ),
        ).toBeVisible();

        expect(
          state.saveRequests,
        ).toHaveLength(0);

        await dialog
          .getByLabel(
            /Host full name/i,
          )
          .fill(
            "Synthetic Added Host",
          );

        await dialog
          .getByLabel(
            /Department or office/i,
          )
          .fill(
            "Digital Services Unit",
          );

        await dialog
          .getByRole("button", {
            name: "Add host",
          })
          .click();

        await expect
          .poll(
            () =>
              state.saveRequests.at(-1),
          )
          .toEqual({
            active: true,
            department:
              "Digital Services Unit",
            fullName:
              "Synthetic Added Host",
            hostId: null,
          });

        await expect(
  page.getByRole("status").filter({
    hasText:
      "Synthetic Added Host was added successfully.",
  }),
).toBeVisible();

        await expect(dialog).toBeHidden();

        await expect(
          visibleText(
            page,
            "Synthetic Added Host",
          ).first(),
        ).toBeVisible();
      },
    );

    test(
      "edits and deactivates an existing host",
      async ({ page }) => {
        const state =
          await openHostAdministration(
            page,
          );

        const hostRecord = page
          .locator(
            "tr:visible, article:visible",
          )
          .filter({
            hasText:
              "Synthetic Host 01",
          });

        await hostRecord
          .getByRole("button", {
            name: "Edit",
          })
          .click();

        const dialog =
          page.getByRole("dialog", {
            name: "Edit host",
          });

        await expect(dialog).toBeVisible();

        await dialog
          .getByLabel(
            /Host full name/i,
          )
          .fill(
            "Synthetic Host 01 Updated",
          );

        await dialog
          .getByRole("checkbox", {
            name: /Active host/i,
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
              state.saveRequests.at(-1),
          )
          .toEqual({
            active: false,
            department:
              "Synthetic Department 01",
            fullName:
              "Synthetic Host 01 Updated",
            hostId:
              "00000000-0000-4000-8000-000000000001",
          });

        await expect(
  page.getByRole("status").filter({
    hasText:
      "Synthetic Host 01 Updated was updated successfully.",
  }),
).toBeVisible();

        await expect(dialog).toBeHidden();

        const updatedRecord = page
          .locator(
            "tr:visible, article:visible",
          )
          .filter({
            hasText:
              "Synthetic Host 01 Updated",
          });

        await expect(
          updatedRecord,
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
  },
);