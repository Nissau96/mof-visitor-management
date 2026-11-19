import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../_lib/http.js";
import {
  readSessionAuthentication,
  recordStaffAuditEvent,
  requireActiveStaff,
} from "../_lib/staffAuth.js";
import { VISIT_TOWER_VALUES } from "../../src/constants/visitorOptions.js";
import {
  getAdminClient,
} from "../_lib/supabase.js";
import {
  createKioskDeviceCookie,
  createWeeklyQrAccessUrl,
  createWeeklyQrToken,
  getLocalVisitorApplicationUrl,
} from "../../src/server/weeklyQrAccess.js";
import {
  staffPasswordSetupSchema,
} from "../../src/validation/adminManagement.js";

function getPasswordCompletionError(
  error,
) {
  if (error?.code === "55000") {
    if (
      /expired/i.test(
        error.message || "",
      )
    ) {
      return new HttpError(
        "Your temporary password has expired. Contact an administrator for a new temporary password.",
        403,
      );
    }

    return new HttpError(
      "Password setup has already been completed.",
      409,
    );
  }

  if (error?.code === "42501") {
    return new HttpError(
      "This account is not authorised for staff access.",
      403,
    );
  }

  if (error?.code === "P0002") {
    return new HttpError(
      "The staff profile could not be found.",
      404,
    );
  }

  return new HttpError(
    "Your password was changed, but account setup could not be completed. Contact an administrator before trying again.",
    500,
  );
}

const FRESH_SIGN_IN_SECONDS = 10 * 60;

async function recordFreshSignIn(
  request,
  { getAdminClientForRequest, profile, tower },
) {
  let authentication;

  try {
    authentication = readSessionAuthentication(
      readBearerAccessToken(request),
    );
  } catch {
    return;
  }

  const ageSeconds =
    Math.floor(Date.now() / 1_000) - authentication.timestamp;

  if (ageSeconds < 0 || ageSeconds > FRESH_SIGN_IN_SECONDS) {
    return;
  }

  await recordStaffAuditEvent(getAdminClientForRequest(), {
    action: "staff_signed_in",
    actorId: profile.userId,
    details: {
      method: profile.signInMethod ?? "password",
      tower: VISIT_TOWER_VALUES.includes(tower) ? tower : null,
    },
  });
}

function readBearerAccessToken(request) {
  const match = (request.headers.get("authorization") || "").match(
    /^Bearer\s+([^\s]+)$/i,
  );

  return match?.[1] || "";
}

const KIOSK_DEVICE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reception kiosk tablets, for receptionists and administrators:
//   GET    ?kiosks=1      list the tablets that still work
//   POST   ?kiosk=1       set up this browser as a tablet named {label}
//   DELETE ?kiosk=<id>    remove a lost or stolen tablet
async function handleKioskDevices(
  request,
  kioskParameter,
  {
    getAdminClientForRequest,
    requireActiveStaffForRequest,
  },
) {
  const { profile } =
    await requireActiveStaffForRequest(
      request,
      ["receptionist", "admin"],
      { getAdminClientForRequest },
    );

  const adminClient =
    getAdminClientForRequest();

  if (request.method === "GET") {
    const { data, error } =
      await adminClient.rpc(
        "list_kiosk_devices",
      );

    if (error) {
      throw new Error(
        "The kiosk tablets could not be loaded.",
      );
    }

    return json(
      {
        kiosks: (data || []).map(
          (device) => ({
            createdAt: device.created_at,
            createdByName:
              device.created_by_name || "",
            expiresAt: device.expires_at,
            id: device.id,
            label: device.label,
            lastSeenAt:
              device.last_seen_at,
          }),
        ),
      },
      200,
    );
  }

  if (request.method === "POST") {
    if (kioskParameter !== "1") {
      throw new HttpError(
        "The kiosk request is invalid.",
        400,
      );
    }

    const body = await readJsonBody(request);
    const label =
      typeof body?.label === "string"
        ? body.label.trim()
        : "";

    if (label.length < 2 || label.length > 60) {
      throw new HttpError(
        "Name the tablet in 2 to 60 characters.",
        400,
      );
    }

    const kioskDevice =
      createKioskDeviceCookie(request);

    const { error } = await adminClient.rpc(
      "register_kiosk_device",
      {
        p_actor_id: profile.userId,
        p_device_id: kioskDevice.deviceId,
        p_expires_at: kioskDevice.expiresAt,
        p_label: label,
      },
    );

    if (error) {
      throw new Error(
        "The kiosk tablet could not be saved.",
      );
    }

    return json(
      {
        kiosk: {
          expiresAt: kioskDevice.expiresAt,
          id: kioskDevice.deviceId,
          label,
        },
      },
      201,
      {
        "Set-Cookie": kioskDevice.cookie,
      },
    );
  }

  if (
    request.method === "DELETE" &&
    KIOSK_DEVICE_ID.test(kioskParameter)
  ) {
    const { data, error } =
      await adminClient.rpc(
        "revoke_kiosk_device",
        {
          p_actor_id: profile.userId,
          p_device_id: kioskParameter,
        },
      );

    if (error) {
      throw new Error(
        "The kiosk tablet could not be removed.",
      );
    }

    if (data !== true) {
      throw new HttpError(
        "That kiosk tablet was not found or has already been removed.",
        404,
      );
    }

    return json({ removed: true }, 200);
  }

  throw new HttpError(
    "The kiosk request is invalid.",
    400,
  );
}

export function createStaffSessionHandler({
  getAdminClientForRequest =
    getAdminClient,
  requireActiveStaffForRequest =
    requireActiveStaff,
} = {}) {
  return {
    async fetch(request) {
      if (
        request.method !== "GET" &&
        request.method !== "POST" &&
        request.method !== "PUT" &&
        request.method !== "DELETE"
      ) {
        return methodNotAllowed([
          "DELETE",
          "GET",
          "POST",
          "PUT",
        ]);
      }

      try {
        const searchParams =
          new URL(request.url).searchParams;

        const kioskParameter =
          searchParams.get("kiosk") ??
          (searchParams.get("kiosks") === "1"
            ? "list"
            : null);

        if (kioskParameter !== null) {
          return await handleKioskDevices(
            request,
            kioskParameter,
            {
              getAdminClientForRequest,
              requireActiveStaffForRequest,
            },
          );
        }

        if (request.method === "DELETE") {
          return methodNotAllowed([
            "GET",
            "POST",
            "PUT",
          ]);
        }

        if (request.method === "GET") {
          const { profile } =
            await requireActiveStaffForRequest(
              request,
              [],
              {
                allowPasswordChangeRequired:
                  true,
                getAdminClientForRequest,
                recordRefusals: true,
              },
            );

          // The browser adds ?signedIn=1 on the first check after a
          // new sign-in; only sessions authenticated in the last few
          // minutes are recorded, so a replayed URL adds nothing.
          if (searchParams.get("signedIn") === "1") {
            await recordFreshSignIn(request, {
              getAdminClientForRequest,
              profile,
              tower: searchParams.get("tower") || "",
            });
          }

          return json(
            {
              profile: {
                accessExpiresAt:
                  profile.accessExpiresAt ?? null,
                fullName:
                  profile.fullName,
                isNsp:
                  profile.isNsp === true,
                passwordChangeRequired:
                  profile.passwordChangeRequired,
                role: profile.role,
                signInMethod:
                  profile.signInMethod ?? "password",
                temporaryPasswordExpiresAt:
                  profile.temporaryPasswordExpiresAt,
              },
            },
            200,
          );
        }

        if (request.method === "PUT") {
          const { profile } =
            await requireActiveStaffForRequest(
              request,
              [],
              {
                allowPasswordChangeRequired:
                  true,
                getAdminClientForRequest,
              },
            );

          if (
            !profile.passwordChangeRequired
          ) {
            throw new HttpError(
              "Password setup has already been completed.",
              409,
            );
          }

          const requestBody =
            await readJsonBody(request);

          const parsed =
            staffPasswordSetupSchema.safeParse(
              requestBody,
            );

          if (!parsed.success) {
            throw new HttpError(
              "Check the new password and try again.",
              400,
            );
          }

          const adminClient =
            getAdminClientForRequest();

          const {
            data: passwordData,
            error: passwordError,
          } =
            await adminClient.auth.admin
              .updateUserById(
                profile.userId,
                {
                  password:
                    parsed.data.password,
                },
              );

          if (
            passwordError ||
            passwordData?.user?.id !==
              profile.userId
          ) {
            throw new HttpError(
              "Your password could not be changed. Please try again.",
              502,
            );
          }

          const {
            data: completionData,
            error: completionError,
          } = await adminClient.rpc(
            "complete_staff_password_setup",
            {
              p_actor_id:
                profile.userId,
            },
          );

          if (completionError) {
            throw getPasswordCompletionError(
              completionError,
            );
          }

          if (
            completionData
              ?.passwordChangeRequired !==
                false ||
            !completionData
              ?.passwordSetupCompletedAt
          ) {
            throw new HttpError(
              "Your password was changed, but account setup could not be completed. Contact an administrator before trying again.",
              500,
            );
          }

          return json(
            {
              passwordChanged: true,
              requiresSignIn: true,
            },
            200,
          );
        }

        const { profile } =
          await requireActiveStaffForRequest(
            request,
            [
              "receptionist",
              "admin",
            ],
            {
              getAdminClientForRequest,
            },
          );

        const weeklyAccess =
          createWeeklyQrToken();

        return json(
          {
            weeklyQr: {
              accessUrl:
                createWeeklyQrAccessUrl(
                  weeklyAccess.token,
                  getLocalVisitorApplicationUrl(
                    request,
                  ),
                ),
              expiresAt:
                weeklyAccess.expiresAt,
              validFrom:
                weeklyAccess.validFrom,
              validThrough:
                weeklyAccess.validThrough,
              weekEndsOn:
                weeklyAccess.weekEndsOn,
              weekStartsOn:
                weeklyAccess.weekStartsOn,
            },
            requestedBy: {
              fullName:
                profile.fullName,
              role: profile.role,
            },
          },
          200,
        );
      } catch (error) {
        if (error instanceof HttpError) {
          return json(
            {
              error: error.message,
            },
            error.status,
            error.status === 401
              ? {
                  "WWW-Authenticate":
                    "Bearer",
                }
              : {},
          );
        }

        if (request.method === "POST") {
          console.error(
            "Weekly visitor QR generation failed.",
            {
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Unknown error",
              errorName:
                error instanceof Error
                  ? error.name
                  : "Unknown",
            },
          );
        }

        return json(
          {
            error:
              request.method === "PUT"
                ? "Your password could not be changed. Please try again."
                : request.method ===
                    "POST"
                  ? "The weekly visitor QR code could not be generated."
                  : "The staff session could not be verified.",
          },
          500,
        );
      }
    },
  };
}

export default createStaffSessionHandler();