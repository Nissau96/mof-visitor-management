import { requireActiveStaff } from "../_lib/staffAuth.js";
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

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      await requireActiveStaff(request);

      const body = await readJsonBody(request);

      const parsed =
        visitHistorySchema.safeParse(body);

      if (!parsed.success) {
        throw new HttpError(
          "The visit-history request is invalid.",
          400,
        );
      }

      const filters = parsed.data;

      const { data, error } =
        await getAdminClient().rpc(
          "get_visit_history",
          {
            p_agency: filters.agency,
            p_date_from: filters.dateFrom,
            p_date_to: filters.dateTo,
            p_division: filters.division,
            p_page: filters.page,
            p_page_size: filters.pageSize,
            p_search: filters.search,
            p_status: filters.status,
          },
        );

      if (error) {
        if (error.code === "22023") {
          throw new HttpError(
            "The visit-history filters are invalid.",
            400,
          );
        }

        throw new HttpError(
          "Visit history could not be loaded. Please try again.",
          500,
        );
      }

      return json(
        {
          generatedAt:
            data?.generatedAt || null,
          pagination: normalizePagination(
            data?.pagination,
          ),
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