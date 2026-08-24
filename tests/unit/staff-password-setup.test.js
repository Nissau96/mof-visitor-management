import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  HttpError,
} from "../../api/_lib/http.js";
import {
  createStaffSessionHandler,
} from "../../api/staff/session.js";

const USER_ID =
  "00000000-0000-4000-8000-000000000008";

const VALID_PASSWORD =
  "NewPersonalPassword!2026";

function createRequest({
  body = {
    confirmPassword:
      VALID_PASSWORD,
    password:
      VALID_PASSWORD,
  },
  method = "PUT",
} = {}) {
  return new Request(
    "http://localhost/api/staff/session",
    {
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
      headers: {
        Authorization:
          "Bearer isolated-access-token",
        "Content-Type":
          "application/json",
      },
      method,
    },
  );
}

function createTestHandler({
  completionData = {
    passwordChangeRequired: false,
    passwordSetupCompletedAt:
      "2026-08-24T14:30:00.000Z",
  },
  completionError = null,
  passwordData = {
    user: {
      id: USER_ID,
    },
  },
  passwordError = null,
  profile = {
    active: true,
    fullName: "Test Receptionist",
    passwordChangeRequired: true,
    passwordSetupCompletedAt: null,
    role: "receptionist",
    temporaryPasswordExpiresAt:
      "2026-08-25T14:30:00.000Z",
    userId: USER_ID,
  },
  requireError = null,
} = {}) {
  const updateUserById =
    vi.fn().mockResolvedValue({
      data: passwordData,
      error: passwordError,
    });

  const rpc =
    vi.fn().mockResolvedValue({
      data: completionData,
      error: completionError,
    });

  const adminClient = {
    auth: {
      admin: {
        updateUserById,
      },
    },
    rpc,
  };

  const getAdminClientForRequest =
    vi.fn(() => adminClient);

  const requireActiveStaffForRequest =
    requireError
      ? vi.fn().mockRejectedValue(
          requireError,
        )
      : vi.fn().mockResolvedValue({
          profile,
        });

  const handler =
    createStaffSessionHandler({
      getAdminClientForRequest,
      requireActiveStaffForRequest,
    });

  return {
    getAdminClientForRequest,
    handler,
    requireActiveStaffForRequest,
    rpc,
    updateUserById,
  };
}

async function readResponse(response) {
  return {
    body: await response.json(),
    response,
  };
}

describe("staff temporary-password setup", () => {
  it("changes the password and completes account setup", async () => {
    const {
      getAdminClientForRequest,
      handler,
      requireActiveStaffForRequest,
      rpc,
      updateUserById,
    } = createTestHandler();

    const request = createRequest();

    const result = await readResponse(
      await handler.fetch(request),
    );

    expect(result.response.status).toBe(
      200,
    );

    expect(result.body).toEqual({
      passwordChanged: true,
      requiresSignIn: true,
    });

    expect(
      requireActiveStaffForRequest,
    ).toHaveBeenCalledWith(
      request,
      [],
      {
        allowPasswordChangeRequired:
          true,
        getAdminClientForRequest,
      },
    );

    expect(
      updateUserById,
    ).toHaveBeenCalledWith(
      USER_ID,
      {
        password:
          VALID_PASSWORD,
      },
    );

    expect(rpc).toHaveBeenCalledWith(
      "complete_staff_password_setup",
      {
        p_actor_id: USER_ID,
      },
    );
  });

  it("rejects an invalid new password before updating the account", async () => {
    const {
      getAdminClientForRequest,
      handler,
      rpc,
      updateUserById,
    } = createTestHandler();

    const result = await readResponse(
      await handler.fetch(
        createRequest({
          body: {
            confirmPassword:
              "weak-password",
            password:
              "weak-password",
          },
        }),
      ),
    );

    expect(result.response.status).toBe(
      400,
    );

    expect(result.body).toEqual({
      error:
        "Check the new password and try again.",
    });

    expect(
      getAdminClientForRequest,
    ).not.toHaveBeenCalled();

    expect(
      updateUserById,
    ).not.toHaveBeenCalled();

    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects mismatched password confirmation", async () => {
    const {
      handler,
      rpc,
      updateUserById,
    } = createTestHandler();

    const result = await readResponse(
      await handler.fetch(
        createRequest({
          body: {
            confirmPassword:
              "DifferentPassword!2026",
            password:
              VALID_PASSWORD,
          },
        }),
      ),
    );

    expect(result.response.status).toBe(
      400,
    );

    expect(
      updateUserById,
    ).not.toHaveBeenCalled();

    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects setup for an account that has already completed it", async () => {
    const {
      getAdminClientForRequest,
      handler,
      rpc,
      updateUserById,
    } = createTestHandler({
      profile: {
        active: true,
        fullName:
          "Test Receptionist",
        passwordChangeRequired:
          false,
        passwordSetupCompletedAt:
          "2026-08-24T14:00:00.000Z",
        role: "receptionist",
        temporaryPasswordExpiresAt:
          null,
        userId: USER_ID,
      },
    });

    const result = await readResponse(
      await handler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      409,
    );

    expect(result.body).toEqual({
      error:
        "Password setup has already been completed.",
    });

    expect(
      getAdminClientForRequest,
    ).not.toHaveBeenCalled();

    expect(
      updateUserById,
    ).not.toHaveBeenCalled();

    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a gateway error when the Supabase password update fails", async () => {
    const {
      handler,
      rpc,
      updateUserById,
    } = createTestHandler({
      passwordData: {
        user: null,
      },
      passwordError: {
        message:
          "Invented password update failure",
      },
    });

    const result = await readResponse(
      await handler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      502,
    );

    expect(result.body).toEqual({
      error:
        "Your password could not be changed. Please try again.",
    });

    expect(
      updateUserById,
    ).toHaveBeenCalledOnce();

    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an unexpected user returned by the password update", async () => {
    const {
      handler,
      rpc,
    } = createTestHandler({
      passwordData: {
        user: {
          id:
            "00000000-0000-4000-8000-000000000009",
        },
      },
    });

    const result = await readResponse(
      await handler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      502,
    );

    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    {
      completionError: {
        code: "55000",
        message:
          "Temporary password expired",
      },
      expectedMessage:
        "Your temporary password has expired. Contact an administrator for a new temporary password.",
      expectedStatus: 403,
    },
    {
      completionError: {
        code: "55000",
        message:
          "Password setup is not pending",
      },
      expectedMessage:
        "Password setup has already been completed.",
      expectedStatus: 409,
    },
    {
      completionError: {
        code: "42501",
        message:
          "Not authorised",
      },
      expectedMessage:
        "This account is not authorised for staff access.",
      expectedStatus: 403,
    },
    {
      completionError: {
        code: "P0002",
        message:
          "Profile not found",
      },
      expectedMessage:
        "The staff profile could not be found.",
      expectedStatus: 404,
    },
    {
      completionError: {
        code: "XX000",
        message:
          "Invented database failure",
      },
      expectedMessage:
        "Your password was changed, but account setup could not be completed. Contact an administrator before trying again.",
      expectedStatus: 500,
    },
  ])(
    "maps completion error $completionError.code to status $expectedStatus",
    async ({
      completionError,
      expectedMessage,
      expectedStatus,
    }) => {
      const {
        handler,
      } = createTestHandler({
        completionError,
      });

      const result =
        await readResponse(
          await handler.fetch(
            createRequest(),
          ),
        );

      expect(
        result.response.status,
      ).toBe(expectedStatus);

      expect(result.body).toEqual({
        error: expectedMessage,
      });
    },
  );

  it("rejects an invalid completion response", async () => {
    const {
      handler,
    } = createTestHandler({
      completionData: {
        passwordChangeRequired:
          true,
        passwordSetupCompletedAt:
          null,
      },
    });

    const result = await readResponse(
      await handler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      500,
    );

    expect(result.body).toEqual({
      error:
        "Your password was changed, but account setup could not be completed. Contact an administrator before trying again.",
    });
  });

  it("preserves authentication errors and bearer challenge headers", async () => {
    const {
      getAdminClientForRequest,
      handler,
    } = createTestHandler({
      requireError: new HttpError(
        "Your staff session is invalid or has expired.",
        401,
      ),
    });

    const result = await readResponse(
      await handler.fetch(
        createRequest(),
      ),
    );

    expect(result.response.status).toBe(
      401,
    );

    expect(
      result.response.headers.get(
        "www-authenticate",
      ),
    ).toBe("Bearer");

    expect(result.body).toEqual({
      error:
        "Your staff session is invalid or has expired.",
    });

    expect(
      getAdminClientForRequest,
    ).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods without authenticating", async () => {
    const {
      handler,
      requireActiveStaffForRequest,
    } = createTestHandler();

    const response =
      await handler.fetch(
        new Request(
          "http://localhost/api/staff/session",
          {
            method: "DELETE",
          },
        ),
      );

    expect(response.status).toBe(405);

    expect(
      response.headers.get("allow"),
    ).toBe("GET, POST, PUT");

    expect(
      requireActiveStaffForRequest,
    ).not.toHaveBeenCalled();
  });
});
