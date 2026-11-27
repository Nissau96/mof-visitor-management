// Which side-menu item shows which attention count, and its urgency.
// "waiting": work queued for reception (amber).
// "problem": something has gone wrong and needs chasing (red).
export const NAV_BADGE_SOURCES = Object.freeze({
  // Visitors waiting for admission plus meeting bookings waiting for a
  // decision: both are queued on the dashboard.
  "/staff": { keys: ["pendingAdmissions", "bookingRequests"], tone: "waiting" },
  "/staff/admin/cards": { keys: ["cardProblems"], tone: "problem" },
  "/staff/cards": { keys: ["awaitingCard"], tone: "waiting" },
  "/staff/history": { keys: ["overstays"], tone: "problem" },
  // Wi-Fi requests the IT network team has not answered yet.
  "/staff/wifi": { keys: ["wifiWaiting"], tone: "waiting" },
});

// { count, tone } for a menu path, or null when there is nothing to
// show (no source, not loaded, or zero).
export function navBadgeFor(counts, path) {
  const source = NAV_BADGE_SOURCES[path];

  if (!source || !counts) {
    return null;
  }

  const values = source.keys
    .map((key) => counts[key])
    .filter((value) => Number.isInteger(value));
  const count = values.reduce((total, value) => total + value, 0);

  return values.length && count > 0 ? { count, tone: source.tone } : null;
}

export function formatBadgeCount(count) {
  return count > 99 ? "99+" : String(count);
}

// The most urgent badge among the given menu paths, for the phone menu
// button: "problem" beats "waiting".
export function mostUrgentBadgeTone(counts, paths) {
  const tones = paths
    .map((path) => navBadgeFor(counts, path)?.tone)
    .filter(Boolean);

  if (tones.includes("problem")) {
    return "problem";
  }

  return tones.includes("waiting") ? "waiting" : null;
}

// Amber for work waiting on reception, red for problems to chase.
export const BADGE_TONES = Object.freeze({
  problem: {
    dot: "bg-red-600",
    pill: "bg-red-700 text-white",
  },
  waiting: {
    dot: "bg-amber-500",
    pill: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  },
});
