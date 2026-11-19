import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadStaffAttentionCounts } from "../../api/_lib/staffNotifications.js";
import SidebarBadge from "../../src/components/SidebarBadge.jsx";
import { readAttentionCounts } from "../../src/hooks/useStaffNotifications.js";
import {
  formatBadgeCount,
  mostUrgentBadgeTone,
  navBadgeFor,
} from "../../src/lib/navBadges.js";

// Stand-in for the Supabase query builder: filters are recorded and each
// query resolves to the next canned { count } for its table.
function createClient(countsByTable) {
  const calls = [];

  return {
    calls,
    from(table) {
      const query = {
        filters: [],
        table,
        then(resolve, reject) {
          return Promise.resolve(countsByTable[table].shift()).then(resolve, reject);
        },
      };

      for (const method of ["select", "eq", "lt", "gte", "in"]) {
        query[method] = (...args) => {
          query.filters.push([method, ...args]);
          return query;
        };
      }

      calls.push(query);
      return query;
    },
  };
}

const NOW = new Date("2026-11-18T10:00:00.000Z");
const ok = (count) => ({ count, error: null });

function standardClient() {
  return createClient({
    meeting_bookings: [ok(2)],
    visitor_card_assignments: [ok(3)],
    visitor_cards: [ok(4)],
    // pending admissions, overstays, checked in today
    visits: [ok(5), ok(1), ok(7)],
  });
}

describe("attention counts", () => {
  it("counts each kind of work and what is still waiting for a card", async () => {
    const counts = await loadStaffAttentionCounts({
      client: standardClient(),
      includeCardProblems: true,
      now: NOW,
      towerScope: null,
    });

    expect(counts).toEqual({
      awaitingCard: 4,
      bookingRequests: 2,
      cardProblems: 4,
      overstays: 1,
      pendingAdmissions: 5,
    });
  });

  it("applies the rules and the tower to every query", async () => {
    const client = standardClient();

    await loadStaffAttentionCounts({
      client,
      includeCardProblems: true,
      now: NOW,
      towerScope: "tower_2",
    });

    const filtersOf = (table, index = 0) =>
      client.calls.filter((call) => call.table === table)[index].filters;
    const dayStart = "2026-11-18T00:00:00.000Z";

    expect(filtersOf("visits", 0)).toContainEqual(["eq", "status", "pending_admission"]);
    expect(filtersOf("visits", 1)).toContainEqual(["lt", "checked_in_at", dayStart]);
    expect(filtersOf("visits", 2)).toContainEqual(["gte", "checked_in_at", dayStart]);
    expect(filtersOf("meeting_bookings")).toEqual(
      expect.arrayContaining([
        ["eq", "status", "pending"],
        ["gte", "meeting_date", "2026-11-18"],
        ["eq", "tower", "tower_2"],
      ]),
    );
    expect(filtersOf("visitor_card_assignments")).toContainEqual(["eq", "visits.tower", "tower_2"]);
    expect(filtersOf("visitor_cards")).toEqual(
      expect.arrayContaining([
        ["in", "status", ["not_returned", "investigating"]],
        ["eq", "tower", "tower_2"],
      ]),
    );
  });

  it("leaves card problems out for receptionists", async () => {
    const client = standardClient();
    const counts = await loadStaffAttentionCounts({
      client,
      includeCardProblems: false,
      now: NOW,
      towerScope: "tower_2",
    });

    expect(counts.cardProblems).toBeNull();
    expect(client.calls.some((call) => call.table === "visitor_cards")).toBe(false);
  });

  it("fails rather than reporting a wrong count", async () => {
    const client = createClient({
      meeting_bookings: [{ count: null, error: { message: "boom" } }],
      visitor_card_assignments: [ok(0)],
      visitor_cards: [ok(0)],
      visits: [ok(0), ok(0), ok(0)],
    });

    await expect(
      loadStaffAttentionCounts({ client, includeCardProblems: true, now: NOW, towerScope: null }),
    ).rejects.toThrow("Notifications could not be loaded");
  });
});

describe("side-menu badges", () => {
  const counts = readAttentionCounts({
    awaitingCard: 0,
    bookingRequests: 3,
    cardProblems: "x",
    overstays: 2,
    pendingAdmissions: 120,
  });

  it("keeps only whole, non-negative counts", () => {
    expect(counts.cardProblems).toBeNull();
    expect(readAttentionCounts(undefined).pendingAdmissions).toBeNull();
  });

  it("maps menu items to counts and urgency", () => {
    // Dashboard: visitors waiting plus booking requests waiting.
    expect(navBadgeFor(counts, "/staff")).toEqual({ count: 123, tone: "waiting" });
    expect(navBadgeFor(counts, "/staff/meetings")).toBeNull();
    expect(navBadgeFor(counts, "/staff/history")).toEqual({ count: 2, tone: "problem" });
    expect(navBadgeFor(counts, "/staff/cards")).toBeNull();
    expect(navBadgeFor(counts, "/staff/reports")).toBeNull();
    expect(navBadgeFor(null, "/staff")).toBeNull();
    expect(formatBadgeCount(120)).toBe("99+");
  });

  it("gives the phone menu button the most urgent colour", () => {
    const paths = ["/staff", "/staff/history", "/staff/cards"];

    expect(mostUrgentBadgeTone(counts, paths)).toBe("problem");
    expect(mostUrgentBadgeTone(counts, ["/staff"])).toBe("waiting");
    expect(mostUrgentBadgeTone(null, paths)).toBeNull();
  });

  it("shows a number, and a dot when the menu is collapsed", () => {
    const { container, rerender } = render(
      <a href="/staff/meetings">
        Meetings
        <SidebarBadge badge={{ count: 3, tone: "waiting" }} collapsed={false} />
      </a>,
    );

    expect(screen.getByRole("link", { name: "Meetings, 3 need attention" })).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(container.querySelector("[data-testid='sidebar-badge-dot']")).toBeNull();

    rerender(
      <a href="/staff/meetings">
        Meetings
        <SidebarBadge badge={{ count: 3, tone: "waiting" }} collapsed />
      </a>,
    );

    expect(container.querySelector("[data-testid='sidebar-badge-dot']")).not.toBeNull();
  });

  it("shows nothing when there is no work", () => {
    const { container } = render(<SidebarBadge badge={null} collapsed={false} />);

    expect(container.textContent).toBe("");
  });
});
