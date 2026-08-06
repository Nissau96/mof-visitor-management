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
import { visitorRegistrationSchema } from "../src/validation/visitorRegistration.js";

export const REGISTRATION_RATE_LIMIT = Object.freeze({
  limit: 5,
  scope: "first-visit-registration",
  windowSeconds: 10 * 60,
});

export function createRegisterHandler({
  enforceRateLimitForRequest = enforceRateLimit,
} = {}) {
  return {
    async fetch(request) {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      try {
        await enforceRateLimitForRequest(
          request,
          REGISTRATION_RATE_LIMIT,
        );

        const requestBody = await readJsonBody(request);

        const parsed =
          visitorRegistrationSchema.safeParse(requestBody);

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

        const { data, error } = await getAdminClient().rpc(
          "register_first_visit",
          {
            p_consent_version: PRIVACY_NOTICE_VERSION,
            p_custom_meeting_title:
              input.customMeetingTitle || "",
            p_destination_agency: input.agency,
            p_destination_division: input.division || "",
            p_email: input.email || "",
            p_full_name: input.fullName,
            p_meeting_id:
              input.meetingId === CUSTOM_MEETING_OPTION
                ? null
                : input.meetingId || null,
            p_organization: input.organization || "",
            p_person_visiting: input.personVisiting || "",
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
      } catch (error) {
        if (error instanceof RateLimitExceededError) {
          return json(
            {
              error:
                "Too many registration attempts. Please wait before trying again.",
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
              "Registration could not be completed. Please try again.",
          },
          500,
        );
      }
    },
  };
}

export default createRegisterHandler();