import { HttpError } from "./http.js";

const NOTIFICATION_LIMIT = 20;

const CARD_PROBLEM_STATUSES = [
  "not_returned",
  "investigating",
];

function readAccraDateParts(now) {
  // Africa/Accra is UTC+0 with no daylight saving time, so its calendar
  // boundaries can be expressed directly in UTC.
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "numeric",
      timeZone: "Africa/Accra",
      year: "numeric",
    })
      .formatToParts(now)
      .map((part) => [part.type, Number(part.value)]),
  );
}

export function getAccraDayStart(now = new Date()) {
  const parts = readAccraDateParts(now);

  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
}

// Monday 00:00 Accra time of the current week.
export function getAccraWeekStart(now = new Date()) {
  const dayStart = getAccraDayStart(now);
  const daysSinceMonday =
    (dayStart.getUTCDay() + 6) % 7;

  return new Date(
    dayStart.getTime() -
      daysSinceMonday * 86_400_000,
  );
}

export function getAccraMonthStart(now = new Date()) {
  const parts = readAccraDateParts(now);

  return new Date(
    Date.UTC(parts.year, parts.month - 1, 1),
  );
}

function failed() {
  return new HttpError(
    "Notifications could not be loaded. Please try again.",
    500,
  );
}

function scoped(query, column, towerScope) {
  return towerScope
    ? query.eq(column, towerScope)
    : query;
}

function visitNotification(kind, visit, sortAt) {
  return {
    id: `${kind}:${visit.id}`,
    kind,
    occurredAt: visit.occurredAt,
    reference: visit.reference_code,
    sortAt: new Date(sortAt).toISOString(),
    tower: visit.tower,
    visitorName:
      visit.visitor_profiles?.full_name ||
      "Unknown visitor",
  };
}

// Builds the bell feed from existing visit and card records; nothing is
// stored. Read/unread state is kept in the browser against `sortAt`.
export async function loadStaffNotifications({
  client,
  includeCardProblems,
  now = new Date(),
  towerScope,
}) {
  const dayStart =
    getAccraDayStart(now).toISOString();

  const [
    pendingResult,
    overstayResult,
    vipResult,
    cardResult,
  ] = await Promise.all([
    scoped(
      client
        .from("visits")
        .select(
          "id, reference_code, tower, created_at, visitor_profiles(full_name)",
        )
        .eq("status", "pending_admission"),
      "tower",
      towerScope,
    )
      .order("created_at", {
        ascending: false,
      })
      .limit(NOTIFICATION_LIMIT),

    scoped(
      client
        .from("visits")
        .select(
          "id, reference_code, tower, checked_in_at, visitor_profiles(full_name)",
        )
        .eq("status", "checked_in")
        .lt("checked_in_at", dayStart),
      "tower",
      towerScope,
    )
      .order("checked_in_at", {
        ascending: false,
      })
      .limit(NOTIFICATION_LIMIT),

    scoped(
      client
        .from("visitor_card_assignments")
        .select(
          "visit_id, visitor_cards!inner(card_type), visits!inner(id, reference_code, tower, checked_in_at, visitor_profiles(full_name))",
        )
        .eq("status", "assigned")
        .eq("visitor_cards.card_type", "vip")
        .gte("visits.checked_in_at", dayStart),
      "visits.tower",
      towerScope,
    ).limit(NOTIFICATION_LIMIT),

    includeCardProblems
      ? client
          .from("visitor_cards")
          .select("status, updated_at")
          .in("status", CARD_PROBLEM_STATUSES)
      : Promise.resolve({
          data: [],
          error: null,
        }),
  ]);

  if (
    pendingResult.error ||
    overstayResult.error ||
    vipResult.error ||
    cardResult.error
  ) {
    throw failed();
  }

  const notifications = [
    ...(pendingResult.data || []).map((visit) =>
      visitNotification(
        "pending_admission",
        {
          ...visit,
          occurredAt: visit.created_at,
        },
        visit.created_at,
      ),
    ),

    // An overstay becomes news at the start of the day it is noticed,
    // not when the visitor originally checked in.
    ...(overstayResult.data || []).map((visit) =>
      visitNotification(
        "overstay",
        {
          ...visit,
          occurredAt: visit.checked_in_at,
        },
        dayStart,
      ),
    ),

    ...(vipResult.data || [])
      .filter((assignment) => assignment.visits)
      .map((assignment) =>
        visitNotification(
          "vip_arrival",
          {
            ...assignment.visits,
            occurredAt:
              assignment.visits.checked_in_at,
          },
          assignment.visits.checked_in_at,
        ),
      ),
  ];

  for (const status of CARD_PROBLEM_STATUSES) {
    const cards = (cardResult.data || []).filter(
      (card) => card.status === status,
    );

    if (cards.length === 0) {
      continue;
    }

    const latest = cards
      .map((card) => card.updated_at)
      .sort()
      .at(-1);

    notifications.push({
      count: cards.length,
      id: `card_problem:${status}`,
      kind: "card_problem",
      occurredAt: latest,
      sortAt: new Date(latest).toISOString(),
      status,
    });
  }

  notifications.sort((first, second) =>
    second.sortAt.localeCompare(first.sortAt),
  );

  return notifications.slice(
    0,
    NOTIFICATION_LIMIT,
  );
}
