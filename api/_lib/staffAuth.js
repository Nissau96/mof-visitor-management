import { Buffer } from "node:buffer";
import { setAuditActor } from "./auditContext.js";
import { VISIT_TOWER_VALUES } from "../../src/constants/visitorOptions.js";
import { HttpError } from "./http.js";
import { getAdminClient } from "./supabase.js";

const MAXIMUM_ACCESS_TOKEN_LENGTH = 8_192;

const STAFF_ROLES = new Set([
  "receptionist",
  "client_service_head",
  "it_network_admin",
  "admin",
]);

const STAFF_TOWERS = new Set(
  VISIT_TOWER_VALUES,
);

// How a staff session was authenticated, from the access token's amr
// claim, mapped to the profile's sign_in_method.
const SESSION_METHODS = {
  microsoft: "oauth",
  password: "password",
};

// Staff sign in again with a fresh login at least this often, so a
// person disabled in Entra ID is cut off within a working day.
export const STAFF_SIGN_IN_MAX_AGE_HOURS = 12;

const ACCRA_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Accra",
  year: "numeric",
});

class StaffAccessRefusal extends HttpError {
  constructor(message, status, reason) {
    super(message, status);
    this.reason = reason;
  }
}

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

function readTokenPayload(token) {
  const segments = token.split(".");

  if (segments.length !== 3) {
    throw new HttpError(
      "Your staff session is invalid or has expired.",
      401,
    );
  }

  try {
    return JSON.parse(
      Buffer.from(
        segments[1],
        "base64url",
      ).toString("utf8"),
    );
  } catch {
    throw new HttpError(
      "Your staff session is invalid or has expired.",
      401,
    );
  }
}

// The latest sign-in recorded in the token's amr claim, for example
// { method: "oauth", timestamp: 1763280000 }. The user object cannot
// tell which method this particular session used; the token can.
export function readSessionAuthentication(token) {
  const payload = readTokenPayload(token);
  const entries = Array.isArray(payload.amr)
    ? payload.amr.filter(
        (entry) =>
          entry &&
          typeof entry.method === "string" &&
          Number.isInteger(entry.timestamp) &&
          entry.timestamp > 0,
      )
    : [];

  if (!entries.length) {
    throw new HttpError(
      "Your staff session is invalid or has expired.",
      401,
    );
  }

  return entries.reduce((latest, entry) =>
    entry.timestamp > latest.timestamp ? entry : latest,
  );
}

function readTokenIssuedAt(
  token,
) {
  const payload = readTokenPayload(token);

  try {
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

function readClientAddress(request) {
  // Vercel sets x-forwarded-for to the caller's public address and
  // overwrites any value the caller sent.
  const forwarded =
    request.headers.get("x-forwarded-for") || "";

  return (
    forwarded.split(",")[0].trim() ||
    (request.headers.get("x-real-ip") || "").trim()
  ).toLowerCase();
}

function ipv4ToNumber(address) {
  const parts = address.split(".");

  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  ) {
    return null;
  }

  return parts.reduce((total, part) => total * 256 + Number(part), 0);
}

function addressMatches(address, entry) {
  const [base, bitsText] = entry.split("/");

  if (bitsText === undefined) {
    return address === base;
  }

  const bits = Number(bitsText);
  const addressNumber = ipv4ToNumber(address);
  const baseNumber = ipv4ToNumber(base);

  if (
    addressNumber === null ||
    baseNumber === null ||
    !Number.isInteger(bits) ||
    bits < 0 ||
    bits > 32
  ) {
    return false;
  }

  const size = 2 ** (32 - bits);

  return Math.floor(addressNumber / size) === Math.floor(baseNumber / size);
}

// STAFF_ALLOWED_IPS lists the Ministry's public addresses, separated by
// commas or spaces: exact IPv4/IPv6 addresses or IPv4 ranges such as
// 196.10.20.0/28. Unset means no restriction, except in Production,
// where an unset list refuses every staff request.
export function checkStaffNetwork(
  request,
  environment = process.env,
) {
  const allowed = String(environment.STAFF_ALLOWED_IPS || "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.length) {
    if (environment.VERCEL_ENV === "production") {
      throw new StaffAccessRefusal(
        "Staff access is not configured for this network. Contact the system administrator.",
        403,
        "network_not_configured",
      );
    }

    return;
  }

  const address = readClientAddress(request);

  if (!address || !allowed.some((entry) => addressMatches(address, entry))) {
    throw new StaffAccessRefusal(
      "Staff services can only be used from the Ministry of Finance network.",
      403,
      "outside_network",
    );
  }
}

// Writes one audit_events row for the activity log. The database fills
// in IP, device, tower and the actor's name and role. A failed write
// never blocks the response; it is logged instead.
export async function recordAuditEvent(
  adminClient,
  {
    action,
    actorId = null,
    actorName = null,
    actorRole = null,
    details = {},
    entityId = null,
    entityType = "system",
    result,
  },
) {
  try {
    const { error } = await adminClient.from("audit_events").insert({
      action,
      actor_id: actorId || null,
      ...(actorName ? { actor_name: actorName } : {}),
      ...(actorRole ? { actor_role: actorRole } : {}),
      details,
      entity_id: entityId ? String(entityId) : null,
      entity_type: entityType,
      ...(result ? { result } : {}),
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("Audit event could not be recorded.", {
      action,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Writes one audit_events row. A failed audit write never blocks or
// changes the response; it is logged instead.
export async function recordStaffAuditEvent(
  adminClient,
  { action, actorId, details = {} },
) {
  try {
    const { error } = await adminClient.from("audit_events").insert({
      action,
      actor_id: actorId || null,
      details,
      entity_id: actorId || null,
      entity_type: "staff_session",
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("Staff audit event could not be recorded.", {
      action,
      errorMessage: error instanceof Error ? error.message : String(error?.message || ""),
    });
  }
}

export async function requireActiveStaff(
  request,
  allowedRoles = [],
  {
    allowPasswordChangeRequired = false,
    environment = process.env,
    getAdminClientForRequest = getAdminClient,
    // The session endpoint sets this so refused sign-ins reach the
    // audit log. Other endpoints leave it off to avoid a row per call.
    recordRefusals = false,
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

  try {
    return await checkStaffProfile({
      accessToken,
      adminClient,
      allowPasswordChangeRequired,
      allowedRoles,
      environment,
      request,
      user,
    });
  } catch (error) {
    if (recordRefusals && error instanceof StaffAccessRefusal) {
      await recordStaffAuditEvent(adminClient, {
        action: "staff_sign_in_refused",
        actorId: user.id,
        details: { reason: error.reason },
      });
    }

    throw error;
  }
}

async function checkStaffProfile({
  accessToken,
  adminClient,
  allowPasswordChangeRequired,
  allowedRoles,
  environment,
  request,
  user,
}) {
  checkStaffNetwork(request, environment);

  const {
    data: profile,
    error: profileError,
  } = await adminClient
    .from("staff_profiles")
    .select(
      "user_id, full_name, role, active, password_change_required, temporary_password_expires_at, password_setup_completed_at, sign_in_method, access_expires_at, is_nsp",
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
    throw new StaffAccessRefusal(
      "This account is not authorised for staff access.",
      403,
      !profile ? "no_staff_profile" : "inactive",
    );
  }

  const signInMethod = profile.sign_in_method || null;

  // Profiles read before the sign-in-method migration have no method;
  // every migrated profile has one, so these checks always apply.
  if (signInMethod) {
    const authentication =
      readSessionAuthentication(accessToken);

    if (authentication.method !== SESSION_METHODS[signInMethod]) {
      throw new StaffAccessRefusal(
        signInMethod === "microsoft"
          ? "This account signs in with a Ministry work email. Use Sign in with Work Email."
          : "This account signs in with an email address and password.",
        403,
        "wrong_method",
      );
    }

    const ageSeconds =
      Math.floor(Date.now() / 1_000) - authentication.timestamp;

    if (ageSeconds > STAFF_SIGN_IN_MAX_AGE_HOURS * 3_600) {
      throw new StaffAccessRefusal(
        `For security, staff sign in again every ${STAFF_SIGN_IN_MAX_AGE_HOURS} hours. Sign in again to continue.`,
        401,
        "sign_in_too_old",
      );
    }
  }

  const accessExpiresAt = profile.access_expires_at || null;

  if (accessExpiresAt) {
    const accessEnd = Date.parse(accessExpiresAt);

    if (!Number.isFinite(accessEnd)) {
      throw new HttpError(
        "Staff access could not be verified.",
        500,
      );
    }

    if (accessEnd <= Date.now()) {
      // Stored as 00:00 Accra on the end date the administrator chose.
      throw new StaffAccessRefusal(
        `Your staff access ended on ${ACCRA_DATE.format(new Date(accessEnd))}. Contact an administrator.`,
        403,
        "access_expired",
      );
    }
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

  setAuditActor({
    id: profile.user_id,
    name: profile.full_name,
    role: profile.role,
  });

  return {
    profile: {
      accessExpiresAt,
      active: profile.active,
      fullName: profile.full_name,
      // Intern/NSP: receptionist duties without Analytics & Reports.
      isNsp: profile.is_nsp === true,
      passwordChangeRequired,
      passwordSetupCompletedAt,
      role: profile.role,
      signInMethod: signInMethod || "password",
      temporaryPasswordExpiresAt,
      userId: profile.user_id,
    },
  };
}