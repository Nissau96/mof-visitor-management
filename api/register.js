import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "./_lib/http.js";
import {
  RateLimitExceededError,
  enforceRateLimit,
} from "./_lib/rateLimit.js";
import { getAdminClient } from "./_lib/supabase.js";
import { PRIVACY_NOTICE_VERSION } from "../src/constants/privacy.js";
import { CUSTOM_MEETING_OPTION } from "../src/constants/visitorOptions.js";
import {
  clearWeeklyQrCookie,
  createWeeklyQrCookie,
  readWeeklyQrAccess,
  validateWeeklyQrToken,
} from "../src/server/weeklyQrAccess.js";
import { visitorRegistrationSchema } from "../src/validation/visitorRegistration.js";

export const REGISTRATION_RATE_LIMIT =
  Object.freeze({
    limit: 5,
    scope: "first-visit-registration",
    windowSeconds: 10 * 60,
  });

export const WEEKLY_ACCESS_RATE_LIMIT =
  Object.freeze({
    limit: 30,
    scope:
      "weekly-visitor-access-exchange",
    windowSeconds: 10 * 60,
  });

function invalidWeeklyAccess() {
  return json(
    {
      error:
        "The visitor QR code is invalid or has expired. Scan the current code at reception.",
    },
    401,
  );
}

function getWeeklyAccessStatus(request) {
  try {
    const access =
      readWeeklyQrAccess(request);

    return json(
      {
        access: {
          valid: true,
          validThrough:
            access.validThrough,
          weekEndsOn:
            access.weekEndsOn,
          weekStartsOn:
            access.weekStartsOn,
        },
      },
      200,
    );
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.status === 401
    ) {
      return invalidWeeklyAccess();
    }

    throw error;
  }
}

async function exchangeWeeklyAccess(
  request,
  enforceRateLimitForRequest,
) {
  await enforceRateLimitForRequest(
    request,
    WEEKLY_ACCESS_RATE_LIMIT,
  );

  const body =
    await readJsonBody(request);

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.token !== "string"
  ) {
    return invalidWeeklyAccess();
  }

  try {
    const access =
      validateWeeklyQrToken(body.token);

    return json(
      {
        access: {
          valid: true,
          validThrough:
            access.validThrough,
          weekEndsOn:
            access.weekEndsOn,
          weekStartsOn:
            access.weekStartsOn,
        },
      },
      200,
      {
        "Set-Cookie":
          createWeeklyQrCookie(
            request,
            access.token,
          ),
      },
    );
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.status === 401
    ) {
      return invalidWeeklyAccess();
    }

    throw error;
  }
}

async function registerVisitor(
  request,
  enforceRateLimitForRequest,
) {
  readWeeklyQrAccess(request);

  await enforceRateLimitForRequest(
    request,
    REGISTRATION_RATE_LIMIT,
  );

  const requestBody =
    await readJsonBody(request);

  const parsed =
    visitorRegistrationSchema.safeParse(
      requestBody,
    );

  if (!parsed.success) {
    return json(
      {
        error:
          "Check the highlighted information and try again.",
      },
      400,
    );
  }

  const input = parsed.data;

  const { data, error } =
    await getAdminClient().rpc(
      "register_first_visit",
      {
        p_consent_version:
          PRIVACY_NOTICE_VERSION,
        p_custom_meeting_title:
          input.customMeetingTitle || "",
        p_destination_agency:
          input.agency,
        p_destination_division:
          input.division || "",
        p_email: input.email || "",
        p_full_name: input.fullName,
        p_meeting_id:
          input.meetingId ===
          CUSTOM_MEETING_OPTION
            ? null
            : input.meetingId || null,
        p_organization:
          input.organization || "",
        p_person_visiting:
          input.personVisiting || "",
        p_phone: input.phone,
        p_purpose: input.purpose,
      },
    );

  if (error?.code === "23505") {
    return json(
      {
        error:
          "Registration could not be completed with these details. If you have visited before, use the returning visitor option.",
      },
      409,
    );
  }

  if (error) {
    return json(
      {
        error:
          "Registration could not be completed. Please try again.",
      },
      500,
    );
  }

  const result = data?.[0];

  if (!result?.reference_code) {
    return json(
      {
        error:
          "Registration could not be completed. Please try again.",
      },
      500,
    );
  }

  return json(
    {
      reference: result.reference_code,
    },
    201,
  );
}

export function createRegisterHandler({
  enforceRateLimitForRequest =
    enforceRateLimit,
} = {}) {
  return {
    async fetch(request) {
      if (
        ![
          "GET",
          "POST",
          "PUT",
          "DELETE",
        ].includes(request.method)
      ) {
        return methodNotAllowed([
          "GET",
          "POST",
          "PUT",
          "DELETE",
        ]);
      }

      try {
        if (request.method === "GET") {
          return getWeeklyAccessStatus(
            request,
          );
        }

        if (
          request.method === "DELETE"
        ) {
          return json(
            {
              access: {
                valid: false,
              },
            },
            200,
            {
              "Set-Cookie":
                clearWeeklyQrCookie(
                  request,
                ),
            },
          );
        }

        if (request.method === "PUT") {
          return await exchangeWeeklyAccess(
            request,
            enforceRateLimitForRequest,
          );
        }

        return await registerVisitor(
          request,
          enforceRateLimitForRequest,
        );
      } catch (error) {
        if (
          error instanceof
          RateLimitExceededError
        ) {
          const accessExchange =
            request.method === "PUT";

          return json(
            {
              error: accessExchange
                ? "Too many visitor-access attempts. Please wait before scanning the QR code again."
                : "Too many registration attempts. Please wait before trying again.",
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
              request.method === "PUT" ||
              request.method === "GET"
                ? "Visitor access could not be verified. Please try again."
                : "Registration could not be completed. Please try again.",
          },
          500,
        );
      }
    },
  };
}

export default createRegisterHandler();