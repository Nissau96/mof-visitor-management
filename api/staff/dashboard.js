import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../_lib/http.js";
import { requireActiveStaff } from "../_lib/staffAuth.js";
import { getAdminClient } from "../_lib/supabase.js";
import { receptionDashboardSchema } from "../../src/validation/receptionDashboard.js";

const DASHBOARD_PAGE_SIZE = 10;

function isDashboardResult(value) {
  return (
    value &&
    typeof value === "object" &&
    value.stats &&
    typeof value.stats === "object" &&
    value.pagination &&
    typeof value.pagination === "object" &&
    Array.isArray(value.visitors)
  );
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      await requireActiveStaff(request);

      const requestBody = await readJsonBody(request);

      const parsed =
        receptionDashboardSchema.safeParse(
          requestBody,
        );

      if (!parsed.success) {
        return json(
          {
            error:
              "Check the dashboard filters and try again.",
          },
          400,
        );
      }

      const filters = parsed.data;

      const { data, error } =
        await getAdminClient().rpc(
          "get_reception_dashboard",
          {
            p_agency: filters.agency,
            p_division: filters.division,
            p_page: filters.page,
            p_page_size: DASHBOARD_PAGE_SIZE,
            p_search: filters.query,
          },
        );

      if (error || !isDashboardResult(data)) {
        return json(
          {
            error:
              "Dashboard information could not be loaded. Please try again.",
          },
          500,
        );
      }

      return json(data, 200);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          {
            error: error.message,
          },
          error.status,
          error.status === 401
            ? {
                "WWW-Authenticate": "Bearer",
              }
            : {},
        );
      }

      return json(
        {
          error:
            "Dashboard information could not be loaded. Please try again.",
        },
        500,
      );
    }
  },
};