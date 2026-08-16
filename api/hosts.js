import {
  RateLimitExceededError,
  enforceRateLimit,
} from "./_lib/rateLimit.js";
import { getAdminClient } from "./_lib/supabase.js";
import {
  json,
  methodNotAllowed,
} from "./_lib/http.js";

export const HOST_DIRECTORY_RATE_LIMIT =
  Object.freeze({
    limit: 300,
    scope: "public-host-directory",
    windowSeconds: 10 * 60,
  });

export function createHostsHandler({
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
          HOST_DIRECTORY_RATE_LIMIT,
        );

        const { data, error } =
          await getAdminClientForRequest()
            .from("hosts")
            .select(
              "id, full_name, department",
            )
            .eq("active", true)
            .order("full_name", {
              ascending: true,
            });

        if (error) {
          return json(
            {
              error:
                "Available hosts could not be loaded.",
            },
            500,
          );
        }

        const hosts = Array.isArray(data)
          ? data.map((host) => ({
              department: host.department,
              fullName: host.full_name,
              id: host.id,
            }))
          : [];

        return json({
          hosts,
        });
      } catch (error) {
        if (
          error instanceof
          RateLimitExceededError
        ) {
          return json(
            {
              error:
                "Too many host-list requests. Please wait before trying again.",
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
              "Available hosts could not be loaded.",
          },
          500,
        );
      }
    },
  };
}

export default createHostsHandler();
