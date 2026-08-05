import assert from "node:assert/strict";
import adminEndpoint from "../api/admin.js";
import {
  adminHostListSchema,
  adminHostSaveSchema,
  adminStaffInviteSchema,
  adminStaffListSchema,
  adminStaffUpdateSchema,
  staffPasswordSetupSchema,
} from "../src/validation/adminManagement.js";

const TEST_HOST_ID =
  "11111111-1111-4111-8111-111111111111";

const TEST_USER_ID =
  "22222222-2222-4222-8222-222222222222";

function createRequest(path, options = {}) {
  return new Request(
    `http://localhost${path}`,
    options,
  );
}

async function readResponse(response) {
  return {
    body: await response.json(),
    response,
  };
}

function verifyHostListValidation() {
  const defaultResult =
    adminHostListSchema.safeParse({});

  assert.equal(defaultResult.success, true);

  assert.deepEqual(defaultResult.data, {
    page: 1,
    pageSize: 10,
    search: "",
    status: "all",
  });

  assert.equal(
    adminHostListSchema.safeParse({
      page: 2,
      pageSize: 10,
      search: "ICT",
      status: "active",
    }).success,
    true,
  );

  assert.equal(
    adminHostListSchema.safeParse({
      page: 0,
    }).success,
    false,
  );

  assert.equal(
    adminHostListSchema.safeParse({
      pageSize: 11,
    }).success,
    false,
  );

  assert.equal(
    adminHostListSchema.safeParse({
      search: "a".repeat(81),
    }).success,
    false,
  );

  assert.equal(
    adminHostListSchema.safeParse({
      status: "unknown",
    }).success,
    false,
  );

  assert.equal(
    adminHostListSchema.safeParse({
      unexpected: true,
    }).success,
    false,
  );
}

function verifyHostSaveValidation() {
  const createResult =
    adminHostSaveSchema.safeParse({
      active: true,
      department: "ICT Directorate",
      fullName: "Development Host",
    });

  assert.equal(createResult.success, true);
  assert.equal(
    createResult.data.hostId,
    null,
  );

  const updateResult =
    adminHostSaveSchema.safeParse({
      active: false,
      department: "Finance Division",
      fullName: "Development Host",
      hostId: TEST_HOST_ID,
    });

  assert.equal(updateResult.success, true);
  assert.equal(
    updateResult.data.hostId,
    TEST_HOST_ID,
  );

  assert.equal(
    adminHostSaveSchema.safeParse({
      active: true,
      department: "A",
      fullName: "Development Host",
    }).success,
    false,
  );

  assert.equal(
    adminHostSaveSchema.safeParse({
      active: true,
      department: "ICT Directorate",
      fullName: "A",
    }).success,
    false,
  );

  assert.equal(
    adminHostSaveSchema.safeParse({
      active: true,
      department: "ICT Directorate",
      fullName: "Development Host",
      hostId: "not-a-uuid",
    }).success,
    false,
  );

  assert.equal(
    adminHostSaveSchema.safeParse({
      active: "true",
      department: "ICT Directorate",
      fullName: "Development Host",
    }).success,
    false,
  );

  assert.equal(
    adminHostSaveSchema.safeParse({
      active: true,
      department: "ICT Directorate",
      fullName: "Development Host",
      unexpected: true,
    }).success,
    false,
  );
}

function verifyStaffListValidation() {
  const defaultResult =
    adminStaffListSchema.safeParse({});

  assert.equal(defaultResult.success, true);

  assert.deepEqual(defaultResult.data, {
    page: 1,
    pageSize: 10,
    role: "all",
    search: "",
    status: "all",
  });

  assert.equal(
    adminStaffListSchema.safeParse({
      page: 1,
      pageSize: 10,
      role: "admin",
      search: "development",
      status: "active",
    }).success,
    true,
  );

  assert.equal(
    adminStaffListSchema.safeParse({
      page: 0,
    }).success,
    false,
  );

  assert.equal(
    adminStaffListSchema.safeParse({
      pageSize: 11,
    }).success,
    false,
  );

  assert.equal(
    adminStaffListSchema.safeParse({
      role: "manager",
    }).success,
    false,
  );

  assert.equal(
    adminStaffListSchema.safeParse({
      status: "unknown",
    }).success,
    false,
  );

  assert.equal(
    adminStaffListSchema.safeParse({
      search: "a".repeat(121),
    }).success,
    false,
  );
}

function verifyStaffInviteValidation() {
  const validResult =
    adminStaffInviteSchema.safeParse({
      email: "INVITED.USER@EXAMPLE.COM",
      fullName: "Invited User",
      role: "receptionist",
    });

  assert.equal(validResult.success, true);
  assert.equal(
    validResult.data.email,
    "invited.user@example.com",
  );

  assert.equal(
    adminStaffInviteSchema.safeParse({
      email: "not-an-email",
      fullName: "Invited User",
      role: "receptionist",
    }).success,
    false,
  );

  assert.equal(
    adminStaffInviteSchema.safeParse({
      email: "invited.user@example.com",
      fullName: "A",
      role: "receptionist",
    }).success,
    false,
  );

  assert.equal(
    adminStaffInviteSchema.safeParse({
      email: "invited.user@example.com",
      fullName: "Invited User",
      role: "manager",
    }).success,
    false,
  );

  assert.equal(
    adminStaffInviteSchema.safeParse({
      email: "invited.user@example.com",
      fullName: "Invited User",
      role: "admin",
      unexpected: true,
    }).success,
    false,
  );
}

function verifyStaffUpdateValidation() {
  const validResult =
    adminStaffUpdateSchema.safeParse({
      active: true,
      fullName: "Updated Staff User",
      role: "admin",
      userId: TEST_USER_ID,
    });

  assert.equal(validResult.success, true);

  assert.equal(
    adminStaffUpdateSchema.safeParse({
      active: false,
      fullName: "Updated Staff User",
      role: "admin",
      userId: "not-a-uuid",
    }).success,
    false,
  );

  assert.equal(
    adminStaffUpdateSchema.safeParse({
      active: false,
      fullName: "A",
      role: "admin",
      userId: TEST_USER_ID,
    }).success,
    false,
  );

  assert.equal(
    adminStaffUpdateSchema.safeParse({
      active: false,
      fullName: "Updated Staff User",
      role: "manager",
      userId: TEST_USER_ID,
    }).success,
    false,
  );

  assert.equal(
    adminStaffUpdateSchema.safeParse({
      active: "false",
      fullName: "Updated Staff User",
      role: "admin",
      userId: TEST_USER_ID,
    }).success,
    false,
  );
}

function verifyPasswordSetupValidation() {
  const validResult =
    staffPasswordSetupSchema.safeParse({
      confirmPassword: "StrongPassword1!",
      password: "StrongPassword1!",
    });

  assert.equal(validResult.success, true);

  assert.equal(
    staffPasswordSetupSchema.safeParse({
      confirmPassword: "StrongPassword1!",
      password: "DifferentPassword1!",
    }).success,
    false,
  );

  assert.equal(
    staffPasswordSetupSchema.safeParse({
      confirmPassword: "short",
      password: "short",
    }).success,
    false,
  );

  assert.equal(
    staffPasswordSetupSchema.safeParse({
      confirmPassword: "NoSymbolPassword1",
      password: "NoSymbolPassword1",
    }).success,
    false,
  );

  assert.equal(
    staffPasswordSetupSchema.safeParse({
      confirmPassword: "NOLOWERCASE1!",
      password: "NOLOWERCASE1!",
    }).success,
    false,
  );

  assert.equal(
    staffPasswordSetupSchema.safeParse({
      confirmPassword: "nouppercase1!",
      password: "nouppercase1!",
    }).success,
    false,
  );

  assert.equal(
    staffPasswordSetupSchema.safeParse({
      confirmPassword: "NoNumberPassword!",
      password: "NoNumberPassword!",
    }).success,
    false,
  );
}

const endpointChecks = [
  {
    body: {
      page: 1,
      pageSize: 10,
      search: "",
      status: "all",
    },
    endpoint: adminEndpoint,
    path: "/api/admin/hosts/list",
  },
  {
    body: {
      active: true,
      department: "ICT Directorate",
      fullName: "Development Host",
      hostId: null,
    },
    endpoint: adminEndpoint,
    path: "/api/admin/hosts/save",
  },
  {
    body: {
      email: "invited.user@example.com",
      fullName: "Invited User",
      role: "receptionist",
    },
    endpoint: adminEndpoint,
    path: "/api/admin/staff/invite",
  },
  {
    body: {
      page: 1,
      pageSize: 10,
      role: "all",
      search: "",
      status: "all",
    },
    endpoint: adminEndpoint,
    path: "/api/admin/staff/list",
  },
  {
    body: {
      active: true,
      fullName: "Updated Staff User",
      role: "receptionist",
      userId: TEST_USER_ID,
    },
    endpoint: adminEndpoint,
    path: "/api/admin/staff/update",
  },
];

async function verifyMethodRestrictions() {
  for (const check of endpointChecks) {
    const result = await readResponse(
      await check.endpoint.fetch(
        createRequest(check.path, {
          method: "GET",
        }),
      ),
    );

    assert.equal(
      result.response.status,
      405,
    );

    assert.equal(
      result.response.headers.get("allow"),
      "POST",
    );

    assert.equal(
      result.response.headers.get(
        "cache-control",
      ),
      "no-store",
    );

    assert.equal(
      result.body.error,
      "Method not allowed.",
    );
  }
}

async function verifyAuthenticationRequired() {
  for (const check of endpointChecks) {
    const result = await readResponse(
      await check.endpoint.fetch(
        createRequest(check.path, {
          body: JSON.stringify(check.body),
          headers: {
            "Content-Type":
              "application/json",
          },
          method: "POST",
        }),
      ),
    );

    assert.equal(
      result.response.status,
      401,
    );

    assert.equal(
      result.body.error,
      "A valid staff session is required.",
    );
  }
}

verifyHostListValidation();
verifyHostSaveValidation();
verifyStaffListValidation();
verifyStaffInviteValidation();
verifyStaffUpdateValidation();
verifyPasswordSetupValidation();

await verifyMethodRestrictions();
await verifyAuthenticationRequired();

console.log(
  "Host and staff administration validation checks passed.",
);