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

const ACTIVE_RECEPTIONIST = {
  active: true,
  full_name: "Test Receptionist",
  role: "receptionist",
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
      "user_id, full_name, role, active",
    );

    expect(eq).toHaveBeenCalledWith(
      "user_id",
      USER_ID,
    );

    expect(result).toEqual({
      profile: {
        active: true,
        fullName: "Test Receptionist",
        role: "receptionist",
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
      role: "admin",
      userId: USER_ID,
    });
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