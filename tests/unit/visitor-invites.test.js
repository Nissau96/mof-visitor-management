import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeetingsHandler } from "../../api/meetings.js";
import { createRegisterHandler } from "../../api/register.js";
import { HttpError } from "../../api/_lib/http.js";
import { canCancelInvite, quickActionsFor } from "../../src/lib/visitorInvites.js";
import { notifyInviteBooked } from "../../src/server/visitorInviteEmail.js";
import { createInviteToken, hashInviteToken } from "../../src/server/visitorInviteToken.js";
import {
  INVITE_PURPOSES,
  bookingFindSchema,
  createInviteSubmitSchema,
  inviteCreateSchema,
  normalizeBookingCode,
} from "../../src/validation/visitorInvites.js";

const USER_ID = "44444444-4444-4444-8444-444444444444";
const NOW = Date.parse("2026-11-20T09:00:00Z");
const TOKEN = "a".repeat(43);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("visitor link tokens", () => {
  it("stores only a SHA-256 hash of a 43-character token", () => {
    const { hash, token } = createInviteToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(token)).toBe(hash);
    expect(createInviteToken().token).not.toBe(token);
  });
});

describe("visitor link rules", () => {
  it("accepts a code with or without VIS-", () => {
    expect(normalizeBookingCode("1a2b 3c4d")).toBe("VIS-1A2B3C4D");
    expect(normalizeBookingCode("vis-1a2b3c4d")).toBe("VIS-1A2B3C4D");
    expect(bookingFindSchema.safeParse({ code: "1A2B3C4D" }).data.code).toBe("VIS-1A2B3C4D");
    expect(bookingFindSchema.safeParse({ code: "BKG-1" }).success).toBe(false);
  });

  it("needs a Ministry division and drops it for other agencies", () => {
    expect(
      inviteCreateSchema.safeParse({ agency: "Ministry of Finance (MoF)", hostName: "Ama Mensah" }).success,
    ).toBe(false);
    expect(
      inviteCreateSchema.parse({ agency: "IAA", division: "Budget Office", hostName: "Ama Mensah" }).division,
    ).toBe("");
  });

  it("books from today up to 30 days ahead, never as a meeting", () => {
    const schema = createInviteSubmitSchema(() => NOW);
    const visitor = {
      consent: true,
      firstName: "Kofi",
      lastName: "Boateng",
      phone: "024 000 0000",
      purpose: "Official",
      token: TOKEN,
      wifiAccess: "no",
    };

    expect(schema.safeParse({ ...visitor, visitDate: "2026-11-20" }).success).toBe(true);
    expect(schema.safeParse({ ...visitor, visitDate: "2026-12-20" }).success).toBe(true);
    expect(schema.safeParse({ ...visitor, visitDate: "2026-12-21" }).success).toBe(false);
    expect(schema.safeParse({ ...visitor, visitDate: "2026-11-19" }).success).toBe(false);
    expect(schema.safeParse({ ...visitor, purpose: "Meeting", visitDate: "2026-11-20" }).success).toBe(false);
    expect(INVITE_PURPOSES).not.toContain("Meeting");
  });

  it("gives each role the right floating actions", () => {
    expect(quickActionsFor("receptionist")).toEqual({ create: true, find: true });
    expect(quickActionsFor("admin")).toEqual({ create: true, find: true });
    expect(quickActionsFor("client_service_head")).toEqual({ create: true, find: false });
    expect(quickActionsFor("it_network_admin")).toBeNull();
  });

  it("allows cancelling until the visitor arrives", () => {
    expect(canCancelInvite({ state: "unused" })).toBe(true);
    expect(canCancelInvite({ state: "used", visitState: "waiting" })).toBe(true);
    expect(canCancelInvite({ state: "used", visitState: "arrived" })).toBe(false);
    expect(canCancelInvite({ state: "expired" })).toBe(false);
  });
});

function staffHandler({ data, role = "client_service_head" }) {
  const rpc = vi.fn(async () => ({ data, error: null }));
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({ order: async () => ({ data: [{ full_name: "Ama Mensah" }] }) }),
    }),
  }));

  const handler = createMeetingsHandler({
    enforceRateLimitForRequest: vi.fn().mockResolvedValue(undefined),
    getAdminClientForRequest: () => ({ from, rpc }),
    requireActiveStaffForRequest: vi.fn(async (_request, allowedRoles) => {
      if (!allowedRoles.includes(role)) {
        throw new HttpError("Not allowed.", 403);
      }

      return { profile: { role, userId: USER_ID } };
    }),
    verifyWorkEmailForRequest: vi.fn(async () => ({
      email: "kwame.asare@mofep.gov.gh",
      name: "Kwame Asare",
      oid: "booker-oid",
    })),
  });

  return { handler, rpc };
}

function post(operation, body) {
  return new Request(`http://localhost/api/meetings?operation=${operation}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("creating visitor links", () => {
  const created = {
    expiresAt: "2026-11-21T09:00:00Z",
    hostName: "Ama Mensah",
    id: "66666666-6666-4666-8666-666666666666",
    state: "unused",
  };

  it("sends only the token's hash and returns the link once", async () => {
    vi.stubEnv("STAFF_LOGIN_URL", "https://visitors.example.gov.gh/staff/login");
    const { handler, rpc } = staffHandler({ data: created });

    const response = await handler.fetch(
      post("invite-create", { agency: "IAA", hostName: "Ama Mensah" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);

    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("create_visitor_invite");
    expect(args.p_actor_id).toBe(USER_ID);
    expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);

    const token = body.url.split("/invite/")[1];
    expect(body.url.startsWith("https://visitors.example.gov.gh/invite/")).toBe(true);
    expect(hashInviteToken(token)).toBe(args.p_token_hash);
  });

  it("keeps the IT role out", async () => {
    const { handler, rpc } = staffHandler({ data: created, role: "it_network_admin" });

    const response = await handler.fetch(
      post("invite-create", { agency: "IAA", hostName: "Ama Mensah" }),
    );

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes the work-email user the host of their own link", async () => {
    const { handler, rpc } = staffHandler({ data: created });

    const response = await handler.fetch(
      post("booker-invite-create", {
        agency: "Ministry of Finance (MoF)",
        division: "Budget Office",
        floor: "3",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "create_visitor_invite",
      expect.objectContaining({
        p_actor_id: null,
        p_creator_email: "kwame.asare@mofep.gov.gh",
        p_creator_oid: "booker-oid",
        p_host_name: "Kwame Asare",
      }),
    );
  });

  it("lists links with the host directory", async () => {
    const { handler } = staffHandler({ data: { invites: [] } });

    const body = await (await handler.fetch(post("invite-list", {}))).json();

    expect(body).toEqual({ hosts: ["Ama Mensah"], invites: [] });
  });
});

describe("finding a booking", () => {
  it("searches the full code, across both towers for administrators", async () => {
    const { handler, rpc } = staffHandler({ data: { state: "waiting" }, role: "admin" });

    const response = await handler.fetch(post("booking-find", { code: "1a2b3c4d" }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("find_visitor_booking", {
      p_actor_id: USER_ID,
      p_code: "VIS-1A2B3C4D",
      p_tower: null,
    });
  });

  it("is for reception only", async () => {
    const { handler } = staffHandler({ data: {}, role: "client_service_head" });

    expect((await handler.fetch(post("booking-find", { code: "1A2B3C4D" }))).status).toBe(403);
  });
});

describe("the visitor's link", () => {
  function registerHandler(result) {
    const rpc = vi.fn(async () => result);
    const notifyBooked = vi.fn().mockResolvedValue({ hostEmail: true, visitorEmail: true, visitorSms: false });

    return {
      handler: createRegisterHandler({
        enforceRateLimitForRequest: vi.fn().mockResolvedValue(undefined),
        getAdminClientForRequest: () => ({ rpc }),
        notifyBooked,
      }),
      notifyBooked,
      rpc,
    };
  }

  function request(operation, body) {
    return new Request(`http://localhost/api/register?operation=${operation}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  const visitor = {
    consent: true,
    firstName: "Kofi",
    lastName: "Boateng",
    phone: "0240000000",
    purpose: "Official",
    token: TOKEN,
    wifiAccess: "yes",
  };

  it("opens by the token's hash, without the weekly QR pass", async () => {
    const { handler, rpc } = registerHandler({ data: { state: "unused" }, error: null });

    const response = await handler.fetch(request("invite-view", { token: TOKEN }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_visitor_invite", { p_token_hash: hashInviteToken(TOKEN) });
  });

  it("says a missing link is not valid", async () => {
    const { handler } = registerHandler({ data: null, error: { code: "P0002" } });

    expect((await handler.fetch(request("invite-view", { token: TOKEN }))).status).toBe(404);
  });

  it("books once and tells the host", async () => {
    const booked = {
      hostEmail: "ama@mofep.gov.gh",
      hostName: "Ama Mensah",
      referenceCode: "VIS-1A2B3C4D",
      tower: "tower_2",
      visitDate: new Date().toISOString().slice(0, 10),
    };
    const { handler, notifyBooked, rpc } = registerHandler({ data: booked, error: null });

    const response = await handler.fetch(
      request("invite-submit", { ...visitor, visitDate: booked.visitDate }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.booking.referenceCode).toBe("VIS-1A2B3C4D");
    expect(body.booking.hostEmail).toBeUndefined();
    expect(rpc).toHaveBeenCalledWith(
      "submit_visitor_invite",
      expect.objectContaining({
        p_full_name: "Kofi Boateng",
        p_phone: "+233240000000",
        p_token_hash: hashInviteToken(TOKEN),
        p_wifi_requested: true,
      }),
    );
    expect(notifyBooked).toHaveBeenCalledWith(booked);
  });

  it("refuses a used or expired link", async () => {
    const { handler, notifyBooked } = registerHandler({
      data: null,
      error: { code: "55000", message: "used" },
    });

    const response = await handler.fetch(
      request("invite-submit", { ...visitor, visitDate: new Date().toISOString().slice(0, 10) }),
    );

    expect(response.status).toBe(410);
    expect(notifyBooked).not.toHaveBeenCalled();
  });
});

describe("booking notifications", () => {
  const booking = {
    agency: "Ministry of Finance (MoF)",
    division: "Budget Office",
    floor: "3",
    hostEmail: "ama@mofep.gov.gh",
    hostName: "Ama Mensah",
    referenceCode: "VIS-1A2B3C4D",
    tower: "tower_2",
    visitDate: "2026-11-24",
    visitorEmail: "kofi@example.invalid",
    visitorName: "Kofi Boateng",
    visitorPhone: "+233240000000",
  };

  it("emails the host and visitor and messages the visitor", async () => {
    const send = {
      email: vi.fn().mockResolvedValue(undefined),
      phone: vi.fn().mockResolvedValue({ channel: "sms", status: "accepted" }),
    };

    const result = await notifyInviteBooked(booking, { environment: {}, send, smsAvailable: true });

    expect(result).toEqual({ hostEmail: true, visitorEmail: true, visitorSms: true });
    expect(send.email).toHaveBeenCalledWith(expect.objectContaining({ to: "ama@mofep.gov.gh" }));
    expect(send.email.mock.calls[0][0].message.text).toContain("VIS-1A2B3C4D");
    expect(send.phone).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: [expect.any(String), "Ama Mensah", "VIS-1A2B3C4D"],
        phone: "+233240000000",
        purpose: "booking_confirmation",
        referenceCode: "VIS-1A2B3C4D",
      }),
    );
  });

  it("reports the visitor message as not sent when the SMS fails", async () => {
    const send = {
      email: vi.fn().mockResolvedValue(undefined),
      phone: vi.fn().mockResolvedValue({ channel: null, status: "failed" }),
    };

    const result = await notifyInviteBooked(booking, { environment: {}, send, smsAvailable: true });

    expect(result.visitorSms).toBe(false);
  });

  it("reports failures without throwing", async () => {
    const send = { email: vi.fn().mockRejectedValue(new Error("SMTP down")), phone: vi.fn() };

    const result = await notifyInviteBooked(
      { ...booking, visitorEmail: null },
      { environment: {}, send, smsAvailable: false },
    );

    expect(result).toEqual({ hostEmail: false, visitorEmail: false, visitorSms: false });
    expect(send.phone).not.toHaveBeenCalled();
  });
});
