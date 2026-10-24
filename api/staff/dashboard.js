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
import {
  getAccraDayStart,
  getAccraMonthStart,
  getAccraWeekStart,
  loadStaffNotifications,
} from "../_lib/staffNotifications.js";
import { getAdminClient } from "../_lib/supabase.js";
import { addVisitorDetails } from "../_lib/visitDetails.js";
import { VISIT_TOWER_VALUES } from "../../src/constants/visitorOptions.js";
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

// Administrators see the month total across all towers regardless of the
// selected tower tab; receptionists only see their signed-in tower.
async function countVisitsThisMonth(
  client,
  towerScope,
) {
  let query = client
    .from("visits")
    .select("id", {
      count: "exact",
      head: true,
    })
    .gte(
      "checked_in_at",
      getAccraMonthStart().toISOString(),
    );

  if (towerScope) {
    query = query.eq("tower", towerScope);
  }

  const { count, error } = await query;

  if (error) {
    throw new HttpError(
      "Dashboard information could not be loaded. Please try again.",
      500,
    );
  }

  return count || 0;
}

const DAY_MS = 86_400_000;

function failedDashboard() {
  return new HttpError(
    "Dashboard information could not be loaded. Please try again.",
    500,
  );
}

// Check-ins per day, Monday to Sunday of the current Accra week. Days
// after today are returned with a null count instead of being queried.
async function countWeeklyArrivals(
  client,
  towerScope,
) {
  const weekStart =
    getAccraWeekStart().getTime();

  const todayStart =
    getAccraDayStart().getTime();

  return Promise.all(
    Array.from({ length: 7 }, async (_, index) => {
      const start = weekStart + index * DAY_MS;
      const date = new Date(start)
        .toISOString()
        .slice(0, 10);

      if (start > todayStart) {
        return {
          count: null,
          date,
        };
      }

      let query = client
        .from("visits")
        .select("id", {
          count: "exact",
          head: true,
        })
        .gte(
          "checked_in_at",
          new Date(start).toISOString(),
        )
        .lt(
          "checked_in_at",
          new Date(start + DAY_MS).toISOString(),
        );

      if (towerScope) {
        query = query.eq("tower", towerScope);
      }

      const { count, error } = await query;

      if (error) {
        throw failedDashboard();
      }

      return {
        count: count || 0,
        date,
      };
    }),
  );
}

async function countAssignedActiveVisits(
  client,
  towerScope,
) {
  let query = client
    .from("visitor_card_assignments")
    .select("visit_id, visits!inner(status, tower)", {
      count: "exact",
      head: true,
    })
    .eq("status", "assigned")
    .eq("visits.status", "checked_in");

  if (towerScope) {
    query = query.eq("visits.tower", towerScope);
  }

  const { count, error } = await query;

  if (error) {
    throw failedDashboard();
  }

  return count || 0;
}

function errorResponse(error, fallbackMessage) {
  if (error instanceof HttpError) {
    return json(
      {
        error: error.message,
      },
      error.status,
      error.status === 401
        ? {
            "WWW-Authenticate":
              "Bearer",
          }
        : {},
    );
  }

  return json(
    {
      error: fallbackMessage,
    },
    500,
  );
}

function isNotificationsRequest(request) {
  const url = new URL(request.url);

  return (
    url.searchParams.get("operation") ===
      "notifications" ||
    url.pathname.replace(/\/+$/, "") ===
      "/api/staff/notifications"
  );
}

// Served from this function (via a rewrite) rather than its own file to
// stay inside the Vercel Hobby serverless-function limit.
async function handleNotifications(request) {
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

    const tower =
      typeof body?.tower === "string"
        ? body.tower
        : "";

    if (
      tower &&
      !VISIT_TOWER_VALUES.includes(tower)
    ) {
      throw new HttpError(
        "Select a valid tower.",
        400,
      );
    }

    const administrator =
      profile.role === "admin";

    // Receptionists are pinned to their signed-in tower; administrators
    // are notified about every tower regardless of the selected tab.
    const towerScope = administrator
      ? null
      : requireStaffTowerScope(
          profile,
          tower,
        );

    const notifications =
      await loadStaffNotifications({
        client: getAdminClient(),
        includeCardProblems:
          administrator,
        towerScope,
      });

    return json(
      {
        generatedAt:
          new Date().toISOString(),
        notifications,
      },
      200,
    );
  } catch (error) {
    return errorResponse(
      error,
      "Notifications could not be loaded. Please try again.",
    );
  }
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    if (isNotificationsRequest(request)) {
      return handleNotifications(request);
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

      const client = getAdminClient();

      const { data, error } =
        await client.rpc(
          "get_reception_dashboard",
          {
            p_actor_id:
              profile.userId,
            p_agency:
              filters.agency,
            p_division:
              filters.division,
            p_page:
              filters.page,
            p_page_size:
              DASHBOARD_PAGE_SIZE,
            p_search:
              filters.query,
            p_tower:
              towerScope,
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

      const [
        visitors,
        checkedInThisMonth,
        weeklyArrivals,
        assignedCards,
      ] = await Promise.all([
        // Unreturned cards still identify the visit, so the checked-in
        // table can name the card that needs incident action.
        addVisitorDetails(
          client,
          data.visitors,
          {
            cardStatuses: [
              "assigned",
              "not_returned",
            ],
          },
        ),
        countVisitsThisMonth(
          client,
          profile.role === "admin"
            ? null
            : towerScope,
        ),
        countWeeklyArrivals(
          client,
          towerScope,
        ),
        countAssignedActiveVisits(
          client,
          towerScope,
        ),
      ]);

      const activeVisits =
        Number(data.stats.active) || 0;

      return json(
        {
          ...data,
          cardAssignment: {
            assigned: Math.min(
              assignedCards,
              activeVisits,
            ),
            notAssigned: Math.max(
              activeVisits - assignedCards,
              0,
            ),
          },
          stats: {
            ...data.stats,
            checkedInThisMonth,
          },
          visitors,
          weeklyArrivals,
          staffRole:
            data.staffRole ||
            profile.role,
          towerScope:
            data.towerScope ??
            towerScope ??
            null,
        },
        200,
      );
    } catch (error) {
      return errorResponse(
        error,
        "Dashboard information could not be loaded. Please try again.",
      );
    }
  },
};
