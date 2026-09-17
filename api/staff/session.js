import process from "node:process";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../_lib/http.js";
import {
  requireActiveStaff,
} from "../_lib/staffAuth.js";
import {
  getAdminClient,
} from "../_lib/supabase.js";
import {
  createWeeklyQrAccessUrl,
  createWeeklyQrToken,
} from "../../src/server/weeklyQrAccess.js";
import {
  staffPasswordSetupSchema,
} from "../../src/validation/adminManagement.js";

function getLocalVisitorApplicationUrl(
  request,
) {
  const vercelEnvironment =
    process.env.VERCEL_ENV || "";

  if (
    vercelEnvironment &&
    vercelEnvironment !== "development"
  ) {
    return undefined;
  }

  let requestUrl;

  try {
    requestUrl = new URL(request.url);
  } catch {
    return undefined;
  }

  const localHostname =
    requestUrl.hostname === "localhost" ||
    requestUrl.hostname === "127.0.0.1";

  if (
    requestUrl.protocol !== "http:" ||
    !localHostname
  ) {
    return undefined;
  }

  return new URL(
    "/visit",
    requestUrl.origin,
  ).toString();
}

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
        request.method !== "PUT"
      ) {
        return methodNotAllowed([
          "GET",
          "POST",
          "PUT",
        ]);
      }

      try {
        if (request.method === "GET") {
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

          return json(
            {
              profile: {
                fullName:
                  profile.fullName,
                passwordChangeRequired:
                  profile.passwordChangeRequired,
                role: profile.role,
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