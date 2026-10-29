import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createMeetingsHandler } from "../../api/meetings.js";
import { HttpError } from "../../api/_lib/http.js";
import {
  formatMeetingOption,
  formatSchedule,
  getMonthGrid,
  meetingOccursOn,
} from "../../src/lib/meetingSchedule.js";
import { meetingFormSchema } from "../../src/validation/meetings.js";

const USER_ID = "44444444-4444-4444-8444-444444444444";
const MEETING_ID = "55555555-5555-4555-8555-555555555555";

function createRequest(operation, body) {
  return new Request(
    `http://localhost/api/meetings?operation=${operation}`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

function createHandler({
  data = { meetingId: MEETING_ID, title: "Budget review" },
  databaseError = null,
  role = "receptionist",
} = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data,
    error: databaseError,
  });

  // Mirrors requireActiveStaff: rejects roles the operation does not allow.
  const requireActiveStaffForRequest = vi.fn(
    async (_request, allowedRoles) => {
      if (!allowedRoles.includes(role)) {
        throw new HttpError(
          "This account is not authorised for this action.",
          403,
        );
      }

      return { profile: { role, userId: USER_ID } };
    },
  );

  const handler = createMeetingsHandler({
    enforceRateLimitForRequest: vi.fn().mockResolvedValue(undefined),
    getAdminClientForRequest: () => ({ rpc }),
    requireActiveStaffForRequest,
  });

  return { handler, rpc };
}

const BASE_MEETING = {
  endsAt: "11:30",
  endsOn: "",
  hostDivision: "Budget Division",
  meetingId: null,
  meetingTower: "tower_1",
  recurrenceDays: [],
  scheduleType: "single",
  startsAt: "10:00",
  startsOn: "2026-11-03",
  title: "Budget review",
  venue: "Room B",
};

describe("staff meeting operations", () => {
  it("lists meetings for the receptionist's working tower", async () => {
    const { handler, rpc } = createHandler({
      data: { meetings: [], pagination: {}, summary: {} },
    });

    const response = await handler.fetch(
      createRequest("staff-list", {
        tower: "tower_1",
        view: "upcoming",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "get_staff_meetings",
      expect.objectContaining({
        p_actor_id: USER_ID,
        p_from: null,
        p_tower: "tower_1",
        p_view: "upcoming",
      }),
    );
  });

  it("requires a working tower for receptionists", async () => {
    const { handler, rpc } = createHandler();

    const response = await handler.fetch(
      createRequest("staff-list", { view: "today" }),
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets Client Service Heads view but not change meetings", async () => {
    const viewer = createHandler({
      data: { meetings: [] },
      role: "client_service_head",
    });

    expect(
      (
        await viewer.handler.fetch(
          createRequest("staff-list", { view: "today" }),
        )
      ).status,
    ).toBe(200);

    const editor = createHandler({ role: "client_service_head" });

    const response = await editor.handler.fetch(
      createRequest("staff-save", { meeting: BASE_MEETING }),
    );

    expect(response.status).toBe(403);
    expect(editor.rpc).not.toHaveBeenCalled();
  });

  it("saves a one-day meeting with the same start and end date", async () => {
    const { handler, rpc } = createHandler();

    const response = await handler.fetch(
      createRequest("staff-save", {
        meeting: { ...BASE_MEETING, endsOn: "2026-12-01" },
        tower: "tower_1",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "save_staff_meeting",
      expect.objectContaining({
        p_ends_at: "11:30",
        p_ends_on: "2026-11-03",
        p_meeting_id: null,
        p_meeting_tower: "tower_1",
        p_recurrence_days: [],
        p_schedule_type: "single",
        p_starts_on: "2026-11-03",
      }),
    );
  });

  it("rejects a weekly meeting without days before calling the database", async () => {
    const { handler, rpc } = createHandler();

    const response = await handler.fetch(
      createRequest("staff-save", {
        meeting: { ...BASE_MEETING, scheduleType: "weekly" },
        tower: "tower_1",
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Select at least one day of the week.",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("explains why a meeting with visitors cannot be deleted", async () => {
    const { handler } = createHandler({
      data: null,
      databaseError: {
        code: "55000",
        message: "Visitors have registered for this meeting. Cancel it instead.",
      },
    });

    const response = await handler.fetch(
      createRequest("staff-delete", {
        meetingId: MEETING_ID,
        tower: "tower_1",
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Visitors have registered for this meeting. Cancel it instead.",
    );
  });

  it("returns 404 for an unknown operation", async () => {
    const { handler } = createHandler();

    const response = await handler.fetch(
      createRequest("staff-unknown", {}),
    );

    expect(response.status).toBe(404);
  });
});

describe("meeting form rules", () => {
  it("requires a last day for a date range", () => {
    const result = meetingFormSchema.safeParse({
      ...BASE_MEETING,
      scheduleType: "continuous",
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe(
      "Select the last day of the meeting.",
    );
  });

  it("requires the end time to follow the start time", () => {
    const result = meetingFormSchema.safeParse({
      ...BASE_MEETING,
      endsAt: "09:00",
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(["endsAt"]);
  });
});

describe("meeting schedule helpers", () => {
  const weekly = {
    endsOn: "2026-11-30",
    recurrenceDays: [2, 4],
    scheduleType: "weekly",
    startsOn: "2026-11-01",
    title: "Weekly sync",
  };

  it("matches the database rule for weekly meetings", () => {
    expect(meetingOccursOn(weekly, "2026-11-03")).toBe(true); // Tuesday
    expect(meetingOccursOn(weekly, "2026-11-04")).toBe(false); // Wednesday
    expect(meetingOccursOn(weekly, "2026-12-01")).toBe(false); // after end
  });

  it("builds Monday-to-Sunday weeks covering the month", () => {
    const grid = getMonthGrid("2026-11-01");

    expect(grid.start).toBe("2026-10-26");
    expect(grid.end).toBe("2026-12-06");
    expect(grid.days).toHaveLength(42);
  });

  it("describes schedules and visitor options in plain words", () => {
    expect(formatSchedule(weekly)).toBe(
      "Every Tue, Thu until 30 Nov 2026",
    );
    expect(
      formatMeetingOption({
        endsAt: "11:30",
        startsAt: "10:00",
        title: "Budget review",
        venue: "Room B",
      }),
    ).toBe("Budget review · 10:00 – 11:30 · Room B");
  });
});
