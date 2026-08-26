import { requireActiveStaff } from "./_lib/staffAuth.js";
import {
  RateLimitExceededError,
  enforceRateLimit,
} from "./_lib/rateLimit.js";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "./_lib/http.js";
import { getAdminClient } from "./_lib/supabase.js";
import {
  adminHostListSchema,
  adminHostSaveSchema,
  adminStaffDeleteSchema,
  adminStaffInviteSchema,
  adminStaffListSchema,
  adminStaffPasswordReissueSchema,
  adminStaffUpdateSchema,
} from "../src/validation/adminManagement.js";
import {
  createTemporaryPassword,
  createTemporaryPasswordExpiry,
  sendStaffInvitationEmail,
} from "../src/server/staffInvitation.js";

const OPERATION_BY_PATH = new Map([
  ["/api/admin/hosts/list", "host-list"],
  ["/api/admin/hosts/save", "host-save"],
  ["/api/admin/staff/delete", "staff-delete"],
  ["/api/admin/staff/invite", "staff-invite"],
  ["/api/admin/staff/list", "staff-list"],
  ["/api/admin/staff/reissue-password", "staff-password-reissue"],
  ["/api/admin/staff/update", "staff-update"],
]);

const UNEXPECTED_ERROR_MESSAGES = {
  "host-list":
    "Host records could not be loaded. Please try again.",
  "host-save":
    "The host record could not be saved. Please try again.",
  "staff-delete":
    "The staff account could not be deleted. Please try again.",
  "staff-invite":
    "The staff invitation could not be completed. Please try again.",
  "staff-list":
    "Staff records could not be loaded. Please try again.",
  "staff-password-reissue":
    "The temporary password could not be reissued. Please try again.",
  "staff-update":
    "The staff profile could not be updated. Please try again.",
};

export const ADMIN_WRITE_RATE_LIMITS =
  Object.freeze({
    "host-save": Object.freeze({
      limit: 60,
      scope: "admin-host-save",
      windowSeconds: 10 * 60,
    }),

    "staff-delete": Object.freeze({
      limit: 10,
      scope: "admin-staff-delete",
      windowSeconds: 60 * 60,
    }),

    "staff-invite": Object.freeze({
      limit: 20,
      scope: "admin-staff-invite",
      windowSeconds: 60 * 60,
    }),

    "staff-password-reissue": Object.freeze({
      limit: 10,
      scope: "admin-staff-password-reissue",
      windowSeconds: 60 * 60,
    }),

    "staff-update": Object.freeze({
      limit: 30,
      scope: "admin-staff-update",
      windowSeconds: 10 * 60,
    }),
  });

export async function enforceAdminWriteRateLimit(
  request,
  operation,
  userId,
  enforceRateLimitForRequest = enforceRateLimit,
) {
  const configuration =
    ADMIN_WRITE_RATE_LIMITS[operation];

  if (!configuration) {
    return;
  }

  await enforceRateLimitForRequest(
    request,
    {
      ...configuration,
      keyMode: "subject",
      subject: userId,
    },
  );
}

function getOperation(request) {
  const url = new URL(request.url);

  const configuredOperation =
    url.searchParams.get("operation") || "";

  if (configuredOperation) {
    return configuredOperation;
  }

  const pathname =
    url.pathname.length > 1
      ? url.pathname.replace(/\/+$/, "")
      : url.pathname;

  return OPERATION_BY_PATH.get(pathname) || "";
}

function getHostDatabaseError(error) {
  if (error?.code === "P0002") {
    return new HttpError(
      "The host record could not be found.",
      404,
    );
  }

  if (error?.code === "42501") {
    return new HttpError(
      "Administrator access is required.",
      403,
    );
  }

  if (
    error?.code === "22023" ||
    error?.code === "23514"
  ) {
    return new HttpError(
      "The host information is invalid.",
      400,
    );
  }

  return new HttpError(
    "The host record could not be saved. Please try again.",
    500,
  );
}

function getStaffDatabaseError(error) {
  if (error?.code === "P0002") {
    return new HttpError(
      "The staff profile could not be found.",
      404,
    );
  }

  if (error?.code === "42501") {
    return new HttpError(
      "Administrator access is required.",
      403,
    );
  }

  if (error?.code === "55000") {
    return new HttpError(
      error.message ||
        "This staff-account change is not permitted.",
      409,
    );
  }

  if (
    error?.code === "22023" ||
    error?.code === "23514"
  ) {
    return new HttpError(
      "The staff information is invalid.",
      400,
    );
  }

  return new HttpError(
    "The staff profile could not be updated. Please try again.",
    500,
  );
}

function getProfileDatabaseError(error) {
  if (error?.code === "23505") {
    return new HttpError(
      "A staff profile already exists for this account.",
      409,
    );
  }

  if (error?.code === "42501") {
    return new HttpError(
      "Administrator access is required.",
      403,
    );
  }

  if (
    error?.code === "22023" ||
    error?.code === "23514"
  ) {
    return new HttpError(
      "The staff invitation is invalid.",
      400,
    );
  }

  return new HttpError(
    "The staff invitation could not be completed. Please try again.",
    500,
  );
}

function isExistingUserError(error) {
  return (
    error?.code === "email_exists" ||
    error?.code === "user_already_exists" ||
    /already.+(registered|exists)/i.test(
      error?.message || "",
    )
  );
}

async function rollbackCreatedStaffAccount(
  adminClient,
  userId,
  failureMessage,
) {
  const { error } =
    await adminClient.auth.admin
      .deleteUser(userId);

  if (error) {
    throw new HttpError(
      failureMessage,
      500,
    );
  }
}

async function getStaffAccountTarget(
  adminClient,
  userId,
) {
  const {
    data: staffProfile,
    error: profileError,
  } = await adminClient
    .from("staff_profiles")
    .select(
      "user_id, full_name, role, active, password_change_required",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    throw new HttpError(
      "The staff account could not be verified. Please try again.",
      500,
    );
  }

  if (
    !staffProfile?.user_id ||
    !staffProfile?.full_name ||
    !staffProfile?.role
  ) {
    throw new HttpError(
      "The staff profile could not be found.",
      404,
    );
  }

  const {
    data: accountData,
    error: accountError,
  } = await adminClient.auth.admin
    .getUserById(userId);

  const email = String(
    accountData?.user?.email || "",
  )
    .trim()
    .toLowerCase();

  if (
    accountError ||
    accountData?.user?.id !== userId ||
    !email
  ) {
    throw new HttpError(
      "The staff Auth account could not be verified. Please try again.",
      500,
    );
  }

  return {
    active:
      staffProfile.active === true,
    email,
    fullName:
      staffProfile.full_name,
    passwordChangeRequired:
      staffProfile
        .password_change_required ===
      true,
    role: staffProfile.role,
    userId: staffProfile.user_id,
  };
}

async function handleHostList(request) {
  await requireActiveStaff(request, ["admin"]);

  const body = await readJsonBody(request);

  const parsed =
    adminHostListSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(
      "The host-list request is invalid.",
      400,
    );
  }

  const { data, error } =
    await getAdminClient().rpc(
      "get_admin_hosts",
      {
        p_active: parsed.data.status,
        p_page: parsed.data.page,
        p_page_size: parsed.data.pageSize,
        p_search: parsed.data.search,
      },
    );

  if (error) {
    if (error.code === "22023") {
      throw new HttpError(
        "The host-list filters are invalid.",
        400,
      );
    }

    throw new HttpError(
      "Host records could not be loaded. Please try again.",
      500,
    );
  }

  return json(
    {
      hosts: Array.isArray(data?.hosts)
        ? data.hosts
        : [],
      pagination: data?.pagination || {
        page: 1,
        pageSize: 10,
        totalCount: 0,
        totalPages: 0,
      },
    },
    200,
  );
}

async function handleHostSave(request) {
  const { profile } =
    await requireActiveStaff(
      request,
      ["admin"],
    );

    await enforceAdminWriteRateLimit(
    request,
    "host-save",
    profile.userId,
  );

  const body = await readJsonBody(request);

  const parsed =
    adminHostSaveSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(
      "The host information is invalid.",
      400,
    );
  }

  const { data, error } =
    await getAdminClient().rpc(
      "save_admin_host",
      {
        p_active: parsed.data.active,
        p_actor_id: profile.userId,
        p_department:
          parsed.data.department,
        p_full_name: parsed.data.fullName,
        p_host_id: parsed.data.hostId,
      },
    );

  if (error) {
    throw getHostDatabaseError(error);
  }

  if (
    !data?.hostId ||
    !data?.fullName ||
    !data?.department
  ) {
    throw new HttpError(
      "The host record could not be saved. Please try again.",
      500,
    );
  }

  return json(
    {
      host: data,
    },
    parsed.data.hostId ? 200 : 201,
  );
}

async function handleStaffList(request) {
  await requireActiveStaff(request, ["admin"]);

  const body = await readJsonBody(request);

  const parsed =
    adminStaffListSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(
      "The staff-list request is invalid.",
      400,
    );
  }

  const { data, error } =
    await getAdminClient().rpc(
      "get_admin_staff",
      {
        p_active: parsed.data.status,
        p_page: parsed.data.page,
        p_page_size: parsed.data.pageSize,
        p_role: parsed.data.role,
        p_search: parsed.data.search,
      },
    );

  if (error) {
    if (error.code === "22023") {
      throw new HttpError(
        "The staff-list filters are invalid.",
        400,
      );
    }

    throw new HttpError(
      "Staff records could not be loaded. Please try again.",
      500,
    );
  }

  return json(
    {
      pagination: data?.pagination || {
        page: 1,
        pageSize: 10,
        totalCount: 0,
        totalPages: 0,
      },
      staff: Array.isArray(data?.staff)
        ? data.staff
        : [],
    },
    200,
  );
}

async function handleStaffInvite(request) {
  const { profile } =
    await requireActiveStaff(
      request,
      ["admin"],
    );

  await enforceAdminWriteRateLimit(
    request,
    "staff-invite",
    profile.userId,
  );

  const body =
    await readJsonBody(request);

  const parsed =
    adminStaffInviteSchema.safeParse(
      body,
    );

  if (!parsed.success) {
    throw new HttpError(
      "The staff invitation is invalid.",
      400,
    );
  }

  const adminClient =
    getAdminClient();

  const temporaryPassword =
    createTemporaryPassword();

  const temporaryPasswordExpiresAt =
    createTemporaryPasswordExpiry();

  const {
    data: accountData,
    error: accountError,
  } =
    await adminClient.auth.admin
      .createUser({
        email: parsed.data.email,
        email_confirm: true,
        password: temporaryPassword,
        user_metadata: {
          full_name:
            parsed.data.fullName,
        },
      });

  if (
    accountError ||
    !accountData?.user?.id
  ) {
    if (
      isExistingUserError(
        accountError,
      )
    ) {
      throw new HttpError(
        "A user with this email address already exists.",
        409,
      );
    }

    throw new HttpError(
      "The staff account could not be created. Please try again.",
      502,
    );
  }

  const createdUserId =
    accountData.user.id;

  const {
    data: staffProfile,
    error: profileError,
  } = await adminClient.rpc(
    "create_invited_staff_profile",
    {
      p_actor_id: profile.userId,
      p_full_name:
        parsed.data.fullName,
      p_role: parsed.data.role,
      p_user_id: createdUserId,
    },
  );

  if (profileError) {
    await rollbackCreatedStaffAccount(
      adminClient,
      createdUserId,
      "The staff account was created, but staff authorisation could not be completed. Remove the account in Supabase before retrying.",
    );

    throw getProfileDatabaseError(
      profileError,
    );
  }

  if (
    staffProfile?.userId !==
      createdUserId ||
    !staffProfile?.email ||
    !staffProfile?.fullName ||
    !staffProfile?.role
  ) {
    await rollbackCreatedStaffAccount(
      adminClient,
      createdUserId,
      "The staff account was created, but the staff-profile response could not be verified. Remove the account in Supabase before retrying.",
    );

    throw new HttpError(
      "The staff account was created, but the response could not be verified.",
      500,
    );
  }

  const {
    data: configuredProfile,
    error: configurationError,
  } = await adminClient
    .from("staff_profiles")
    .update({
      password_change_required: true,
      password_setup_completed_at:
        null,
      temporary_password_expires_at:
        temporaryPasswordExpiresAt
          .toISOString(),
    })
    .eq(
      "user_id",
      createdUserId,
    )
    .select("user_id")
    .maybeSingle();

  if (
    configurationError ||
    configuredProfile?.user_id !==
      createdUserId
  ) {
    await rollbackCreatedStaffAccount(
      adminClient,
      createdUserId,
      "The staff account was created, but temporary-password protection could not be configured. Remove the account in Supabase before retrying.",
    );

    throw new HttpError(
      "Temporary-password protection could not be configured. Please try again.",
      500,
    );
  }

  try {
    await sendStaffInvitationEmail({
      email: parsed.data.email,
      expiresAt:
        temporaryPasswordExpiresAt,
      fullName:
        parsed.data.fullName,
      role: parsed.data.role,
      temporaryPassword,
    });
  } catch {
    await rollbackCreatedStaffAccount(
      adminClient,
      createdUserId,
      "The staff account was created, but the onboarding email could not be sent. Remove the account in Supabase before retrying.",
    );

    throw new HttpError(
      "The onboarding email could not be sent. Please verify the SMTP configuration and try again.",
      502,
    );
  }

  return json(
    {
      invitationSent: true,
      staff: staffProfile,
    },
    201,
  );
}

async function handleStaffPasswordReissue(
  request,
) {
  const { profile: actorProfile } =
    await requireActiveStaff(
      request,
      ["admin"],
    );

  await enforceAdminWriteRateLimit(
    request,
    "staff-password-reissue",
    actorProfile.userId,
  );

  const body =
    await readJsonBody(request);

  const parsed =
    adminStaffPasswordReissueSchema
      .safeParse(body);

  if (!parsed.success) {
    throw new HttpError(
      "The password-reissue request is invalid.",
      400,
    );
  }

  if (
    parsed.data.userId ===
      actorProfile.userId
  ) {
    throw new HttpError(
      "You cannot reissue your own temporary password.",
      409,
    );
  }

  const adminClient =
    getAdminClient();

  const target =
    await getStaffAccountTarget(
      adminClient,
      parsed.data.userId,
    );

  if (!target.active) {
    throw new HttpError(
      "Activate this staff account before reissuing its temporary password.",
      409,
    );
  }

  if (
    !target.passwordChangeRequired
  ) {
    throw new HttpError(
      "A temporary password can be reissued only while password setup is pending.",
      409,
    );
  }

  const temporaryPassword =
    createTemporaryPassword();

  const temporaryPasswordExpiresAt =
    createTemporaryPasswordExpiry();

  const {
    data: passwordData,
    error: passwordError,
  } = await adminClient.auth.admin
    .updateUserById(
      target.userId,
      {
        password:
          temporaryPassword,
      },
    );

  if (
    passwordError ||
    passwordData?.user?.id !==
      target.userId
  ) {
    throw new HttpError(
      "The temporary password could not be replaced. Please try again.",
      502,
    );
  }

  const {
    data: updatedStaff,
    error: recoveryError,
  } = await adminClient.rpc(
    "prepare_admin_staff_password_reissue",
    {
      p_actor_id:
        actorProfile.userId,
      p_expires_at:
        temporaryPasswordExpiresAt
          .toISOString(),
      p_user_id:
        target.userId,
    },
  );

  if (recoveryError) {
    if (
      recoveryError.code ===
        "P0002" ||
      recoveryError.code ===
        "42501" ||
      recoveryError.code ===
        "55000" ||
      recoveryError.code ===
        "22023" ||
      recoveryError.code ===
        "23514"
    ) {
      throw getStaffDatabaseError(
        recoveryError,
      );
    }

    throw new HttpError(
      "The temporary password was replaced, but account recovery could not be completed. Reissue the password again.",
      500,
    );
  }

  if (
    updatedStaff?.userId !==
      target.userId ||
    updatedStaff?.email !==
      target.email ||
    !updatedStaff?.fullName ||
    !updatedStaff?.role ||
    updatedStaff
      ?.passwordChangeRequired !==
      true ||
    !updatedStaff
      ?.temporaryPasswordExpiresAt
  ) {
    throw new HttpError(
      "The temporary password was replaced, but account recovery could not be verified. Reissue the password again.",
      500,
    );
  }

  try {
    await sendStaffInvitationEmail({
      email: updatedStaff.email,
      expiresAt:
        temporaryPasswordExpiresAt,
      fullName:
        updatedStaff.fullName,
      messageType: "reissue",
      role: updatedStaff.role,
      temporaryPassword,
    });
  } catch {
    throw new HttpError(
      "A new temporary password was generated, but the recovery email could not be sent. Verify the SMTP configuration and reissue the password again.",
      502,
    );
  }

  return json(
    {
      staff: updatedStaff,
      temporaryPasswordReissued:
        true,
    },
    200,
  );
}

async function handleStaffDelete(
  request,
) {
  const { profile: actorProfile } =
    await requireActiveStaff(
      request,
      ["admin"],
    );

  await enforceAdminWriteRateLimit(
    request,
    "staff-delete",
    actorProfile.userId,
  );

  const body =
    await readJsonBody(request);

  const parsed =
    adminStaffDeleteSchema.safeParse(
      body,
    );

  if (!parsed.success) {
    throw new HttpError(
      "The staff-deletion request is invalid.",
      400,
    );
  }

  if (
    parsed.data.userId ===
      actorProfile.userId
  ) {
    throw new HttpError(
      "You cannot delete your own staff account.",
      409,
    );
  }

  const adminClient =
    getAdminClient();

  const target =
    await getStaffAccountTarget(
      adminClient,
      parsed.data.userId,
    );

  if (
    parsed.data
      .confirmationEmail !==
    target.email
  ) {
    throw new HttpError(
      "The confirmation email does not match the selected staff account.",
      400,
    );
  }

  const {
    data: preparedStaff,
    error: preparationError,
  } = await adminClient.rpc(
    "prepare_admin_staff_deletion",
    {
      p_actor_id:
        actorProfile.userId,
      p_user_id:
        target.userId,
    },
  );

  if (preparationError) {
    throw getStaffDatabaseError(
      preparationError,
    );
  }

  if (
    preparedStaff?.userId !==
      target.userId ||
    preparedStaff?.email !==
      target.email ||
    !preparedStaff?.fullName ||
    !preparedStaff?.role ||
    !preparedStaff?.auditEventId
  ) {
    throw new HttpError(
      "The staff account could not be prepared for deletion. Please try again.",
      500,
    );
  }

  const { error: deletionError } =
    await adminClient.auth.admin
      .deleteUser(target.userId);

  if (deletionError) {
    throw new HttpError(
      "The staff account was disabled, but permanent deletion could not be completed. Retry deletion.",
      502,
    );
  }

  return json(
    {
      accountDeleted: true,
      staff: {
        email:
          preparedStaff.email,
        fullName:
          preparedStaff.fullName,
        role:
          preparedStaff.role,
        userId:
          preparedStaff.userId,
      },
    },
    200,
  );
}

async function handleStaffUpdate(request) {
  const { profile } =
    await requireActiveStaff(
      request,
      ["admin"],
    );

    await enforceAdminWriteRateLimit(
  request,
  "staff-update",
  profile.userId,
);

  const body = await readJsonBody(request);

  const parsed =
    adminStaffUpdateSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(
      "The staff information is invalid.",
      400,
    );
  }

  const { data, error } =
    await getAdminClient().rpc(
      "update_admin_staff",
      {
        p_active: parsed.data.active,
        p_actor_id: profile.userId,
        p_full_name: parsed.data.fullName,
        p_role: parsed.data.role,
        p_user_id: parsed.data.userId,
      },
    );

  if (error) {
    throw getStaffDatabaseError(error);
  }

  if (
    !data?.userId ||
    !data?.fullName ||
    !data?.email ||
    !data?.role
  ) {
    throw new HttpError(
      "The staff profile could not be updated. Please try again.",
      500,
    );
  }

  return json(
    {
      staff: data,
    },
    200,
  );
}

const OPERATION_HANDLERS = new Map([
  ["host-list", handleHostList],
  ["host-save", handleHostSave],
  ["staff-delete", handleStaffDelete],
  ["staff-invite", handleStaffInvite],
  ["staff-list", handleStaffList],
  [
    "staff-password-reissue",
    handleStaffPasswordReissue,
  ],
  ["staff-update", handleStaffUpdate],
]);

export function createAdminHandler({
  operationHandlers = OPERATION_HANDLERS,
} = {}) {
  return {
    async fetch(request) {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      const operation = getOperation(request);
      const handler =
        operationHandlers.get(operation);

      if (!handler) {
        return json(
          {
            error:
              "Administration operation not found.",
          },
          404,
        );
      }

      try {
        return await handler(request);
      } catch (error) {
        if (
          error instanceof
          RateLimitExceededError
        ) {
          return json(
            {
              error:
                "Too many administration changes. Please wait before trying again.",
            },
            429,
            {
              "Retry-After": String(
                error.retryAfterSeconds,
              ),
            },
          );
        }

        if (error instanceof HttpError) {
          return json(
            {
              error: error.message,
            },
            error.status,
          );
        }

        return json(
          {
            error:
              UNEXPECTED_ERROR_MESSAGES[
                operation
              ] ||
              "The administration request could not be completed. Please try again.",
          },
          500,
        );
      }
    },
  };
}

export default createAdminHandler();