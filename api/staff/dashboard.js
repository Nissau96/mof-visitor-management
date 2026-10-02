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

async function addVisitorDetails(client, visitors) {
  if (visitors.length === 0) {
    return visitors;
  }

  const visitIds = visitors.map(
    (visitor) => visitor.visitId,
  );

  const [
    visitsResult,
    assignmentsResult,
  ] = await Promise.all([
    client
      .from("visits")
      .select("id, visitor_id")
      .in("id", visitIds),

    client
      .from("visitor_card_assignments")
      .select("visit_id, card_id, status")
      .in("visit_id", visitIds),
  ]);

  if (
    visitsResult.error ||
    assignmentsResult.error
  ) {
    throw new HttpError(
      "Dashboard information could not be loaded. Please try again.",
      500,
    );
  }

  const profileIds = [
    ...new Set(
      (visitsResult.data || [])
        .map((visit) => visit.visitor_id)
        .filter(Boolean),
    ),
  ];

  const cardIds = [
    ...new Set(
      (assignmentsResult.data || [])
        .map((assignment) => assignment.card_id)
        .filter(Boolean),
    ),
  ];

  const [
    profilesResult,
    cardsResult,
  ] = await Promise.all([
    profileIds.length
      ? client
          .from("visitor_profiles")
          .select("id, email")
          .in("id", profileIds)
      : Promise.resolve({
          data: [],
          error: null,
        }),

    cardIds.length
      ? client
          .from("visitor_cards")
          .select("id, card_number, card_type")
          .in("id", cardIds)
      : Promise.resolve({
          data: [],
          error: null,
        }),
  ]);

  if (
    profilesResult.error ||
    cardsResult.error
  ) {
    throw new HttpError(
      "Dashboard information could not be loaded. Please try again.",
      500,
    );
  }

  const visitsById = new Map(
    (visitsResult.data || []).map(
      (visit) => [visit.id, visit],
    ),
  );

  const profilesById = new Map(
    (profilesResult.data || []).map(
      (profile) => [profile.id, profile],
    ),
  );

  const assignmentsByVisitId = new Map(
    (assignmentsResult.data || []).map(
      (assignment) => [
        assignment.visit_id,
        assignment,
      ],
    ),
  );

  const cardsById = new Map(
    (cardsResult.data || []).map(
      (card) => [card.id, card],
    ),
  );

  return visitors.map((visitor) => {
    const visit = visitsById.get(
      visitor.visitId,
    );

    const assignment =
      assignmentsByVisitId.get(
        visitor.visitId,
      );

    return {
      ...visitor,

      email:
        profilesById.get(
          visit?.visitor_id,
        )?.email || null,

      cardNumber:
        assignment?.status === "assigned"
          ? cardsById.get(
              assignment.card_id,
            )?.card_number || null
          : null,

      cardStatus:
        assignment?.status || null,

      visitorType:
        assignment?.status === "assigned"
          ? cardsById.get(
              assignment.card_id,
            )?.card_type || null
          : null,
    };
  });
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

      const visitors =
        await addVisitorDetails(
          client,
          data.visitors,
        );

      return json(
        {
          ...data,
          visitors,
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
          error:
            "Dashboard information could not be loaded. Please try again.",
        },
        500,
      );
    }
  },
};
