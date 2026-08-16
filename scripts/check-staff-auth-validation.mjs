import assert from "node:assert/strict";
import staffSessionHandler from "../api/staff/session.js";
import {
  requireActiveStaff,
} from "../api/_lib/staffAuth.js";
import { staffLoginSchema } from "../src/validation/staffLogin.js";

const validLogin = staffLoginSchema.safeParse({
  email: "  RECEPTIONIST.DEV@example.com  ",
  password: "Invented development password",
});

assert.equal(validLogin.success, true);
assert.equal(
  validLogin.data.email,
  "receptionist.dev@example.com",
);

const invalidEmail = staffLoginSchema.safeParse({
  email: "not-an-email",
  password: "Invented development password",
});

assert.equal(invalidEmail.success, false);

const missingPassword = staffLoginSchema.safeParse({
  email: "receptionist.dev@example.com",
  password: "",
});

assert.equal(missingPassword.success, false);

const rejectedMethod = await staffSessionHandler.fetch(
  new Request("http://localhost/api/staff/session", {
    method: "POST",
  }),
);

assert.equal(rejectedMethod.status, 405);
assert.equal(
  rejectedMethod.headers.get("allow"),
  "GET",
);

const missingTokenResponse =
  await staffSessionHandler.fetch(
    new Request(
      "http://localhost/api/staff/session",
      {
        method: "GET",
      },
    ),
  );

assert.equal(missingTokenResponse.status, 401);
assert.equal(
  missingTokenResponse.headers.get(
    "www-authenticate",
  ),
  "Bearer",
);

const invalidSchemeResponse =
  await staffSessionHandler.fetch(
    new Request(
      "http://localhost/api/staff/session",
      {
        headers: {
          Authorization: "Basic invalid-credentials",
        },
        method: "GET",
      },
    ),
  );

assert.equal(invalidSchemeResponse.status, 401);

const userId =
  "00000000-0000-4000-8000-000000000008";

const accessToken =
  "isolated-staff-authentication-test-token";

const databaseProfile = {
  active: true,
  full_name: "Test Receptionist",
  role: "receptionist",
  user_id: userId,
};

const expectedProfile = {
  active: true,
  fullName: "Test Receptionist",
  role: "receptionist",
  userId,
};

const profileQuery = {
  eq(column, value) {
    assert.equal(column, "user_id");
    assert.equal(value, userId);

    return profileQuery;
  },

  async maybeSingle() {
    return {
      data: databaseProfile,
      error: null,
    };
  },

  select(columns) {
    assert.equal(
      columns,
      "user_id, full_name, role, active",
    );

    return profileQuery;
  },
};

const validationAdminClient = {
  auth: {
    async getUser(token) {
      assert.equal(token, accessToken);

      return {
        data: {
          user: {
            email: "receptionist.dev@example.com",
            id: userId,
          },
        },
        error: null,
      };
    },
  },

  from(table) {
    assert.equal(table, "staff_profiles");

    return profileQuery;
  },
};

const authenticatedStaff =
  await requireActiveStaff(
    new Request(
      "http://localhost/api/staff/session",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        method: "GET",
      },
    ),
    [],
    {
      getAdminClientForRequest: () =>
        validationAdminClient,
    },
  );

assert.deepEqual(authenticatedStaff, {
  profile: expectedProfile,
});

assert.equal(
  Object.hasOwn(authenticatedStaff, "accessToken"),
  false,
);

assert.equal(
  Object.hasOwn(authenticatedStaff, "user"),
  false,
);

console.log(
  "Staff authentication validation checks passed.",
);
