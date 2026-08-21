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
import { getAdminClient } from "../_lib/supabase.js";
import { visitHistorySchema } from "../../src/validation/staffVisits.js";

function normalizePagination(pagination) {
  return {
    page: Number(pagination?.page) || 1,
    pageSize: Math.min(
      10,
      Math.max(
        1,
        Number(pagination?.pageSize) || 10,
      ),
    ),
    totalCount: Math.max(
      0,
      Number(pagination?.totalCount) || 0,
    ),
    totalPages: Math.max(
      0,
      Number(pagination?.totalPages) || 0,
    ),
  };
}

function getHistoryDatabaseError(error) {
  if (error?.code === "42501") {
    return new HttpError(
      "You are not authorised to view history for the selected tower.",
      403,
    );
  }

  if (
    error?.code === "22023" ||
    error?.code === "22P02"
  ) {
    return new HttpError(
      "The visit-history filters are invalid.",
      400,
    );
  }

  return new HttpError(
    "Visit history could not be loaded. Please try again.",
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

      const body =
        await readJsonBody(request);

      const parsed =
        visitHistorySchema.safeParse(body);

      if (!parsed.success) {
        throw new HttpError(
          "The visit-history request is invalid.",
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
          "get_visit_history",
          {
            p_actor_id: profile.userId,
            p_agency: filters.agency,
            p_date_from: filters.dateFrom,
            p_date_to: filters.dateTo,
            p_division: filters.division,
            p_page: filters.page,
            p_page_size: filters.pageSize,
            p_search: filters.search,
            p_status: filters.status,
            p_tower: towerScope,
          },
        );

      if (error) {
        throw getHistoryDatabaseError(error);
      }

      return json(
        {
          generatedAt:
            data?.generatedAt || null,
          pagination: normalizePagination(
            data?.pagination,
          ),
          staffRole:
            data?.staffRole || profile.role,
          towerScope:
            data?.towerScope ??
            towerScope ??
            null,
          visits: Array.isArray(data?.visits)
            ? data.visits
            : [],
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
            "Visit history could not be loaded. Please try again.",
        },
        500,
      );
    }
  },
};