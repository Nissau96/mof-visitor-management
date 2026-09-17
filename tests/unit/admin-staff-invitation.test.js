import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dependencies = vi.hoisted(() => ({
  createTemporaryPassword:
    vi.fn(),
  createTemporaryPasswordExpiry:
    vi.fn(),
  enforceRateLimit:
    vi.fn(),
  getAdminClient:
    vi.fn(),
  requireActiveStaff:
    vi.fn(),
  sendStaffInvitationEmail:
    vi.fn(),
}));

vi.mock(
  "../../api/_lib/staffAuth.js",
  async (importOriginal) => {
    const original =
      await importOriginal();

    return {
      ...original,
      requireActiveStaff:
        dependencies.requireActiveStaff,
    };
  },
);

vi.mock(
  "../../api/_lib/rateLimit.js",
  async (importOriginal) => {
    const original =
      await importOriginal();

    return {
      ...original,
      enforceRateLimit:
        dependencies.enforceRateLimit,
    };
  },
);

vi.mock(
  "../../api/_lib/supabase.js",
  () => ({
    getAdminClient:
      dependencies.getAdminClient,
  }),
);

vi.mock(
  "../../src/server/staffInvitation.js",
  () => ({
    createTemporaryPassword:
      dependencies.createTemporaryPassword,
    createTemporaryPasswordExpiry:
      dependencies.createTemporaryPasswordExpiry,
    sendStaffInvitationEmail:
      dependencies.sendStaffInvitationEmail,
  }),
);

import adminHandler from "../../api/admin.js";

const ADMIN_USER_ID =
  "00000000-0000-4000-8000-000000000001";

const CREATED_USER_ID =
  "00000000-0000-4000-8000-000000000002";

const TEMPORARY_PASSWORD =
  "Temporary!Password42";

const EXPIRY =
  new Date(
    "2026-08-25T14:30:00.000Z",
  );

const STAFF_PROFILE = {
  active: true,
  email:
    "invited.user@example.invalid",
  fullName: "Invited User",
  role: "receptionist",
  userId: CREATED_USER_ID,
};

function createRequest() {
  return new Request(
    "http://localhost/api/admin/staff/invite",
    {
      body: JSON.stringify({
        email:
          "INVITED.USER@example.invalid",
        fullName:
          "Invited User",
        role: "receptionist",
      }),
      headers: {
        Authorization:
          "Bearer isolated-admin-token",
        "Content-Type":
          "application/json",
      },
      method: "POST",
    },
  );
}

function createAdminClient({
  accountData = {
    user: {
      id: CREATED_USER_ID,
    },
  },
  accountError = null,
  configurationData = {
    user_id: CREATED_USER_ID,
  },
  configurationError = null,
  deleteError = null,
  profileData = STAFF_PROFILE,
  profileError = null,
} = {}) {
  const createUser =
    vi.fn().mockResolvedValue({
      data: accountData,
      error: accountError,
    });

  const deleteUser =
    vi.fn().mockResolvedValue({
      data: null,
      error: deleteError,
    });

  const rpc =
    vi.fn().mockResolvedValue({
      data: profileData,
      error: profileError,
    });

  const maybeSingle =
    vi.fn().mockResolvedValue({
      data: configurationData,
      error: configurationError,
    });

  const select = vi.fn(() => ({
    maybeSingle,
  }));

  const eq = vi.fn(() => ({
    select,
  }));

  const update = vi.fn(() => ({
    eq,
  }));

  const from = vi.fn(() => ({
    update,
  }));

  return {
    client: {
      auth: {
        admin: {
          createUser,
          deleteUser,
        },
      },
      from,
      rpc,
    },
    createUser,
    deleteUser,
    eq,
    from,
    maybeSingle,
    rpc,
    select,
    update,
  };
}

async function readResponse(response) {
  return {
    body: await response.json(),
    response,
  };
}

describe("administrator staff invitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    dependencies.requireActiveStaff
      .mockResolvedValue({
        profile: {
          fullName:
            "Test Administrator",
          role: "admin",
          userId:
            ADMIN_USER_ID,
        },
      });

    dependencies.enforceRateLimit
      .mockResolvedValue(undefined);

    dependencies.createTemporaryPassword
      .mockReturnValue(
        TEMPORARY_PASSWORD,
      );

    dependencies
      .createTemporaryPasswordExpiry
      .mockReturnValue(EXPIRY);

    dependencies
      .sendStaffInvitationEmail
      .mockResolvedValue(undefined);
  });

  it("creates, protects and emails a new staff account", async () => {
    const database =
      createAdminClient();

    dependencies.getAdminClient
      .mockReturnValue(
        database.client,
      );

    const request = createRequest();

    const result = await readResponse(
      await adminHandler.fetch(request),
    );

    expect(result.response.status).toBe(
      201,
    );

    expect(result.body).toEqual({
      invitationSent: true,
      staff: STAFF_PROFILE,
    });

    expect(
      dependencies.requireActiveStaff,
    ).toHaveBeenCalledWith(
      request,
      ["admin"],
    );

    expect(
      dependencies.enforceRateLimit,
    ).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        keyMode: "subject",
        limit: 20,
        scope:
          "admin-staff-invite",
        subject:
          ADMIN_USER_ID,
        windowSeconds:
          60 * 60,
      }),
    );

    expect(
      database.createUser,
    ).toHaveBeenCalledWith({
      email:
        "invited.user@example.invalid",
      email_confirm: true,
      password:
        TEMPORARY_PASSWORD,
      user_metadata: {
        full_name:
          "Invited User",
      },
    });

    expect(database.rpc).toHaveBeenCalledWith(
      "create_invited_staff_profile",
      {
        p_actor_id:
          ADMIN_USER_ID,
        p_full_name:
          "Invited User",
        p_role:
          "receptionist",
        p_user_id:
          CREATED_USER_ID,
      },
    );

    expect(database.from).toHaveBeenCalledWith(
      "staff_profiles",
    );

    expect(database.update).toHaveBeenCalledWith({
      password_change_required:
        true,
      password_setup_completed_at:
        null,
      temporary_password_expires_at:
        EXPIRY.toISOString(),
    });

    expect(database.eq).toHaveBeenCalledWith(
      "user_id",
      CREATED_USER_ID,
    );

    expect(database.select).toHaveBeenCalledWith(
      "user_id",
    );

    expect(
      dependencies.sendStaffInvitationEmail,
    ).toHaveBeenCalledWith({
      email:
        "invited.user@example.invalid",
      expiresAt: EXPIRY,
      fullName:
        "Invited User",
      role: "receptionist",
      temporaryPassword:
        TEMPORARY_PASSWORD,
    });

    expect(
      database.deleteUser,
    ).not.toHaveBeenCalled();

    expect(
      JSON.stringify(result.body),
    ).not.toContain(
      TEMPORARY_PASSWORD,
    );
  });

  it("returns a conflict without rollback when the auth user already exists", async () => {
    const database =
      createAdminClient({
        accountData: {
          user: null,
        },
        accountError: {
          code: "email_exists",
          message:
            "User already exists",
        },
      });

    dependencies.getAdminClient
      .mockReturnValue(
        database.client,
      );

    const result = await readResponse(
      await adminHandler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      409,
    );

    expect(result.body).toEqual({
      error:
        "A user with this email address already exists.",
    });

    expect(
      database.deleteUser,
    ).not.toHaveBeenCalled();

    expect(database.rpc).not.toHaveBeenCalled();

    expect(
      dependencies.sendStaffInvitationEmail,
    ).not.toHaveBeenCalled();
  });

  it("rolls back the auth account when staff authorisation fails", async () => {
    const database =
      createAdminClient({
        profileData: null,
        profileError: {
          code: "23505",
          message:
            "Duplicate staff profile",
        },
      });

    dependencies.getAdminClient
      .mockReturnValue(
        database.client,
      );

    const result = await readResponse(
      await adminHandler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      409,
    );

    expect(
      database.deleteUser,
    ).toHaveBeenCalledWith(
      CREATED_USER_ID,
    );

    expect(database.from).not.toHaveBeenCalled();

    expect(
      dependencies.sendStaffInvitationEmail,
    ).not.toHaveBeenCalled();
  });

  it("rolls back a malformed staff-profile response before sending email", async () => {
    const database =
      createAdminClient({
        profileData: {
          ...STAFF_PROFILE,
          userId:
            "00000000-0000-4000-8000-000000000009",
        },
      });

    dependencies.getAdminClient
      .mockReturnValue(
        database.client,
      );

    const result = await readResponse(
      await adminHandler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      500,
    );

    expect(result.body).toEqual({
      error:
        "The staff account was created, but the response could not be verified.",
    });

    expect(
      database.deleteUser,
    ).toHaveBeenCalledWith(
      CREATED_USER_ID,
    );

    expect(database.from).not.toHaveBeenCalled();

    expect(
      dependencies.sendStaffInvitationEmail,
    ).not.toHaveBeenCalled();
  });

  it("rolls back when temporary-password protection cannot be configured", async () => {
    const database =
      createAdminClient({
        configurationData: null,
        configurationError: {
          message:
            "Invented profile update failure",
        },
      });

    dependencies.getAdminClient
      .mockReturnValue(
        database.client,
      );

    const result = await readResponse(
      await adminHandler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      500,
    );

    expect(result.body).toEqual({
      error:
        "Temporary-password protection could not be configured. Please try again.",
    });

    expect(
      database.deleteUser,
    ).toHaveBeenCalledWith(
      CREATED_USER_ID,
    );

    expect(
      dependencies.sendStaffInvitationEmail,
    ).not.toHaveBeenCalled();
  });

  it("rolls back when the onboarding email cannot be delivered", async () => {
    const database =
      createAdminClient();

    dependencies.getAdminClient
      .mockReturnValue(
        database.client,
      );

    dependencies
      .sendStaffInvitationEmail
      .mockRejectedValueOnce(
        new Error(
          "Invented SMTP failure",
        ),
      );

    const result = await readResponse(
      await adminHandler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      502,
    );

    expect(result.body).toEqual({
      error:
        "The onboarding email could not be sent. Please verify the SMTP configuration and try again.",
    });

    expect(
      database.deleteUser,
    ).toHaveBeenCalledWith(
      CREATED_USER_ID,
    );
  });

  it("reports manual cleanup when rollback itself fails", async () => {
    const database =
      createAdminClient({
        deleteError: {
          message:
            "Invented deletion failure",
        },
      });

    dependencies.getAdminClient
      .mockReturnValue(
        database.client,
      );

    dependencies
      .sendStaffInvitationEmail
      .mockRejectedValueOnce(
        new Error(
          "Invented SMTP failure",
        ),
      );

    const result = await readResponse(
      await adminHandler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      500,
    );

    expect(result.body).toEqual({
      error:
        "The staff account was created, but the onboarding email could not be sent. Remove the account in Supabase before retrying.",
    });

    expect(
      database.deleteUser,
    ).toHaveBeenCalledWith(
      CREATED_USER_ID,
    );
  });
});
