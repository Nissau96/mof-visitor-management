import process from "node:process";
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
  adminStaffInviteSchema,
  adminStaffListSchema,
  adminStaffUpdateSchema,
} from "../src/validation/adminManagement.js";

const OPERATION_BY_PATH = new Map([
  ["/api/admin/hosts/list", "host-list"],
  ["/api/admin/hosts/save", "host-save"],
  ["/api/admin/staff/invite", "staff-invite"],
  ["/api/admin/staff/list", "staff-list"],
  ["/api/admin/staff/update", "staff-update"],
]);

const UNEXPECTED_ERROR_MESSAGES = {
  "host-list":
    "Host records could not be loaded. Please try again.",
  "host-save":
    "The host record could not be saved. Please try again.",
  "staff-invite":
    "The staff invitation could not be completed. Please try again.",
  "staff-list":
    "Staff records could not be loaded. Please try again.",
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

    "staff-invite": Object.freeze({
      limit: 20,
      scope: "admin-staff-invite",
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

function getInviteRedirectUrl() {
  const configuredUrl =
    process.env.STAFF_INVITE_REDIRECT_URL;

  if (!configuredUrl) {
    throw new HttpError(
      "Staff invitation is not configured.",
      500,
    );
  }

  let redirectUrl;

  try {
    redirectUrl = new URL(configuredUrl);
  } catch {
    throw new HttpError(
      "Staff invitation is not configured.",
      500,
    );
  }

  const localDevelopment =
    redirectUrl.protocol === "http:" &&
    (redirectUrl.hostname === "localhost" ||
      redirectUrl.hostname === "127.0.0.1");

  if (
    (redirectUrl.protocol !== "https:" &&
      !localDevelopment) ||
    redirectUrl.username ||
    redirectUrl.password ||
    redirectUrl.search ||
    redirectUrl.hash ||
    redirectUrl.pathname !== "/staff/setup"
  ) {
    throw new HttpError(
      "Staff invitation is not configured.",
      500,
    );
  }

  return redirectUrl.toString();
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

  const body = await readJsonBody(request);

  const parsed =
    adminStaffInviteSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(
      "The staff invitation is invalid.",
      400,
    );
  }

  const redirectTo = getInviteRedirectUrl();
  const adminClient = getAdminClient();

  const {
    data: invitationData,
    error: invitationError,
  } =
    await adminClient.auth.admin
      .inviteUserByEmail(
        parsed.data.email,
        {
          data: {
            full_name: parsed.data.fullName,
          },
          redirectTo,
        },
      );

  if (
    invitationError ||
    !invitationData?.user?.id
  ) {
    if (
      isExistingUserError(
        invitationError,
      )
    ) {
      throw new HttpError(
        "A user with this email address already exists.",
        409,
      );
    }

    throw new HttpError(
      "The invitation email could not be sent. Please try again.",
      502,
    );
  }

  const invitedUserId =
    invitationData.user.id;

  const {
    data: staffProfile,
    error: profileError,
  } = await adminClient.rpc(
    "create_invited_staff_profile",
    {
      p_actor_id: profile.userId,
      p_full_name: parsed.data.fullName,
      p_role: parsed.data.role,
      p_user_id: invitedUserId,
    },
  );

  if (profileError) {
    const { error: rollbackError } =
      await adminClient.auth.admin
        .deleteUser(invitedUserId);

    if (rollbackError) {
      throw new HttpError(
        "The invitation was sent, but staff authorisation could not be completed. Deactivate the invited account in Supabase before retrying.",
        500,
      );
    }

    throw getProfileDatabaseError(
      profileError,
    );
  }

  if (
    !staffProfile?.userId ||
    !staffProfile?.email ||
    !staffProfile?.fullName ||
    !staffProfile?.role
  ) {
    throw new HttpError(
      "The staff invitation could not be completed. Please try again.",
      500,
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
  ["staff-invite", handleStaffInvite],
  ["staff-list", handleStaffList],
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