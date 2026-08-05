import { requireActiveStaff } from "../../_lib/staffAuth.js";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../../_lib/http.js";
import { getAdminClient } from "../../_lib/supabase.js";
import { adminHostListSchema } from "../../../src/validation/adminManagement.js";

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      await requireActiveStaff(
        request,
        ["admin"],
      );

      const body = await readJsonBody(request);

      const parsed =
        adminHostListSchema.safeParse(body);

      if (!parsed.success) {
        throw new HttpError(
          "The host-list request is invalid.",
          400,
        );
      }

      const { data, error } =
        await getAdminClient().rpc(
          "get_admin_hosts",
          {
            p_active: parsed.data.status,
            p_page: parsed.data.page,
            p_page_size:
              parsed.data.pageSize,
            p_search: parsed.data.search,
          },
        );

      if (error) {
        if (error.code === "22023") {
          throw new HttpError(
            "The host-list filters are invalid.",
            400,
          );
        }

        throw new HttpError(
          "Host records could not be loaded. Please try again.",
          500,
        );
      }

      return json(
        {
          hosts: Array.isArray(data?.hosts)
            ? data.hosts
            : [],
          pagination: data?.pagination || {
            page: 1,
            pageSize: 10,
            totalCount: 0,
            totalPages: 0,
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
            "Host records could not be loaded. Please try again.",
        },
        500,
      );
    }
  },
};