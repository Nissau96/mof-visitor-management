// Visitor feedback choices, shared by the feedback form, the API and the
// staff Feedback page. Keys match the database check in
// supabase/migrations/20261126090000_visit_feedback_details.sql.

export const RATING_WORDS = Object.freeze(["", "Very poor", "Poor", "Okay", "Good", "Excellent"]);

// Ratings of 1-2 ask what went wrong; 3-5 ask what stood out.
export const LOW_RATING_MAX = 2;

export const PRAISE_HIGHLIGHTS = Object.freeze([
  { key: "quick_check_in", label: "Quick check-in" },
  { key: "friendly_staff", label: "Friendly reception staff" },
  { key: "easy_to_find", label: "Easy to find the office" },
  { key: "card_ready", label: "Visitor card was ready" },
  { key: "on_time", label: "Meeting started on time" },
  { key: "clean", label: "Clean and comfortable" },
  { key: "clear_directions", label: "Clear directions" },
]);

export const PROBLEM_HIGHLIGHTS = Object.freeze([
  { key: "long_wait", label: "Long wait at reception" },
  { key: "unhelpful_staff", label: "Staff were not helpful" },
  { key: "hard_to_find", label: "Hard to find the office" },
  { key: "card_slow", label: "Visitor card took too long" },
  { key: "meeting_late", label: "Meeting started late" },
  { key: "uncomfortable", label: "Waiting area was uncomfortable" },
  { key: "unclear_directions", label: "Directions were unclear" },
]);

export const HIGHLIGHT_LABELS = Object.freeze(
  Object.fromEntries(
    [...PRAISE_HIGHLIGHTS, ...PROBLEM_HIGHLIGHTS].map(({ key, label }) => [key, label]),
  ),
);

export const FEEDBACK_ASPECTS = Object.freeze([
  { field: "checkInOk", hint: "From arriving to getting your card", key: "check_in", label: "Check-in speed" },
  { field: "courtesyOk", hint: "Reception and security staff", key: "courtesy", label: "Staff courtesy" },
  { field: "wayfindingOk", hint: "Signs, directions and floors", key: "wayfinding", label: "Finding your way" },
]);

export const FEEDBACK_COMMENT_LIMIT = 1000;
