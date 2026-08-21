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
  createLookupToken,
  maskPhoneSuffix,
  maskVisitorName,
  maskVisitorOrganization,
} from "../_lib/visitorLookup.js";
import { readWeeklyQrAccess } from "../../src/server/weeklyQrAccess.js";
import { returningVisitorSearchSchema } from "../../src/validation/returningVisitor.js";

const DISPLAY_RESULT_LIMIT = 6;
const DATABASE_RESULT_LIMIT = DISPLAY_RESULT_LIMIT + 1;

const SEARCH_RATE_LIMIT = {
  limit: 10,
  scope: "returning-visitor-search",
  windowSeconds: 10 * 60,
};

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      readWeeklyQrAccess(request);

      const requestBody = await readJsonBody(request);

      const parsed =
        returningVisitorSearchSchema.safeParse(requestBody);

      if (!parsed.success) {
        return json(
          {
            error:
              "Enter at least three characters from your name.",
          },
          400,
        );
      }

      await enforceRateLimit(request, SEARCH_RATE_LIMIT);

      const { data, error } = await getAdminClient().rpc(
        "search_returning_visitors",
        {
          p_limit: DATABASE_RESULT_LIMIT,
          p_query: parsed.data.query,
        },
      );

      if (error) {
        return json(
          {
            error:
              "Visitor records could not be searched. Please try again.",
          },
          500,
        );
      }

      const records = Array.isArray(data) ? data : [];
      const hasMore = records.length > DISPLAY_RESULT_LIMIT;

      const results = records
        .slice(0, DISPLAY_RESULT_LIMIT)
        .map((record) => ({
          lookupToken: createLookupToken(record.visitor_id),
          maskedName: maskVisitorName(record.full_name),
          maskedOrganization: maskVisitorOrganization(
            record.organization,
          ),
          maskedPhone: maskPhoneSuffix(record.phone_suffix),
        }));

      return json({
        hasMore,
        results,
      });
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        return json(
          {
            error:
              "Too many search attempts. Please wait before trying again.",
          },
          429,
          {
            "Retry-After": String(error.retryAfterSeconds),
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
            "Visitor records could not be searched. Please try again.",
        },
        500,
      );
    }
  },
};