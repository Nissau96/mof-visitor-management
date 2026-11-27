import { HttpError } from "./http.js";

async function readBookedVisitIds(client, visitIds) {
  try {
    const { data, error } = await client
      .from("visitor_invites")
      .select("visit_id")
      .in("visit_id", visitIds);

    return new Set(
      error || !Array.isArray(data)
        ? []
        : data.map((invite) => invite.visit_id),
    );
  } catch {
    return new Set();
  }
}

// Adds visitor email plus card number/type to visit rows. Only assignments
// whose status is in `cardStatuses` count: the dashboard shows cards still
// held, while history also shows cards that were returned.
export async function addVisitorDetails(
  client,
  visitors,
  {
    cardStatuses = ["assigned"],
  } = {},
) {
  if (visitors.length === 0) {
    return visitors;
  }

  const visitIds = visitors.map(
    (visitor) => visitor.visitId,
  );

  const [
    visitsResult,
    assignmentsResult,
    invitesResult,
  ] = await Promise.all([
    client
      .from("visits")
      .select("id, visitor_id, booking_guest_id")
      .in("id", visitIds),

    client
      .from("visitor_card_assignments")
      .select("visit_id, card_id, status")
      .in("visit_id", visitIds),

    // Visits booked through a visitor link. Only a display hint, so a
    // failed lookup leaves the flag off rather than failing the list.
    readBookedVisitIds(client, visitIds),
  ]);

  if (
    visitsResult.error ||
    assignmentsResult.error
  ) {
    throw new HttpError(
      "Visit details could not be loaded. Please try again.",
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
      "Visit details could not be loaded. Please try again.",
      500,
    );
  }

  const bookedVisitIds = invitesResult;

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
        cardStatuses.includes(assignment?.status)
          ? cardsById.get(
              assignment.card_id,
            )?.card_number || null
          : null,

      cardStatus:
        assignment?.status || null,

      // Pre-registered through a meeting booking.
      bookedGuest: Boolean(
        visit?.booking_guest_id,
      ),

      // Booked by the visitor through a visitor link.
      bookedVisit: bookedVisitIds.has(
        visitor.visitId,
      ),

      visitorType:
        cardStatuses.includes(assignment?.status)
          ? cardsById.get(
              assignment.card_id,
            )?.card_type || null
          : null,
    };
  });
}
