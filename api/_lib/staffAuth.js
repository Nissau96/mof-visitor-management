import { VISIT_TOWER_VALUES } from "../../src/constants/visitorOptions.js";
import { HttpError } from "./http.js";
import { getAdminClient } from "./supabase.js";

const MAXIMUM_ACCESS_TOKEN_LENGTH = 8_192;

const STAFF_ROLES = new Set([
  "receptionist",
  "admin",
]);

const STAFF_TOWERS = new Set(
  VISIT_TOWER_VALUES,
);

function readBearerToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  const match = authorization.match(
    /^Bearer\s+([^\s]+)$/i,
  );

  const token = match?.[1] || "";

  if (
    !token ||
    token.length > MAXIMUM_ACCESS_TOKEN_LENGTH
  ) {
    throw new HttpError(
      "A valid staff session is required.",
      401,
    );
  }

  return token;
}

function validateAllowedRoles(allowedRoles) {
  if (!Array.isArray(allowedRoles)) {
    throw new TypeError(
      "allowedRoles must be an array.",
    );
  }

  for (const role of allowedRoles) {
    if (!STAFF_ROLES.has(role)) {
      throw new TypeError(
        "An unsupported staff role was requested.",
      );
    }
  }
}

export function requireStaffTowerScope(
  profile,
  requestedTower,
) {
  if (
    !profile ||
    !STAFF_ROLES.has(profile.role)
  ) {
    throw new HttpError(
      "This account is not authorised for staff access.",
      403,
    );
  }

  const tower = String(
    requestedTower || "",
  )
    .trim()
    .toLowerCase();

  if (tower && !STAFF_TOWERS.has(tower)) {
    throw new HttpError(
      "Select a valid working tower.",
      400,
    );
  }

  if (
    profile.role === "receptionist" &&
    !tower
  ) {
    throw new HttpError(
      "Select the tower where you are currently working.",
      400,
    );
  }

  return tower;
}

export async function requireActiveStaff(
  request,
  allowedRoles = [],
  {
    getAdminClientForRequest = getAdminClient,
  } = {},
) {
  validateAllowedRoles(allowedRoles);

  const accessToken = readBearerToken(request);
  const adminClient = getAdminClientForRequest();

  const {
    data: { user },
    error: userError,
  } = await adminClient.auth.getUser(
    accessToken,
  );

  if (userError || !user) {
    throw new HttpError(
      "Your staff session is invalid or has expired.",
      401,
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await adminClient
    .from("staff_profiles")
    .select(
      "user_id, full_name, role, active",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new HttpError(
      "The staff session could not be verified.",
      500,
    );
  }

  if (
    !profile ||
    !profile.active ||
    !STAFF_ROLES.has(profile.role)
  ) {
    throw new HttpError(
      "This account is not authorised for staff access.",
      403,
    );
  }

  if (
    allowedRoles.length > 0 &&
    !allowedRoles.includes(profile.role)
  ) {
    throw new HttpError(
      "You do not have permission to perform this action.",
      403,
    );
  }

  return {
    profile: {
      active: profile.active,
      fullName: profile.full_name,
      role: profile.role,
      userId: profile.user_id,
    },
  };
}