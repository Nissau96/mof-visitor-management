import { BADGE_TONES, formatBadgeCount } from "../lib/navBadges.js";

// A count of work still to do on a page: a number in the full menu, a
// dot on the icon when the menu is collapsed to icons. Screen readers
// hear "<label>, 3 need attention". The parent link must be relative.
export default function SidebarBadge({ badge, collapsed }) {
  if (!badge) {
    return null;
  }

  const tone = BADGE_TONES[badge.tone];

  return (
    <>
      <span className="sr-only">, {badge.count} need attention</span>
      <span
        aria-hidden="true"
        className={`ml-auto grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-black tabular-nums ${tone.pill} ${collapsed ? "lg:hidden" : ""}`}
      >
        {formatBadgeCount(badge.count)}
      </span>
      {collapsed ? (
        <span
          aria-hidden="true"
          className={`absolute right-2.5 top-1.5 hidden size-2.5 rounded-full ring-2 ring-white lg:block ${tone.dot}`}
          data-testid="sidebar-badge-dot"
        />
      ) : null}
    </>
  );
}
