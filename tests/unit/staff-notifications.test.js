import { describe, expect, it } from "vitest";
import {
  getAccraDayStart,
  loadStaffNotifications,
} from "../../api/_lib/staffNotifications.js";

// Minimal stand-in for the Supabase query builder: every filter call is
// recorded and the query resolves to the canned result for its table.
function createClient(resultsByTable) {
  const calls = [];

  return {
    calls,
    from(table) {
      const query = {
        table,
        filters: [],
        then(resolve, reject) {
          const queue = resultsByTable[table];

          return Promise.resolve(
            queue.shift(),
          ).then(resolve, reject);
        },
      };

      for (const method of [
        "select",
        "eq",
        "lt",
        "gte",
        "in",
        "order",
        "limit",
      ]) {
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

const NOW = new Date("2026-10-21T10:00:00.000Z");

describe("staff notifications", () => {
  it("uses the Accra calendar day", () => {
    expect(
      getAccraDayStart(NOW).toISOString(),
    ).toBe("2026-10-21T00:00:00.000Z");
  });

  it("merges visit alerts, groups card problems and sorts newest first", async () => {
    const client = createClient({
      visits: [
        {
          data: [
            {
              created_at: "2026-10-21T09:30:00+00:00",
              id: "visit-pending",
              reference_code: "VIS-PEND01",
              tower: "tower_2",
              visitor_profiles: {
                full_name: "Pending Visitor",
              },
            },
          ],
          error: null,
        },
        {
          data: [
            {
              checked_in_at: "2026-08-16T08:45:00+00:00",
              id: "visit-overstay",
              reference_code: "VIS-OVER01",
              tower: "tower_2",
              visitor_profiles: {
                full_name: "Derrick Rose",
              },
            },
          ],
          error: null,
        },
      ],
      visitor_card_assignments: [
        {
          data: [
            {
              visits: {
                checked_in_at: "2026-10-21T08:15:00+00:00",
                id: "visit-vip",
                reference_code: "VIS-VIP001",
                tower: "tower_1",
                visitor_profiles: {
                  full_name: "VIP Visitor",
                },
              },
            },
          ],
          error: null,
        },
      ],
      visitor_cards: [
        {
          data: [
            {
              status: "not_returned",
              updated_at: "2026-10-20T12:00:00+00:00",
            },
            {
              status: "not_returned",
              updated_at: "2026-10-19T12:00:00+00:00",
            },
          ],
          error: null,
        },
      ],
    });

    const notifications =
      await loadStaffNotifications({
        client,
        includeCardProblems: true,
        now: NOW,
        towerScope: null,
      });

    expect(
      notifications.map((item) => item.id),
    ).toEqual([
      "pending_admission:visit-pending",
      "vip_arrival:visit-vip",
      "overstay:visit-overstay",
      "card_problem:not_returned",
    ]);

    expect(notifications[2]).toMatchObject({
      occurredAt: "2026-08-16T08:45:00+00:00",
      sortAt: "2026-10-21T00:00:00.000Z",
      visitorName: "Derrick Rose",
    });

    expect(notifications[3]).toMatchObject({
      count: 2,
      status: "not_returned",
    });
  });

  it("scopes receptionists to their tower and skips card problems", async () => {
    const client = createClient({
      visits: [
        { data: [], error: null },
        { data: [], error: null },
      ],
      visitor_card_assignments: [
        { data: [], error: null },
      ],
    });

    await loadStaffNotifications({
      client,
      includeCardProblems: false,
      now: NOW,
      towerScope: "tower_1",
    });

    expect(
      client.calls.map((call) => call.table),
    ).toEqual([
      "visits",
      "visits",
      "visitor_card_assignments",
    ]);

    expect(client.calls[0].filters).toContainEqual([
      "eq",
      "tower",
      "tower_1",
    ]);

    expect(client.calls[2].filters).toContainEqual([
      "eq",
      "visits.tower",
      "tower_1",
    ]);
  });
});
