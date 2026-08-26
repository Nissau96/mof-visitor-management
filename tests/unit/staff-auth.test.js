import {
  Buffer,
} from "node:buffer";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  requireActiveStaff,
} from "../../api/_lib/staffAuth.js";

const USER_ID =
  "00000000-0000-4000-8000-000000000008";

const ACCESS_TOKEN =
  "isolated-staff-authentication-test-token";

function createJwtWithIssuedAt(
  issuedAt,
) {
  const header = Buffer.from(
    JSON.stringify({
      alg: "none",
      typ: "JWT",
    }),
  ).toString("base64url");

  const payload = Buffer.from(
    JSON.stringify({
      iat: issuedAt,
    }),
  ).toString("base64url");

  return `${header}.${payload}.isolated-signature`;
}

const ACTIVE_RECEPTIONIST = {
  active: true,
  full_name: "Test Receptionist",
  password_change_required: false,
  password_setup_completed_at: null,
  role: "receptionist",
  temporary_password_expires_at: null,
  user_id: USER_ID,
};

function createRequest(
  authorization = `Bearer ${ACCESS_TOKEN}`,
) {
  return new Request(
    "http://localhost/api/staff/session",
    {
      headers: authorization
        ? {
            Authorization: authorization,
          }
        : {},
      method: "GET",
    },
  );
}

function createAdminClient({
  profile = ACTIVE_RECEPTIONIST,
  profileError = null,
  user = {
    id: USER_ID,
  },
  userError = null,
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: profile,
    error: profileError,
  });

  const eq = vi.fn(() => ({
    maybeSingle,
  }));

  const select = vi.fn(() => ({
    eq,
  }));

  const from = vi.fn(() => ({
    select,
  }));

  const getUser = vi.fn().mockResolvedValue({
    data: {
      user,
    },
    error: userError,
  });

  return {
    client: {
      auth: {
        getUser,
      },
      from,
    },
    eq,
    from,
    getUser,
    maybeSingle,
    select,
  };
}

describe("requireActiveStaff", () => {
  it("returns only the approved active staff profile fields", async () => {
    const {
      client,
      eq,
      from,
      getUser,
      select,
    } = createAdminClient();

    const result = await requireActiveStaff(
      createRequest(),
      [],
      {
        getAdminClientForRequest: () => client,
      },
    );

    expect(getUser).toHaveBeenCalledWith(
      ACCESS_TOKEN,
    );

    expect(from).toHaveBeenCalledWith(
      "staff_profiles",
    );

    expect(select).toHaveBeenCalledWith(
      "user_id, full_name, role, active, password_change_required, temporary_password_expires_at, password_setup_completed_at",
    );

    expect(eq).toHaveBeenCalledWith(
      "user_id",
      USER_ID,
    );

    expect(result).toEqual({
      profile: {
        active: true,
        fullName: "Test Receptionist",
        passwordChangeRequired: false,
        passwordSetupCompletedAt: null,
        role: "receptionist",
        temporaryPasswordExpiresAt: null,
        userId: USER_ID,
      },
    });

    expect(result).not.toHaveProperty(
      "accessToken",
    );

    expect(result).not.toHaveProperty("user");
  });

  it("rejects a request without a bearer token", async () => {
    const getAdminClientForRequest = vi.fn();

    await expect(
      requireActiveStaff(
        createRequest(""),
        [],
        {
          getAdminClientForRequest,
        },
      ),
    ).rejects.toMatchObject({
      message:
        "A valid staff session is required.",
      status: 401,
    });

    expect(
      getAdminClientForRequest,
    ).not.toHaveBeenCalled();
  });

  it("rejects an unsupported authorization scheme", async () => {
    await expect(
      requireActiveStaff(
        createRequest("Basic invalid-credentials"),
      ),
    ).rejects.toMatchObject({
      message:
        "A valid staff session is required.",
      status: 401,
    });
  });

  it("rejects an oversized access token", async () => {
    const oversizedToken = "a".repeat(8_193);

    await expect(
      requireActiveStaff(
        createRequest(
          `Bearer ${oversizedToken}`,
        ),
      ),
    ).rejects.toMatchObject({
      message:
        "A valid staff session is required.",
      status: 401,
    });
  });

  it("rejects an invalid or expired Supabase user", async () => {
    const { client } = createAdminClient({
      user: null,
      userError: {
        message: "Invalid token",
      },
    });

    await expect(
      requireActiveStaff(
        createRequest(),
        [],
        {
          getAdminClientForRequest: () => client,
        },
      ),
    ).rejects.toMatchObject({
      message:
        "Your staff session is invalid or has expired.",
      status: 401,
    });
  });

  it("returns a server error when the staff profile query fails", async () => {
    const { client } = createAdminClient({
      profile: null,
      profileError: {
        message: "Database unavailable",
      },
    });

    await expect(
      requireActiveStaff(
        createRequest(),
        [],
        {
          getAdminClientForRequest: () => client,
        },
      ),
    ).rejects.toMatchObject({
      message:
        "The staff session could not be verified.",
      status: 500,
    });
  });

  it.each([
    [
      "missing profile",
      null,
    ],
    [
      "inactive profile",
      {
        ...ACTIVE_RECEPTIONIST,
        active: false,
      },
    ],
    [
      "unsupported profile role",
      {
        ...ACTIVE_RECEPTIONIST,
        role: "auditor",
      },
    ],
  ])(
    "rejects an account with a %s",
    async (_description, profile) => {
      const { client } = createAdminClient({
        profile,
      });

      await expect(
        requireActiveStaff(
          createRequest(),
          [],
          {
            getAdminClientForRequest: () =>
              client,
          },
        ),
      ).rejects.toMatchObject({
        message:
          "This account is not authorised for staff access.",
        status: 403,
      });
    },
  );

  it("rejects a receptionist from an administrator-only operation", async () => {
    const { client } = createAdminClient();

    await expect(
      requireActiveStaff(
        createRequest(),
        ["admin"],
        {
          getAdminClientForRequest: () => client,
        },
      ),
    ).rejects.toMatchObject({
      message:
        "You do not have permission to perform this action.",
      status: 403,
    });
  });

  it("permits an active administrator for an administrator-only operation", async () => {
    const { client } = createAdminClient({
      profile: {
        ...ACTIVE_RECEPTIONIST,
        full_name: "Test Administrator",
        role: "admin",
      },
    });

    const result = await requireActiveStaff(
      createRequest(),
      ["admin"],
      {
        getAdminClientForRequest: () => client,
      },
    );

    expect(result.profile).toEqual({
      active: true,
      fullName: "Test Administrator",
      passwordChangeRequired: false,
      passwordSetupCompletedAt: null,
      role: "admin",
      temporaryPasswordExpiresAt: null,
      userId: USER_ID,
    });
  });

  it("blocks a pending password-change account from normal staff services", async () => {
    const { client } = createAdminClient({
      profile: {
        ...ACTIVE_RECEPTIONIST,
        password_change_required: true,
        temporary_password_expires_at:
          "2099-08-25T14:30:00.000Z",
      },
    });

    await expect(
      requireActiveStaff(
        createRequest(),
        [],
        {
          getAdminClientForRequest: () =>
            client,
        },
      ),
    ).rejects.toMatchObject({
      message:
        "Create your personal password before accessing staff services.",
      status: 403,
    });
  });

  it("allows a pending account only when password setup is explicitly permitted", async () => {
    const expiry =
      "2099-08-25T14:30:00.000Z";

    const { client } = createAdminClient({
      profile: {
        ...ACTIVE_RECEPTIONIST,
        password_change_required: true,
        temporary_password_expires_at:
          expiry,
      },
    });

    const result = await requireActiveStaff(
      createRequest(),
      [],
      {
        allowPasswordChangeRequired:
          true,
        getAdminClientForRequest: () =>
          client,
      },
    );

    expect(result.profile).toEqual({
      active: true,
      fullName: "Test Receptionist",
      passwordChangeRequired: true,
      passwordSetupCompletedAt: null,
      role: "receptionist",
      temporaryPasswordExpiresAt:
        expiry,
      userId: USER_ID,
    });
  });

  it("rejects an expired temporary password even on the setup boundary", async () => {
    const { client } = createAdminClient({
      profile: {
        ...ACTIVE_RECEPTIONIST,
        password_change_required: true,
        temporary_password_expires_at:
          "2020-01-01T00:00:00.000Z",
      },
    });

    await expect(
      requireActiveStaff(
        createRequest(),
        [],
        {
          allowPasswordChangeRequired:
            true,
          getAdminClientForRequest: () =>
            client,
        },
      ),
    ).rejects.toMatchObject({
      message:
        "Your temporary password has expired. Contact an administrator for a new temporary password.",
      status: 403,
    });
  });

  it("rejects malformed pending-password state", async () => {
    const { client } = createAdminClient({
      profile: {
        ...ACTIVE_RECEPTIONIST,
        password_change_required: true,
        temporary_password_expires_at:
          null,
      },
    });

    await expect(
      requireActiveStaff(
        createRequest(),
        [],
        {
          allowPasswordChangeRequired:
            true,
          getAdminClientForRequest: () =>
            client,
        },
      ),
    ).rejects.toMatchObject({
      message:
        "Staff account setup could not be verified.",
      status: 500,
    });
  });

  it("rejects a session issued before password setup completed", async () => {
    const completionTime =
      "2026-08-24T14:30:00.000Z";

    const issuedAt =
      Math.floor(
        Date.parse(completionTime) /
          1_000,
      ) - 1;

    const { client } = createAdminClient({
      profile: {
        ...ACTIVE_RECEPTIONIST,
        password_setup_completed_at:
          completionTime,
      },
    });

    await expect(
      requireActiveStaff(
        createRequest(
          `Bearer ${createJwtWithIssuedAt(
            issuedAt,
          )}`,
        ),
        [],
        {
          getAdminClientForRequest: () =>
            client,
        },
      ),
    ).rejects.toMatchObject({
      message:
        "Sign in again using your new password.",
      status: 401,
    });
  });

  it("accepts a session issued after password setup completed", async () => {
    const completionTime =
      "2026-08-24T14:30:00.000Z";

    const issuedAt =
      Math.floor(
        Date.parse(completionTime) /
          1_000,
      ) + 1;

    const { client } = createAdminClient({
      profile: {
        ...ACTIVE_RECEPTIONIST,
        password_setup_completed_at:
          completionTime,
      },
    });

    const result = await requireActiveStaff(
      createRequest(
        `Bearer ${createJwtWithIssuedAt(
          issuedAt,
        )}`,
      ),
      [],
      {
        getAdminClientForRequest: () =>
          client,
      },
    );

    expect(
      result.profile
        .passwordSetupCompletedAt,
    ).toBe(completionTime);
  });

  it("rejects malformed password-completion state", async () => {
    const { client } = createAdminClient({
      profile: {
        ...ACTIVE_RECEPTIONIST,
        password_setup_completed_at:
          "invalid-date",
      },
    });

    await expect(
      requireActiveStaff(
        createRequest(),
        [],
        {
          getAdminClientForRequest: () =>
            client,
        },
      ),
    ).rejects.toMatchObject({
      message:
        "Staff account setup could not be verified.",
      status: 500,
    });
  });

  it("rejects a non-boolean password-setup option", async () => {
    await expect(
      requireActiveStaff(
        createRequest(),
        [],
        {
          allowPasswordChangeRequired:
            "yes",
        },
      ),
    ).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  it("rejects a non-array allowedRoles argument", async () => {
    await expect(
      requireActiveStaff(
        createRequest(),
        "admin",
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("rejects an unsupported requested role", async () => {
    await expect(
      requireActiveStaff(
        createRequest(),
        ["auditor"],
      ),
    ).rejects.toThrow(
      "An unsupported staff role was requested.",
    );
  });
});