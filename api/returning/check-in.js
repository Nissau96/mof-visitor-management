import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../_lib/http.js";
import {
  RateLimitExceededError,
  enforceRateLimit,
} from "../_lib/rateLimit.js";
import { getAdminClient } from "../_lib/supabase.js";
import {
  VERIFIED_VISITOR_AUDIENCE,
  readVisitorToken,
} from "../_lib/visitorLookup.js";
import { PRIVACY_NOTICE_VERSION } from "../../src/constants/privacy.js";
import { CUSTOM_MEETING_OPTION } from "../../src/constants/visitorOptions.js";
import { returningVisitCheckInSchema } from "../../src/validation/returningVisit.js";

const CHECK_IN_RATE_LIMIT = {
  limit: 10,
  scope: "returning-visitor-check-in",
  windowSeconds: 10 * 60,
};

function verificationRequired() {
  return json(
    {
      error:
        "Your verification has expired or is no longer valid. Verify your mobile number again.",
    },
    401,
  );
}

export function createReturningCheckInHandler({
  enforceRateLimitForRequest = enforceRateLimit,
  getAdminClientForRequest = getAdminClient,
  readVisitorTokenForRequest = readVisitorToken,
} = {}) {
  return {
    async fetch(request) {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      try {
        const requestBody = await readJsonBody(request);

        const parsed =
          returningVisitCheckInSchema.safeParse(
            requestBody,
          );

        if (!parsed.success) {
          return json(
            {
              error:
                "Check the visit information and try again.",
            },
            400,
          );
        }

        await enforceRateLimitForRequest(
          request,
          CHECK_IN_RATE_LIMIT,
        );

        let tokenData;

        try {
          tokenData = readVisitorTokenForRequest(
            parsed.data.verificationToken,
            VERIFIED_VISITOR_AUDIENCE,
          );
        } catch {
          return verificationRequired();
        }

        if (!tokenData.tokenId) {
          return verificationRequired();
        }

        const input = parsed.data;

        const { data, error } =
          await getAdminClientForRequest().rpc(
            "register_return_visit",
            {
              p_consent_version:
                PRIVACY_NOTICE_VERSION,
              p_custom_meeting_title:
                input.customMeetingTitle || "",
              p_destination_agency: input.agency,
              p_destination_division:
                input.division || "",
              p_meeting_id:
                input.meetingId ===
                CUSTOM_MEETING_OPTION
                  ? null
                  : input.meetingId || null,
              p_person_visiting:
                input.personVisiting || "",
              p_purpose: input.purpose,
              p_token_expires_at: new Date(
                tokenData.expiresAt * 1000,
              ).toISOString(),
              p_verification_token_id:
                tokenData.tokenId,
              p_visitor_id: tokenData.visitorId,
            },
          );

        if (
          error?.message ===
            "VISITOR_ALREADY_CHECKED_IN" ||
          error?.code === "23505"
        ) {
          return json(
            {
              error:
                "You already have an active check-in. Please contact reception if this is incorrect.",
            },
            409,
          );
        }

        if (
          error?.message?.includes(
            "Verification token",
          )
        ) {
          return verificationRequired();
        }

        if (
          error?.code === "22023" &&
          error?.message === "Meeting is unavailable"
        ) {
          return json(
            {
              error:
                "The selected meeting is no longer available. Refresh the meeting list and try again.",
            },
            400,
          );
        }

        if (error?.code === "22023") {
          return json(
            {
              error:
                "Check the visit information and try again.",
            },
            400,
          );
        }

        if (error) {
          return json(
            {
              error:
                "Your check-in could not be completed. Please try again.",
            },
            500,
          );
        }

        const result = data?.[0];

        if (!result?.reference_code) {
          return json(
            {
              error:
                "Your check-in could not be completed. Please try again.",
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
        if (
          error instanceof RateLimitExceededError
        ) {
          return json(
            {
              error:
                "Too many check-in attempts. Please wait before trying again.",
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
              "Your check-in could not be completed. Please try again.",
          },
          500,
        );
      }
    },
  };
}

export default createReturningCheckInHandler();