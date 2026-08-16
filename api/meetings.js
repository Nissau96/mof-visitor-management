import {
  RateLimitExceededError,
  enforceRateLimit,
} from "./_lib/rateLimit.js";
import { getAdminClient } from "./_lib/supabase.js";
import {
  json,
  methodNotAllowed,
} from "./_lib/http.js";

export const MEETING_DIRECTORY_RATE_LIMIT =
  Object.freeze({
    limit: 300,
    scope: "public-meeting-directory",
    windowSeconds: 10 * 60,
  });

export function createMeetingsHandler({
  enforceRateLimitForRequest = enforceRateLimit,
  getAdminClientForRequest = getAdminClient,
} = {}) {
  return {
    async fetch(request) {
      if (request.method !== "GET") {
        return methodNotAllowed(["GET"]);
      }

      try {
        await enforceRateLimitForRequest(
          request,
          MEETING_DIRECTORY_RATE_LIMIT,
        );

        const { data, error } =
          await getAdminClientForRequest().rpc(
            "get_available_meetings",
          );

        if (error) {
          return json(
            {
              error:
                "Available meetings could not be loaded. Please try again.",
            },
            500,
          );
        }

        const meetings = Array.isArray(data)
          ? data.map((meeting) => ({
              id: meeting.id,
              title: meeting.title,
            }))
          : [];

        return json(
          {
            meetings,
          },
          200,
        );
      } catch (error) {
        if (
          error instanceof
          RateLimitExceededError
        ) {
          return json(
            {
              error:
                "Too many meeting-list requests. Please wait before trying again.",
            },
            429,
            {
              "Retry-After": String(
                error.retryAfterSeconds,
              ),
            },
          );
        }

        return json(
          {
            error:
              "Available meetings could not be loaded. Please try again.",
          },
          500,
        );
      }
    },
  };
}

export default createMeetingsHandler();
