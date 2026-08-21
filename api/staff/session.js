import process from "node:process";
import {
  HttpError,
  json,
  methodNotAllowed,
} from "../_lib/http.js";
import { requireActiveStaff } from "../_lib/staffAuth.js";
import {
  createWeeklyQrAccessUrl,
  createWeeklyQrToken,
} from "../../src/server/weeklyQrAccess.js";

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

export default {
  async fetch(request) {
    if (
      request.method !== "GET" &&
      request.method !== "POST"
    ) {
      return methodNotAllowed([
        "GET",
        "POST",
      ]);
    }

    try {
      const { profile } =
        await requireActiveStaff(request);

      if (request.method === "POST") {
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
          },
          200,
        );
      }

      return json(
        {
          profile: {
            fullName: profile.fullName,
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
                "WWW-Authenticate": "Bearer",
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
            request.method === "POST"
              ? "The weekly visitor QR code could not be generated."
              : "The staff session could not be verified.",
        },
        500,
      );
    }
  },
};