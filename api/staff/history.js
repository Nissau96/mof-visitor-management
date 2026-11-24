import { withAuditContext } from "../_lib/auditContext.js";
import {
  recordAuditEvent,
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
import { addVisitorDetails } from "../_lib/visitDetails.js";
import {
  HISTORY_EXPORT_LIMIT,
  visitHistorySchema,
} from "../../src/validation/staffVisits.js";

function normalizePagination(pagination, maxPageSize) {
  return {
    page: Number(pagination?.page) || 1,
    pageSize: Math.min(
      maxPageSize,
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

// WhatsApp and SMS messages sent about one visit, for the visit drawer.
// The visit must be in the staff member's tower; no message text exists.
async function listVisitMessages(body, profile) {
  const reference = String(body?.reference || "").trim().toUpperCase();

  if (!/^[A-Z0-9-]{4,32}$/.test(reference)) {
    throw new HttpError("The visit reference is invalid.", 400);
  }

  const towerScope = requireStaffTowerScope(profile, body?.tower);
  const client = getAdminClient();
  const { data: visit, error: visitError } = await client
    .from("visits")
    .select("tower")
    .eq("reference_code", reference)
    .maybeSingle();

  if (visitError) {
    throw new HttpError("Messages could not be loaded. Please try again.", 500);
  }

  if (!visit || (towerScope && visit.tower !== towerScope)) {
    throw new HttpError("The visit could not be found.", 404);
  }

  const { data, error } = await client
    .from("notification_log")
    .select("id, purpose, channel, status, error, fallback_of, created_at, updated_at")
    .eq("reference_code", reference)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new HttpError("Messages could not be loaded. Please try again.", 500);
  }

  return (data || []).map((row) => ({
    channel: row.channel,
    createdAt: row.created_at,
    error: row.error,
    fallbackOf: row.fallback_of,
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    updatedAt: row.updated_at,
  }));
}

const handler = {
  async fetch(request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const { profile } =
        await requireActiveStaff(
          request,
          [
            "receptionist",
            "admin",
          ],
        );

      const body =
        await readJsonBody(request);

      if (
        new URL(request.url).searchParams.get("operation") === "messages"
      ) {
        return json({ messages: await listVisitMessages(body, profile) }, 200);
      }

      const parsed =
        visitHistorySchema.safeParse(body);

      if (!parsed.success) {
        throw new HttpError(
          "The visit-history request is invalid.",
          400,
        );
      }

      // /api/staff/history/export returns every matching row (up to the
      // export limit) for the CSV download; otherwise one page of ten.
      const exporting =
        new URL(request.url).searchParams.get(
          "operation",
        ) === "export";

      const filters = exporting
        ? {
            ...parsed.data,
            page: 1,
            pageSize: HISTORY_EXPORT_LIMIT,
          }
        : parsed.data;

      const towerScope =
        requireStaffTowerScope(
          profile,
          filters.tower,
        );

      const client = getAdminClient();

      const { data, error } =
        await client.rpc(
          "get_visit_history",
          {
            p_actor_id: profile.userId,
            p_agency: filters.agency,
            p_date_from: filters.dateFrom,
            p_date_basis: filters.dateBasis,
            p_date_to: filters.dateTo,
            p_direction: filters.direction,
            p_division: filters.division,
            p_page: filters.page,
            p_page_size: filters.pageSize,
            p_purpose: filters.purpose,
            p_search: filters.search,
            p_sort: filters.sort,
            p_status: filters.status,
            p_tower: towerScope,
          },
        );

      if (error) {
        throw getHistoryDatabaseError(error);
      }

      if (exporting) {
        // Exports are sensitive events. The search text can hold a
        // visitor's name, so only whether one was used is kept.
        await recordAuditEvent(client, {
          action: "visit_history.exported",
          actorId: profile.userId,
          details: {
            agency: filters.agency || undefined,
            dateBasis: filters.dateBasis,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            purpose: filters.purpose || undefined,
            rows: Array.isArray(data?.visits) ? data.visits.length : 0,
            searched: Boolean(filters.search),
            status: filters.status || undefined,
            tower: towerScope || undefined,
          },
          entityType: "export",
        });
      }

      // Returned and unreturned cards still identify the visit, so history
      // shows them; only cards never issued read as "Not assigned".
      const visits = await addVisitorDetails(
        client,
        Array.isArray(data?.visits)
          ? data.visits
          : [],
        {
          cardStatuses: [
            "assigned",
            "returned",
            "not_returned",
            "deactivated",
          ],
        },
      );

      return json(
        {
          generatedAt:
            data?.generatedAt || null,
          pagination: normalizePagination(
            data?.pagination,
            exporting ? HISTORY_EXPORT_LIMIT : 10,
          ),
          staffRole:
            data?.staffRole || profile.role,
          towerScope:
            data?.towerScope ??
            towerScope ??
            null,
          visits,
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

export default withAuditContext(handler);
