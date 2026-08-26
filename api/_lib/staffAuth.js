import { Buffer } from "node:buffer";
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

function readTokenIssuedAt(
  token,
) {
  const segments = token.split(".");

  if (segments.length !== 3) {
    throw new HttpError(
      "Your staff session is invalid or has expired.",
      401,
    );
  }

  try {
    const payload = JSON.parse(
      Buffer.from(
        segments[1],
        "base64url",
      ).toString("utf8"),
    );

    if (
      !Number.isInteger(payload.iat) ||
      payload.iat <= 0
    ) {
      throw new Error(
        "Invalid token issue time.",
      );
    }

    return payload.iat;
  } catch {
    throw new HttpError(
      "Your staff session is invalid or has expired.",
      401,
    );
  }
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
    allowPasswordChangeRequired = false,
    getAdminClientForRequest = getAdminClient,
  } = {},
) {
  validateAllowedRoles(allowedRoles);

  if (
    typeof allowPasswordChangeRequired !==
      "boolean"
  ) {
    throw new TypeError(
      "allowPasswordChangeRequired must be a boolean.",
    );
  }

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
      "user_id, full_name, role, active, password_change_required, temporary_password_expires_at, password_setup_completed_at",
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

  const passwordSetupCompletedAt =
    profile.password_setup_completed_at ||
    null;

  const passwordChangeRequired =
    profile.password_change_required ===
      true;

  const temporaryPasswordExpiresAt =
    profile.temporary_password_expires_at ||
    null;

  if (passwordChangeRequired) {
    const expiryTime = Date.parse(
      temporaryPasswordExpiresAt || "",
    );

    if (!Number.isFinite(expiryTime)) {
      throw new HttpError(
        "Staff account setup could not be verified.",
        500,
      );
    }

    if (expiryTime <= Date.now()) {
      throw new HttpError(
        "Your temporary password has expired. Contact an administrator for a new temporary password.",
        403,
      );
    }

    if (
      !allowPasswordChangeRequired
    ) {
      throw new HttpError(
        "Create your personal password before accessing staff services.",
        403,
      );
    }
  }

  if (
    !passwordChangeRequired &&
    passwordSetupCompletedAt
  ) {
    const completionTime = Date.parse(
      passwordSetupCompletedAt,
    );

    if (
      !Number.isFinite(
        completionTime,
      )
    ) {
      throw new HttpError(
        "Staff account setup could not be verified.",
        500,
      );
    }

    const tokenIssuedAt =
      readTokenIssuedAt(
        accessToken,
      );

    if (
      tokenIssuedAt <=
      Math.floor(
        completionTime / 1_000,
      )
    ) {
      throw new HttpError(
        "Sign in again using your new password.",
        401,
      );
    }
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
      passwordChangeRequired,
      passwordSetupCompletedAt,
      role: profile.role,
      temporaryPasswordExpiresAt,
      userId: profile.user_id,
    },
  };
}