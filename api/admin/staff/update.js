import { requireActiveStaff } from "../../_lib/staffAuth.js";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../../_lib/http.js";
import { getAdminClient } from "../../_lib/supabase.js";
import { adminStaffUpdateSchema } from "../../../src/validation/adminManagement.js";

function getStaffDatabaseError(error) {
  if (error?.code === "P0002") {
    return new HttpError(
      "The staff profile could not be found.",
      404,
    );
  }

  if (error?.code === "42501") {
    return new HttpError(
      "Administrator access is required.",
      403,
    );
  }

  if (error?.code === "55000") {
    return new HttpError(
      error.message ||
        "This staff-account change is not permitted.",
      409,
    );
  }

  if (
    error?.code === "22023" ||
    error?.code === "23514"
  ) {
    return new HttpError(
      "The staff information is invalid.",
      400,
    );
  }

  return new HttpError(
    "The staff profile could not be updated. Please try again.",
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
        await requireActiveStaff(
          request,
          ["admin"],
        );

      const body = await readJsonBody(request);

      const parsed =
        adminStaffUpdateSchema.safeParse(body);

      if (!parsed.success) {
        throw new HttpError(
          "The staff information is invalid.",
          400,
        );
      }

      const { data, error } =
        await getAdminClient().rpc(
          "update_admin_staff",
          {
            p_active: parsed.data.active,
            p_actor_id: profile.userId,
            p_full_name:
              parsed.data.fullName,
            p_role: parsed.data.role,
            p_user_id: parsed.data.userId,
          },
        );

      if (error) {
        throw getStaffDatabaseError(error);
      }

      if (
        !data?.userId ||
        !data?.fullName ||
        !data?.email ||
        !data?.role
      ) {
        throw new HttpError(
          "The staff profile could not be updated. Please try again.",
          500,
        );
      }

      return json(
        {
          staff: data,
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
            "The staff profile could not be updated. Please try again.",
        },
        500,
      );
    }
  },
};