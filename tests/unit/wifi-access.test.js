import { describe, expect, it, vi } from "vitest";
import { createMeetingsHandler } from "../../api/meetings.js";
import { HttpError } from "../../api/_lib/http.js";
import {
  MOF_DIVISIONS,
  getFloorLabel,
  getFloorOptions,
  resolveDestinationFloor,
  resolveVisitTower,
} from "../../src/constants/visitorOptions.js";
import { navBadgeFor } from "../../src/lib/navBadges.js";
import { meetingFormSchema } from "../../src/validation/meetings.js";
import { returningVisitCheckInSchema } from "../../src/validation/returningVisit.js";
import { visitorRegistrationSchema } from "../../src/validation/visitorRegistration.js";

const USER_ID = "44444444-4444-4444-8444-444444444444";
const MEETING_ID = "55555555-5555-4555-8555-555555555555";
const VISIT_ID = "66666666-6666-4666-8666-666666666666";
const BOOKING_ID = "77777777-7777-4777-8777-777777777777";

const REGISTRATION = {
  agency: "IAA",
  consent: true,
  customMeetingTitle: "",
  division: "",
  email: "",
  firstName: "Test",
  lastName: "Visitor",
  meetingId: "",
  organization: "",
  personVisiting: "Test Officer",
  phone: "024 000 0000",
  purpose: "Official",
};

const MEETING = {
  endsAt: "11:30",
  endsOn: "",
  floor: "5",
  hostAgency: "Ministry of Finance (MoF)",
  hostDivision: "Research Division",
  meetingId: null,
  meetingTower: "tower_2",
  recurrenceDays: [],
  scheduleType: "single",
  startsAt: "10:00",
  startsOn: "2026-11-20",
  title: "Research review",
  venue: "",
  wifiAccess: "yes",
};

function staffRequest(operation, body) {
  return new Request(`http://localhost/api/meetings?operation=${operation}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function createHandler({ data = {}, error = null, role = "it_network_admin" } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data, error });

  const handler = createMeetingsHandler({
    enforceRateLimitForRequest: vi.fn().mockResolvedValue(undefined),
    getAdminClientForRequest: () => ({ rpc }),
    requireActiveStaffForRequest: vi.fn(async (_request, allowedRoles) => {
      if (!allowedRoles.includes(role)) {
        throw new HttpError("This account is not authorised for this action.", 403);
      }

      return { profile: { role, userId: USER_ID } };
    }),
    verifyWorkEmailForRequest: vi.fn().mockResolvedValue({
      email: "ama.mensah@mofep.gov.gh",
      name: "Ama Mensah",
      oid: "11111111-1111-4111-8111-111111111111",
    }),
  });

  return { handler, rpc };
}

describe("floors", () => {
  it("labels conference-room floors per tower", () => {
    expect(getFloorLabel("7", "tower_1")).toBe("Floor 7 – K.A. Gbedemah Conference Rooms");
    expect(getFloorLabel("5", "tower_2")).toBe("Floor 5 – Conference rooms");
    expect(getFloorLabel("7", "tower_2")).toBe("Floor 7 – Conference rooms");
    expect(getFloorLabel("5", "tower_1")).toBe("Floor 5");
    expect(getFloorLabel("ground", "tower_1")).toBe("Ground floor");
    expect(getFloorLabel("", "tower_1")).toBe("");
    expect(getFloorOptions("tower_2")).toHaveLength(8);
  });

  it("knows the floor of every agency on the Tower 1 sign", () => {
    expect(resolveDestinationFloor("IAA", "")).toBe("1");
    expect(resolveDestinationFloor("GIPC", "")).toBe("2");
    expect(resolveDestinationFloor("NDPC", "")).toBe("3");
    expect(resolveDestinationFloor("GIFMIS", "")).toBe("4");
    expect(resolveDestinationFloor("GCX", "")).toBe("5");
    expect(resolveDestinationFloor("VFM", "")).toBe("6");
  });

  it("has a floor for every Ministry division", () => {
    for (const division of MOF_DIVISIONS) {
      expect(resolveDestinationFloor("Ministry of Finance (MoF)", division), division).not.toBe("");
    }

    expect(resolveDestinationFloor("Ministry of Finance (MoF)", "Ministry Headquarters")).toBe("");
  });

  it("routes the new Ministry offices to Tower 2", () => {
    for (const division of [
      "Central Tender Review Committee",
      "Office of the Chief Director",
      "Office of the Coordinating Director (Operation)",
      "Office of the Coordinating Director (Technical)",
      "Office of the Deputy Minister",
      "Office of the Minister",
    ]) {
      expect(MOF_DIVISIONS).toContain(division);
      expect(resolveVisitTower("Ministry of Finance (MoF)", division)).toBe("tower_2");
    }

    expect(resolveVisitTower("Ministry of Finance (MoF)", "PFM Systems Division")).toBe("tower_1");
  });
});

describe("visitor Wi-Fi answer", () => {
  it("is required and stored as a boolean", () => {
    const missing = visitorRegistrationSchema.safeParse(REGISTRATION);
    expect(missing.success).toBe(false);
    expect(missing.error.issues.map((issue) => issue.path.join("."))).toContain("wifiAccess");

    const yes = visitorRegistrationSchema.parse({ ...REGISTRATION, wifiAccess: "yes" });
    expect(yes.wifiRequested).toBe(true);

    const no = visitorRegistrationSchema.parse({ ...REGISTRATION, wifiAccess: "no" });
    expect(no.wifiRequested).toBe(false);
  });

  it("is not asked when the chosen meeting already asked for Wi-Fi", () => {
    const covered = visitorRegistrationSchema.parse({
      ...REGISTRATION,
      meetingCoversWifi: true,
      meetingId: MEETING_ID,
      personVisiting: "",
      purpose: "Meeting",
    });

    expect(covered.wifiRequested).toBeNull();
  });

  it("is still asked for a meeting not listed", () => {
    const result = visitorRegistrationSchema.safeParse({
      ...REGISTRATION,
      customMeetingTitle: "Partner workshop",
      meetingCoversWifi: true,
      meetingId: "custom-meeting",
      personVisiting: "",
      purpose: "Meeting",
    });

    expect(result.success).toBe(false);
  });

  it("is asked at returning check-in too", () => {
    const result = returningVisitCheckInSchema.safeParse({
      agency: "IAA",
      personVisiting: "Test Officer",
      privacyAcknowledged: true,
      purpose: "Official",
      verificationToken: "x".repeat(40),
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe("Choose whether you need Wi-Fi access.");
  });
});

describe("meeting floor and Wi-Fi", () => {
  it("requires both on the reception form", () => {
    const result = meetingFormSchema.safeParse({ ...MEETING, floor: "", wifiAccess: "" });

    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.path[0]).sort()).toEqual(["floor", "wifiAccess"]);
  });
});

describe("IT network operations", () => {
  it("lists requests for the IT network team", async () => {
    const { handler, rpc } = createHandler({ data: { entries: [], view: "upcoming" } });

    const response = await handler.fetch(staffRequest("wifi-list", { view: "upcoming" }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_wifi_access_requests", {
      p_actor_id: USER_ID,
      p_view: "upcoming",
    });
  });

  it("lets Super Administrators see the requests too", async () => {
    const { handler } = createHandler({ data: { entries: [] }, role: "admin" });

    const response = await handler.fetch(staffRequest("wifi-list", {}));

    expect(response.status).toBe(200);
  });

  it("refuses receptionists", async () => {
    const { handler, rpc } = createHandler({ role: "receptionist" });

    const response = await handler.fetch(staffRequest("wifi-list", {}));

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the IT team out of meeting management", async () => {
    const { handler, rpc } = createHandler();

    const response = await handler.fetch(staffRequest("staff-list", { tower: "" }));

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records a decision with a note", async () => {
    const { handler, rpc } = createHandler({ data: { id: VISIT_ID, status: "given" } });

    const response = await handler.fetch(
      staffRequest("wifi-update", {
        id: VISIT_ID,
        note: "  Sent by SMS ",
        status: "given",
        type: "visit",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_wifi_access_status", {
      p_actor_id: USER_ID,
      p_entry_id: VISIT_ID,
      p_entry_type: "visit",
      p_note: "Sent by SMS",
      p_status: "given",
    });
  });

  it("does not accept Cancelled as a decision", async () => {
    const { handler, rpc } = createHandler();

    const response = await handler.fetch(
      staffRequest("wifi-update", { id: VISIT_ID, status: "cancelled", type: "visit" }),
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("explains a request that was withdrawn", async () => {
    const { handler } = createHandler({
      data: null,
      error: { code: "P0002", message: "Wi-Fi request not found" },
    });

    const response = await handler.fetch(
      staffRequest("wifi-update", { id: MEETING_ID, status: "given", type: "meeting" }),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/withdrawn/);
  });

  it("counts waiting requests for the menu badge", async () => {
    const { handler, rpc } = createHandler({ data: { waitingCount: 4 } });

    const response = await handler.fetch(staffRequest("wifi-count", {}));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_wifi_waiting_count", { p_actor_id: USER_ID });
    expect(navBadgeFor({ wifiWaiting: 4 }, "/staff/wifi")).toEqual({ count: 4, tone: "waiting" });
  });
});

describe("booker Wi-Fi change", () => {
  it("turns Wi-Fi on for the booker's own booking", async () => {
    const { handler, rpc } = createHandler({ data: { bookingId: BOOKING_ID } });

    const response = await handler.fetch(
      new Request("http://localhost/api/meetings?operation=booker-wifi", {
        body: JSON.stringify({ bookingId: BOOKING_ID, wifiAccess: "yes" }),
        headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_meeting_booking_wifi", {
      p_booker_oid: "11111111-1111-4111-8111-111111111111",
      p_booking_id: BOOKING_ID,
      p_wifi_requested: true,
    });
  });
});
