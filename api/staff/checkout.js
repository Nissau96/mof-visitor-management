import {
  requireActiveStaff,
  requireStaffTowerScope,
} from "../_lib/staffAuth.js";
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
import { staffVisitCheckoutSchema } from "../../src/validation/staffVisits.js";

export const STAFF_CHECKOUT_RATE_LIMIT =
  Object.freeze({
    limit: 120,
    scope: "staff-visitor-checkout",
    windowSeconds: 10 * 60,
  });

function getCheckoutDatabaseError(error) {
  if (error?.code === "P0002") {
    return new HttpError(
      "The visit could not be found.",
      404,
    );
  }

  if (error?.code === "42501") {
    return new HttpError(
      "This visit does not belong to your selected tower.",
      403,
    );
  }

  if (error?.code === "55000") {
    return new HttpError(
      "This visit cannot be checked out.",
      409,
    );
  }

  if (
    error?.code === "22023" ||
    error?.code === "22P02"
  ) {
    return new HttpError(
      "The check-out request is invalid.",
      400,
    );
  }

  return new HttpError(
    "Check-out could not be completed. Please try again.",
    500,
  );
}

export function createCheckoutHandler({
  enforceRateLimitForRequest = enforceRateLimit,
  getAdminClientForRequest = getAdminClient,
  requireActiveStaffForRequest =
    requireActiveStaff,
} = {}) {
  return {
    async fetch(request) {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      try {
        const { profile } =
          await requireActiveStaffForRequest(
            request,
          );

        await enforceRateLimitForRequest(
          request,
          {
            ...STAFF_CHECKOUT_RATE_LIMIT,
            keyMode: "subject",
            subject: profile.userId,
          },
        );

        const body =
          await readJsonBody(request);

        const parsed =
          staffVisitCheckoutSchema.safeParse(
            body,
          );

        if (!parsed.success) {
          throw new HttpError(
            "The check-out request is invalid.",
            400,
          );
        }

        const towerScope =
          requireStaffTowerScope(
            profile,
            parsed.data.tower,
          );

        const { data, error } =
          await getAdminClientForRequest().rpc(
            "checkout_visit",
            {
              p_actor_id: profile.userId,
              p_tower: towerScope,
              p_visit_id:
                parsed.data.visitId,
            },
          );

        if (error) {
          throw getCheckoutDatabaseError(
            error,
          );
        }

        if (
          !data?.visitId ||
          !data?.reference ||
          !data?.tower ||
          data?.status !== "checked_out" ||
          !data?.checkedOutAt
        ) {
          throw new HttpError(
            "Check-out could not be completed. Please try again.",
            500,
          );
        }

        return json(
          {
            checkout: {
              alreadyCheckedOut: Boolean(
                data.alreadyCheckedOut,
              ),
              checkedOutAt:
                data.checkedOutAt,
              reference: data.reference,
              status: data.status,
              tower: data.tower,
              visitId: data.visitId,
            },
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
                "Too many check-out attempts. Please wait before trying again.",
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
            error.status === 401
              ? {
                  "WWW-Authenticate":
                    "Bearer",
                }
              : {},
          );
        }

        return json(
          {
            error:
              "Check-out could not be completed. Please try again.",
          },
          500,
        );
      }
    },
  };
}

export default createCheckoutHandler();