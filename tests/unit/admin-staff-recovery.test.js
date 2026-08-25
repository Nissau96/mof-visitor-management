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
      dependencies
        .createTemporaryPasswordExpiry,
    sendStaffInvitationEmail:
      dependencies.sendStaffInvitationEmail,
  }),
);

import adminHandler from "../../api/admin.js";

const ADMIN_USER_ID =
  "00000000-0000-4000-8000-000000000001";

const TARGET_USER_ID =
  "00000000-0000-4000-8000-000000000002";

const TARGET_EMAIL =
  "pending.staff@example.invalid";

const TEMPORARY_PASSWORD =
  "Temporary!Password42";

const EXPIRY =
  new Date(
    "2026-08-26T14:30:00.000Z",
  );

const TARGET_PROFILE = {
  active: true,
  full_name: "Pending Staff",
  password_change_required: true,
  role: "receptionist",
  user_id: TARGET_USER_ID,
};

const UPDATED_STAFF = {
  active: true,
  email: TARGET_EMAIL,
  fullName: "Pending Staff",
  passwordChangeRequired: true,
  passwordSetupCompletedAt: null,
  role: "receptionist",
  temporaryPasswordExpiresAt:
    EXPIRY.toISOString(),
  userId: TARGET_USER_ID,
};

const PREPARED_DELETION = {
  active: false,
  auditEventId: 71,
  email: TARGET_EMAIL,
  fullName: "Pending Staff",
  role: "receptionist",
  userId: TARGET_USER_ID,
};

function createRequest(
  path,
  body,
) {
  return new Request(
    `http://localhost${path}`,
    {
      body: JSON.stringify(body),
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
  authLookupError = null,
  authUser = {
    email: TARGET_EMAIL,
    id: TARGET_USER_ID,
  },
  deletionError = null,
  passwordData = {
    user: {
      id: TARGET_USER_ID,
    },
  },
  passwordError = null,
  rpcData = UPDATED_STAFF,
  rpcError = null,
  targetProfile = TARGET_PROFILE,
  targetProfileError = null,
} = {}) {
  const maybeSingle =
    vi.fn().mockResolvedValue({
      data: targetProfile,
      error: targetProfileError,
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

  const getUserById =
    vi.fn().mockResolvedValue({
      data: {
        user: authUser,
      },
      error: authLookupError,
    });

  const updateUserById =
    vi.fn().mockResolvedValue({
      data: passwordData,
      error: passwordError,
    });

  const deleteUser =
    vi.fn().mockResolvedValue({
      data: null,
      error: deletionError,
    });

  const rpc =
    vi.fn().mockResolvedValue({
      data: rpcData,
      error: rpcError,
    });

  return {
    client: {
      auth: {
        admin: {
          deleteUser,
          getUserById,
          updateUserById,
        },
      },
      from,
      rpc,
    },
    deleteUser,
    eq,
    from,
    getUserById,
    maybeSingle,
    rpc,
    select,
    updateUserById,
  };
}

async function readResponse(response) {
  return {
    body: await response.json(),
    response,
  };
}

describe(
  "administrator staff onboarding recovery",
  () => {
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

      dependencies
        .createTemporaryPassword
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

    it(
      "reissues a temporary password without returning password material",
      async () => {
        const database =
          createAdminClient();

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        const request = createRequest(
          "/api/admin/staff/reissue-password",
          {
            userId: TARGET_USER_ID,
          },
        );

        const result =
          await readResponse(
            await adminHandler.fetch(
              request,
            ),
          );

        expect(
          result.response.status,
        ).toBe(200);

        expect(result.body).toEqual({
          staff: UPDATED_STAFF,
          temporaryPasswordReissued:
            true,
        });

        expect(
          dependencies
            .requireActiveStaff,
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
            limit: 10,
            scope:
              "admin-staff-password-reissue",
            subject:
              ADMIN_USER_ID,
            windowSeconds:
              60 * 60,
          }),
        );

        expect(
          database.from,
        ).toHaveBeenCalledWith(
          "staff_profiles",
        );

        expect(
          database.select,
        ).toHaveBeenCalledWith(
          "user_id, full_name, role, active, password_change_required",
        );

        expect(
          database.eq,
        ).toHaveBeenCalledWith(
          "user_id",
          TARGET_USER_ID,
        );

        expect(
          database.getUserById,
        ).toHaveBeenCalledWith(
          TARGET_USER_ID,
        );

        expect(
          database.updateUserById,
        ).toHaveBeenCalledWith(
          TARGET_USER_ID,
          {
            password:
              TEMPORARY_PASSWORD,
          },
        );

        expect(
          database.rpc,
        ).toHaveBeenCalledWith(
          "prepare_admin_staff_password_reissue",
          {
            p_actor_id:
              ADMIN_USER_ID,
            p_expires_at:
              EXPIRY.toISOString(),
            p_user_id:
              TARGET_USER_ID,
          },
        );

        expect(
          dependencies
            .sendStaffInvitationEmail,
        ).toHaveBeenCalledWith({
          email: TARGET_EMAIL,
          expiresAt: EXPIRY,
          fullName:
            "Pending Staff",
          messageType: "reissue",
          role: "receptionist",
          temporaryPassword:
            TEMPORARY_PASSWORD,
        });

        expect(
          JSON.stringify(result.body),
        ).not.toContain(
          TEMPORARY_PASSWORD,
        );
      },
    );

    it(
      "rejects an invalid password-reissue request",
      async () => {
        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/reissue-password",
                {
                  userId:
                    "not-a-uuid",
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(400);

        expect(result.body).toEqual({
          error:
            "The password-reissue request is invalid.",
        });

        expect(
          dependencies.getAdminClient,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects self password reissue",
      async () => {
        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/reissue-password",
                {
                  userId:
                    ADMIN_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(409);

        expect(result.body).toEqual({
          error:
            "You cannot reissue your own temporary password.",
        });

        expect(
          dependencies.getAdminClient,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects reissue for an inactive staff account",
      async () => {
        const database =
          createAdminClient({
            targetProfile: {
              ...TARGET_PROFILE,
              active: false,
            },
          });

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/reissue-password",
                {
                  userId:
                    TARGET_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(409);

        expect(
          database.updateUserById,
        ).not.toHaveBeenCalled();

        expect(
          database.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects reissue after password setup is complete",
      async () => {
        const database =
          createAdminClient({
            targetProfile: {
              ...TARGET_PROFILE,
              password_change_required:
                false,
            },
          });

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/reissue-password",
                {
                  userId:
                    TARGET_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(409);

        expect(result.body).toEqual({
          error:
            "A temporary password can be reissued only while password setup is pending.",
        });

        expect(
          database.updateUserById,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "stops when Auth cannot replace the temporary password",
      async () => {
        const database =
          createAdminClient({
            passwordData: {
              user: null,
            },
            passwordError: {
              message:
                "Auth update failed",
            },
          });

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/reissue-password",
                {
                  userId:
                    TARGET_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(502);

        expect(
          database.rpc,
        ).not.toHaveBeenCalled();

        expect(
          dependencies
            .sendStaffInvitationEmail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "reports database failure after Auth replacement without emailing",
      async () => {
        const database =
          createAdminClient({
            rpcData: null,
            rpcError: {
              code: "XX000",
              message:
                "Database unavailable",
            },
          });

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/reissue-password",
                {
                  userId:
                    TARGET_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(500);

        expect(result.body).toEqual({
          error:
            "The temporary password was replaced, but account recovery could not be completed. Reissue the password again.",
        });

        expect(
          dependencies
            .sendStaffInvitationEmail,
        ).not.toHaveBeenCalled();

        expect(
          JSON.stringify(result.body),
        ).not.toContain(
          TEMPORARY_PASSWORD,
        );
      },
    );

    it(
      "reports recovery-email failure without exposing the password",
      async () => {
        const database =
          createAdminClient();

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        dependencies
          .sendStaffInvitationEmail
          .mockRejectedValue(
            new Error(
              "SMTP unavailable",
            ),
          );

        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/reissue-password",
                {
                  userId:
                    TARGET_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(502);

        expect(result.body).toEqual({
          error:
            "A new temporary password was generated, but the recovery email could not be sent. Verify the SMTP configuration and reissue the password again.",
        });

        expect(
          JSON.stringify(result.body),
        ).not.toContain(
          TEMPORARY_PASSWORD,
        );
      },
    );
  },
);

describe(
  "administrator staff deletion",
  () => {
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

      dependencies.getAdminClient
        .mockReturnValue(
          createAdminClient({
            rpcData:
              PREPARED_DELETION,
          }).client,
        );
    });

    it(
      "permanently deletes a confirmed staff account",
      async () => {
        const database =
          createAdminClient({
            rpcData:
              PREPARED_DELETION,
          });

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        const request = createRequest(
          "/api/admin/staff/delete",
          {
            confirmationEmail:
              "PENDING.STAFF@example.invalid",
            userId: TARGET_USER_ID,
          },
        );

        const result =
          await readResponse(
            await adminHandler.fetch(
              request,
            ),
          );

        expect(
          result.response.status,
        ).toBe(200);

        expect(result.body).toEqual({
          accountDeleted: true,
          staff: {
            email: TARGET_EMAIL,
            fullName:
              "Pending Staff",
            role: "receptionist",
            userId:
              TARGET_USER_ID,
          },
        });

        expect(
          dependencies.enforceRateLimit,
        ).toHaveBeenCalledWith(
          request,
          expect.objectContaining({
            keyMode: "subject",
            limit: 10,
            scope:
              "admin-staff-delete",
            subject:
              ADMIN_USER_ID,
            windowSeconds:
              60 * 60,
          }),
        );

        expect(
          database.rpc,
        ).toHaveBeenCalledWith(
          "prepare_admin_staff_deletion",
          {
            p_actor_id:
              ADMIN_USER_ID,
            p_user_id:
              TARGET_USER_ID,
          },
        );

        expect(
          database.deleteUser,
        ).toHaveBeenCalledWith(
          TARGET_USER_ID,
        );
      },
    );

    it(
      "rejects a mismatched confirmation email",
      async () => {
        const database =
          createAdminClient({
            rpcData:
              PREPARED_DELETION,
          });

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/delete",
                {
                  confirmationEmail:
                    "different@example.invalid",
                  userId:
                    TARGET_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(400);

        expect(result.body).toEqual({
          error:
            "The confirmation email does not match the selected staff account.",
        });

        expect(
          database.rpc,
        ).not.toHaveBeenCalled();

        expect(
          database.deleteUser,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects administrator self-deletion",
      async () => {
        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/delete",
                {
                  confirmationEmail:
                    "administrator@example.invalid",
                  userId:
                    ADMIN_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(409);

        expect(result.body).toEqual({
          error:
            "You cannot delete your own staff account.",
        });

        expect(
          dependencies.getAdminClient,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not delete when database preparation rejects the change",
      async () => {
        const database =
          createAdminClient({
            rpcData: null,
            rpcError: {
              code: "55000",
              message:
                "The last active administrator cannot be deleted.",
            },
          });

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/delete",
                {
                  confirmationEmail:
                    TARGET_EMAIL,
                  userId:
                    TARGET_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(409);

        expect(result.body).toEqual({
          error:
            "The last active administrator cannot be deleted.",
        });

        expect(
          database.deleteUser,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "reports Auth deletion failure after the account is disabled",
      async () => {
        const database =
          createAdminClient({
            deletionError: {
              message:
                "Auth deletion failed",
            },
            rpcData:
              PREPARED_DELETION,
          });

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/delete",
                {
                  confirmationEmail:
                    TARGET_EMAIL,
                  userId:
                    TARGET_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(502);

        expect(result.body).toEqual({
          error:
            "The staff account was disabled, but permanent deletion could not be completed. Retry deletion.",
        });

        expect(
          database.deleteUser,
        ).toHaveBeenCalledWith(
          TARGET_USER_ID,
        );
      },
    );

    it(
      "returns not found when the staff profile is missing",
      async () => {
        const database =
          createAdminClient({
            rpcData:
              PREPARED_DELETION,
            targetProfile: null,
          });

        dependencies.getAdminClient
          .mockReturnValue(
            database.client,
          );

        const result =
          await readResponse(
            await adminHandler.fetch(
              createRequest(
                "/api/admin/staff/delete",
                {
                  confirmationEmail:
                    TARGET_EMAIL,
                  userId:
                    TARGET_USER_ID,
                },
              ),
            ),
          );

        expect(
          result.response.status,
        ).toBe(404);

        expect(
          database.getUserById,
        ).not.toHaveBeenCalled();

        expect(
          database.deleteUser,
        ).not.toHaveBeenCalled();
      },
    );
  },
);