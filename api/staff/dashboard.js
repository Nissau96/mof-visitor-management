import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../_lib/http.js";
import {
  requireActiveStaff,
  requireStaffTowerScope,
} from "../_lib/staffAuth.js";
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

function getDashboardDatabaseError(error) {
  if (error?.code === "42501") {
    return new HttpError(
      "You are not authorised to view records for the selected tower.",
      403,
    );
  }

  if (
    error?.code === "22023" ||
    error?.code === "22P02"
  ) {
    return new HttpError(
      "Check the dashboard filters and try again.",
      400,
    );
  }

  return new HttpError(
    "Dashboard information could not be loaded. Please try again.",
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

      const requestBody =
        await readJsonBody(request);

      const parsed =
        receptionDashboardSchema.safeParse(
          requestBody,
        );

      if (!parsed.success) {
        throw new HttpError(
          "Check the dashboard filters and try again.",
          400,
        );
      }

      const filters = parsed.data;

      const towerScope =
        requireStaffTowerScope(
          profile,
          filters.tower,
        );

      const { data, error } =
        await getAdminClient().rpc(
          "get_reception_dashboard",
          {
            p_actor_id: profile.userId,
            p_agency: filters.agency,
            p_division: filters.division,
            p_page: filters.page,
            p_page_size:
              DASHBOARD_PAGE_SIZE,
            p_search: filters.query,
            p_tower: towerScope,
          },
        );

      if (error) {
        throw getDashboardDatabaseError(
          error,
        );
      }

      if (!isDashboardResult(data)) {
        throw new HttpError(
          "Dashboard information could not be loaded. Please try again.",
          500,
        );
      }

      return json(
        {
          ...data,
          staffRole:
            data.staffRole || profile.role,
          towerScope:
            data.towerScope ??
            towerScope ??
            null,
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