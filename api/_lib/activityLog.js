import { HttpError, json, readJsonBody } from "./http.js";
import { recordAuditEvent, requireActiveStaff } from "./staffAuth.js";
import { getAdminClient } from "./supabase.js";
import {
  ACTIVITY_EXPORT_LIMIT,
  activityLogSchema,
} from "../../src/validation/activityLog.js";

// Admin Activity Log: one page of events (activity-list) or every
// matching event for the CSV (activity-export, itself logged).

function toDatabaseError(error) {
  if (error?.code === "42501") {
    return new HttpError("Only administrators can read the activity log.", 403);
  }

  if (error?.code === "22023" || error?.code === "22P02") {
    return new HttpError("The activity log filters are invalid.", 400);
  }

  return new HttpError("The activity log could not be loaded. Please try again.", 500);
}

async function loadActivity(request, { exporting, getAdminClientForRequest, requireActiveStaffForRequest }) {
  const { profile } = await requireActiveStaffForRequest(request, ["admin"]);
  const parsed = activityLogSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    throw new HttpError(parsed.error.issues[0]?.message || "The activity log request is invalid.", 400);
  }

  const filters = parsed.data;
  const client = getAdminClientForRequest();

  const { data, error } = await client.rpc("get_activity_log", {
    p_actor_id: profile.userId,
    p_category: filters.category,
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
    p_page: exporting ? 1 : filters.page,
    p_page_size: exporting ? ACTIVITY_EXPORT_LIMIT : filters.pageSize,
    p_result: filters.result,
    p_role: filters.role,
    p_search: filters.search,
    p_tower: filters.tower,
    p_user_id: filters.userId || null,
  });

  if (error) {
    throw toDatabaseError(error);
  }

  if (exporting) {
    await recordAuditEvent(client, {
      action: "activity_log.exported",
      actorId: profile.userId,
      details: {
        category: filters.category || undefined,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        result: filters.result || undefined,
        role: filters.role || undefined,
        rows: Array.isArray(data?.events) ? data.events.length : 0,
        searched: Boolean(filters.search),
        tower: filters.tower || undefined,
      },
      entityType: "export",
    });
  }

  return json(
    {
      events: Array.isArray(data?.events) ? data.events : [],
      generatedAt: data?.generatedAt || null,
      pagination: data?.pagination || { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 },
      stats: data?.stats || null,
      users: Array.isArray(data?.users) ? data.users : [],
    },
    200,
  );
}

export function handleActivityList(
  request,
  { getAdminClientForRequest = getAdminClient, requireActiveStaffForRequest = requireActiveStaff } = {},
) {
  return loadActivity(request, { exporting: false, getAdminClientForRequest, requireActiveStaffForRequest });
}

export function handleActivityExport(
  request,
  { getAdminClientForRequest = getAdminClient, requireActiveStaffForRequest = requireActiveStaff } = {},
) {
  return loadActivity(request, { exporting: true, getAdminClientForRequest, requireActiveStaffForRequest });
}
