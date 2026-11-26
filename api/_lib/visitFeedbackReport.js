import { HttpError, json, readJsonBody } from "./http.js";
import { requireActiveStaff } from "./staffAuth.js";
import { getAdminClient } from "./supabase.js";
import { FEEDBACK_ASPECTS } from "../../src/constants/feedback.js";

// Visitor feedback for administrators and the client service head:
// average rating, a count per star, and the answers in a date range
// (Accra dates; Accra is UTC+0). Served from the dashboard function to
// stay inside the Vercel Hobby function limit.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 2000;

export const FEEDBACK_ROLES = Object.freeze(["admin", "client_service_head"]);

export function summariseFeedback(rows) {
  const distribution = [1, 2, 3, 4, 5].map((stars) => ({
    count: rows.filter((row) => row.rating === stars).length,
    stars,
  }));
  const total = rows.length;
  const sum = rows.reduce((value, row) => value + row.rating, 0);

  // Thumbs for each part of the visit; unanswered ones are left out.
  const aspects = FEEDBACK_ASPECTS.map(({ key, label }) => ({
    down: rows.filter((row) => row[`${key}_ok`] === false).length,
    key,
    label,
    up: rows.filter((row) => row[`${key}_ok`] === true).length,
  }));

  return {
    aspects,
    average: total ? Math.round((sum / total) * 10) / 10 : null,
    distribution,
    total,
  };
}

export async function handleFeedbackReport(request, { getAdminClientForRequest = getAdminClient, requireStaff = requireActiveStaff } = {}) {
  try {
    await requireStaff(request, FEEDBACK_ROLES);

    const body = await readJsonBody(request);
    const dateFrom = String(body?.dateFrom || "");
    const dateTo = String(body?.dateTo || "");

    if (!DATE.test(dateFrom) || !DATE.test(dateTo) || dateFrom > dateTo) {
      throw new HttpError("Choose a valid date range.", 400);
    }

    const from = `${dateFrom}T00:00:00.000Z`;
    const to = new Date(Date.parse(`${dateTo}T00:00:00.000Z`) + 86_400_000).toISOString();
    const client = getAdminClientForRequest();

    const [answered, requested] = await Promise.all([
      client
        .from("visit_feedback")
        .select("id, visit_id, rating, comment, submitted_at, highlights, check_in_ok, courtesy_ok, wayfinding_ok, contact_ok")
        .gte("submitted_at", from)
        .lt("submitted_at", to)
        .order("submitted_at", { ascending: false })
        .limit(MAX_ROWS),
      client
        .from("visit_feedback")
        .select("id", { count: "exact", head: true })
        .gte("created_at", from)
        .lt("created_at", to),
    ]);

    if (answered.error || requested.error) {
      throw new HttpError("Feedback could not be loaded. Please try again.", 500);
    }

    const rows = answered.data || [];
    const visitIds = [...new Set(rows.map((row) => row.visit_id))];
    const { data: visits, error: visitsError } = visitIds.length
      ? await client.from("visits").select("id, reference_code, tower").in("id", visitIds)
      : { data: [], error: null };

    if (visitsError) {
      throw new HttpError("Feedback could not be loaded. Please try again.", 500);
    }

    const byId = new Map((visits || []).map((visit) => [visit.id, visit]));

    return json(
      {
        feedback: rows.map((row) => ({
          checkInOk: row.check_in_ok ?? null,
          comment: row.comment || "",
          contactOk: row.contact_ok === true,
          courtesyOk: row.courtesy_ok ?? null,
          highlights: row.highlights || [],
          id: row.id,
          rating: row.rating,
          reference: byId.get(row.visit_id)?.reference_code || "",
          submittedAt: row.submitted_at,
          tower: byId.get(row.visit_id)?.tower || "",
          wayfindingOk: row.wayfinding_ok ?? null,
        })),
        requested: requested.count || 0,
        summary: summariseFeedback(rows),
      },
      200,
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status, error.status === 401 ? { "WWW-Authenticate": "Bearer" } : {});
    }

    return json({ error: "Feedback could not be loaded. Please try again." }, 500);
  }
}
