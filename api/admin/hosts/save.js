import { requireActiveStaff } from "../../_lib/staffAuth.js";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../../_lib/http.js";
import { getAdminClient } from "../../_lib/supabase.js";
import { adminHostSaveSchema } from "../../../src/validation/adminManagement.js";

function getHostDatabaseError(error) {
  if (error?.code === "P0002") {
    return new HttpError(
      "The host record could not be found.",
      404,
    );
  }

  if (error?.code === "42501") {
    return new HttpError(
      "Administrator access is required.",
      403,
    );
  }

  if (
    error?.code === "22023" ||
    error?.code === "23514"
  ) {
    return new HttpError(
      "The host information is invalid.",
      400,
    );
  }

  return new HttpError(
    "The host record could not be saved. Please try again.",
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
        adminHostSaveSchema.safeParse(body);

      if (!parsed.success) {
        throw new HttpError(
          "The host information is invalid.",
          400,
        );
      }

      const { data, error } =
        await getAdminClient().rpc(
          "save_admin_host",
          {
            p_active: parsed.data.active,
            p_actor_id: profile.userId,
            p_department:
              parsed.data.department,
            p_full_name:
              parsed.data.fullName,
            p_host_id: parsed.data.hostId,
          },
        );

      if (error) {
        throw getHostDatabaseError(error);
      }

      if (
        !data?.hostId ||
        !data?.fullName ||
        !data?.department
      ) {
        throw new HttpError(
          "The host record could not be saved. Please try again.",
          500,
        );
      }

      return json(
        {
          host: data,
        },
        parsed.data.hostId ? 200 : 201,
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
            "The host record could not be saved. Please try again.",
        },
        500,
      );
    }
  },
};