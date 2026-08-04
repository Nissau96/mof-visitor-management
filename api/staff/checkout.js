import { requireActiveStaff } from "../_lib/staffAuth.js";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../_lib/http.js";
import { getAdminClient } from "../_lib/supabase.js";
import { staffVisitCheckoutSchema } from "../../src/validation/staffVisits.js";

function getCheckoutDatabaseError(error) {
  if (error?.code === "P0002") {
    return new HttpError(
      "The visit could not be found.",
      404,
    );
  }

  if (error?.code === "42501") {
    return new HttpError(
      "This account is not authorised to check visitors out.",
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

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const { profile } =
        await requireActiveStaff(request);

      const body = await readJsonBody(request);

      const parsed =
        staffVisitCheckoutSchema.safeParse(body);

      if (!parsed.success) {
        throw new HttpError(
          "The check-out request is invalid.",
          400,
        );
      }

      const { data, error } =
        await getAdminClient().rpc(
          "checkout_visit",
          {
            p_actor_id: profile.userId,
            p_visit_id: parsed.data.visitId,
          },
        );

      if (error) {
        throw getCheckoutDatabaseError(error);
      }

      if (
        !data?.visitId ||
        !data?.reference ||
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
            checkedOutAt: data.checkedOutAt,
            reference: data.reference,
            status: data.status,
            visitId: data.visitId,
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
