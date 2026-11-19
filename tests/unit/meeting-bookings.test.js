import { SignJWT, generateKeyPair } from "jose";
import { describe, expect, it, vi } from "vitest";
import { createMeetingsHandler } from "../../api/meetings.js";
import { HttpError } from "../../api/_lib/http.js";
import { verifyWorkEmailToken } from "../../api/_lib/workEmailToken.js";
import { createMeetingBookingMessage } from "../../src/server/meetingBookingEmail.js";
import {
  firstMeetingDay,
  formatBookingSchedule,
  isMultiDayBooking,
} from "../../src/lib/meetingSchedule.js";
import {
  LATER_DAYS_NOTE,
  NO_MATCHING_WEEKDAY_MESSAGE,
  bookingDecisionSchema,
  createBookingFormSchema,
} from "../../src/validation/meetingBookings.js";

const TENANT_ID = "4831885c-93a1-496f-b841-42f9754c4ffa";
const CLIENT_ID = "fa2a5b50-5339-497c-bdb3-dda883638191";
const OID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

const ENVIRONMENT = {
  VITE_ENTRA_CLIENT_ID: CLIENT_ID,
  VITE_ENTRA_TENANT_ID: TENANT_ID,
};

// 2026-11-17 08:00 in Accra (UTC+0).
const NOW = Date.parse("2026-11-17T08:00:00Z");

const BOOKER = Object.freeze({
  email: "ama.mensah@mofep.gov.gh",
  name: "Ama Mensah",
  oid: OID,
});

const FORM = Object.freeze({
  consent: true,
  endsAt: "11:00",
  floor: "3",
  guests: [
    {
      email: "",
      fullName: "Kofi Boateng",
      organization: "World Bank",
      phone: "024 000 0001",
    },
  ],
  hostAgency: "Ministry of Finance (MoF)",
  hostDivision: "Budget Office",
  notes: "",
  scheduleType: "single",
  startsAt: "10:00",
  startsOn: "2026-11-18",
  title: "Budget review",
  venue: "Conference Room B",
  wifiAccess: "no",
});

function request(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
    method: "POST",
  });
}

function createHandler({
  data = { bookingId: BOOKING_ID, guests: [], status: "pending" },
  error = null,
  expired = [],
  sendBookingEmail = vi.fn().mockResolvedValue(undefined),
  verify = vi.fn().mockResolvedValue(BOOKER),
} = {}) {
  const rpc = vi.fn((name) =>
    Promise.resolve(
      name === "expire_meeting_bookings"
        ? { data: expired, error: null }
        : { data, error },
    ),
  );

  const handler = createMeetingsHandler({
    enforceRateLimitForRequest: vi.fn().mockResolvedValue(undefined),
    getAdminClientForRequest: () => ({ rpc }),
    requireActiveStaffForRequest: vi.fn().mockResolvedValue({
      profile: { role: "receptionist", tower: "tower_2", userId: USER_ID },
    }),
    sendBookingEmail,
    verifyWorkEmailForRequest: verify,
  });

  return { handler, rpc, sendBookingEmail, verify };
}

describe("booking form rules", () => {
  const schema = createBookingFormSchema(() => NOW);

  it("accepts a complete booking and normalises guest phones", () => {
    const parsed = schema.parse(FORM);

    expect(parsed.guests[0].phone).toBe("+233240000001");
  });

  it("requires at least 2 hours' notice", () => {
    const result = schema.safeParse({
      ...FORM,
      endsAt: "10:30",
      startsOn: "2026-11-17",
      startsAt: "09:30",
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe(
      "Book the meeting at least 2 hours before it starts.",
    );
  });

  it("allows a same-day meeting with enough notice", () => {
    expect(
      schema.safeParse({
        ...FORM,
        endsAt: "11:00",
        startsOn: "2026-11-17",
        startsAt: "10:00",
      }).success,
    ).toBe(true);
  });

  it("refuses meetings more than 90 days ahead", () => {
    const result = schema.safeParse({ ...FORM, startsOn: "2027-02-16" });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe(
      "Meetings can be booked up to 90 days ahead.",
    );
  });

  // Guests become visits, and a visit must name a real division.
  it("refuses Ministry Headquarters as the host division", () => {
    const result = schema.safeParse({
      ...FORM,
      hostDivision: "Ministry Headquarters",
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(["hostDivision"]);
  });

  it("requires a last day for a date range", () => {
    const result = schema.safeParse({ ...FORM, scheduleType: "continuous" });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(["endsOn"]);
  });

  it("refuses a last day more than 90 days ahead", () => {
    const result = schema.safeParse({
      ...FORM,
      endsOn: "2027-02-16",
      scheduleType: "continuous",
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe(
      "Meetings can be booked up to 90 days ahead.",
    );
  });

  it("refuses a weekly range without any chosen weekday in it", () => {
    // 18 to 20 November 2026 is Wednesday to Friday.
    const result = schema.safeParse({
      ...FORM,
      endsOn: "2026-11-20",
      recurrenceDays: [1],
      scheduleType: "weekly",
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe(
      NO_MATCHING_WEEKDAY_MESSAGE,
    );
  });

  // The notice period counts from the first day the meeting happens.
  it("counts the notice period from the first weekly meeting", () => {
    expect(
      schema.safeParse({
        ...FORM,
        endsAt: "10:30",
        endsOn: "2026-12-01",
        recurrenceDays: [1],
        scheduleType: "weekly",
        startsAt: "09:30",
        startsOn: "2026-11-17",
      }).success,
    ).toBe(true);
  });

  it("requires the consent statement", () => {
    expect(schema.safeParse({ ...FORM, consent: false }).success).toBe(false);
  });

  it("refuses repeated guest phones and more than 30 guests", () => {
    const guest = FORM.guests[0];

    expect(
      schema.safeParse({
        ...FORM,
        guests: [guest, { ...guest, fullName: "Someone Else", phone: "+233240000001" }],
      }).error.issues[0].message,
    ).toBe("Each guest needs a different mobile number.");

    expect(
      schema.safeParse({
        ...FORM,
        guests: Array.from({ length: 31 }, (_, index) => ({
          ...guest,
          phone: `+2332400${String(index).padStart(5, "0")}`,
        })),
      }).success,
    ).toBe(false);
  });

  it("requires a reason to reject", () => {
    expect(
      bookingDecisionSchema.safeParse({
        bookingId: BOOKING_ID,
        decision: "reject",
        reason: "",
      }).success,
    ).toBe(false);
  });
});

describe("work email token", () => {
  async function signedRequest(claims = {}, { audience = CLIENT_ID, expiresIn = "1h" } = {}) {
    const { privateKey, publicKey } = await generateKeyPair("RS256");

    const token = await new SignJWT({
      email: "Ama.Mensah@mofep.gov.gh",
      name: "Ama Mensah",
      oid: OID,
      tid: TENANT_ID,
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(`https://login.microsoftonline.com/${TENANT_ID}/v2.0`)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);

    return {
      options: { environment: ENVIRONMENT, keySetForTenant: () => publicKey },
      request: new Request("http://localhost/api/bookings/mine", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    };
  }

  it("returns the booker for a valid Ministry token", async () => {
    const { options, request: tokenRequest } = await signedRequest();

    await expect(verifyWorkEmailToken(tokenRequest, options)).resolves.toEqual({
      email: "ama.mensah@mofep.gov.gh",
      name: "Ama Mensah",
      oid: OID,
    });
  });

  it("refuses a token for another app", async () => {
    const { options, request: tokenRequest } = await signedRequest({}, {
      audience: "99999999-9999-4999-8999-999999999999",
    });

    await expect(verifyWorkEmailToken(tokenRequest, options)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("refuses a token from another tenant", async () => {
    const { options, request: tokenRequest } = await signedRequest({
      tid: "99999999-9999-4999-8999-999999999999",
    });

    await expect(verifyWorkEmailToken(tokenRequest, options)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("asks for sign-in when there is no token", async () => {
    await expect(
      verifyWorkEmailToken(new Request("http://localhost/api/bookings/mine"), {
        environment: ENVIRONMENT,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("reports missing configuration", async () => {
    await expect(
      verifyWorkEmailToken(new Request("http://localhost/"), { environment: {} }),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe("booker operations", () => {
  it("submits a booking as the signed-in booker", async () => {
    const { handler, rpc } = createHandler();

    const response = await handler.fetch(
      request("/api/meetings?operation=booker-submit", {
        ...FORM,
        // Far enough ahead for the real clock.
        startsOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "submit_meeting_booking_with_wifi",
      expect.objectContaining({
        p_booker_email: BOOKER.email,
        p_booker_name: BOOKER.name,
        p_booker_oid: OID,
        p_guests: [
          {
            email: "",
            fullName: "Kofi Boateng",
            organization: "World Bank",
            phone: "+233240000001",
          },
        ],
        p_ends_on: null,
        p_host_division: "Budget Office",
        p_recurrence_days: [],
        p_schedule_type: "single",
        p_title: "Budget review",
        p_floor: "3",
        p_wifi_requested: false,
      }),
    );
  });

  it("drops the division for agencies outside the Ministry", async () => {
    const { handler, rpc } = createHandler();

    await handler.fetch(
      request("/api/meetings?operation=booker-submit", {
        ...FORM,
        hostAgency: "IAA",
        startsOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      }),
    );

    expect(rpc).toHaveBeenCalledWith(
      "submit_meeting_booking_with_wifi",
      expect.objectContaining({ p_host_division: "" }),
    );
  });

  it("returns 401 without touching the database when sign-in fails", async () => {
    const { handler, rpc } = createHandler({
      verify: vi.fn().mockRejectedValue(
        new HttpError("Sign in with your work email to continue.", 401),
      ),
    });

    const response = await handler.fetch(
      request("/api/meetings?operation=booker-list", {}),
    );

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("expires overdue requests and emails their bookers before listing", async () => {
    const expiredBooking = { bookingId: BOOKING_ID, status: "expired" };
    const { handler, rpc, sendBookingEmail } = createHandler({
      data: { bookings: [] },
      expired: [expiredBooking],
    });

    const response = await handler.fetch(
      request("/api/meetings?operation=booker-list", {}),
    );

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "expire_meeting_bookings",
      "get_booker_meeting_bookings",
    ]);
    expect(sendBookingEmail).toHaveBeenCalledWith(expiredBooking);
    expect(rpc).toHaveBeenLastCalledWith("get_booker_meeting_bookings", {
      p_booker_oid: OID,
    });
  });

  it("reports a booking that is not the booker's as not found", async () => {
    const { handler } = createHandler({
      data: null,
      error: { code: "P0002", message: "Booking not found" },
    });

    const response = await handler.fetch(
      request("/api/meetings?operation=booker-cancel", { bookingId: BOOKING_ID }),
    );

    expect(response.status).toBe(404);
  });
});

describe("reception decisions", () => {
  it("approves a request and emails the booker", async () => {
    const decided = {
      bookerEmail: BOOKER.email,
      bookingId: BOOKING_ID,
      status: "approved",
    };
    const { handler, rpc, sendBookingEmail } = createHandler({ data: decided });

    const response = await handler.fetch(
      request("/api/meetings?operation=booking-decide", {
        bookingId: BOOKING_ID,
        decision: "approve",
        tower: "tower_2",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ emailSent: true, status: "approved" });
    expect(rpc).toHaveBeenCalledWith("decide_meeting_booking", {
      p_actor_id: USER_ID,
      p_booking_id: BOOKING_ID,
      p_decision: "approve",
      p_reason: "",
      p_tower: "tower_2",
    });
    expect(sendBookingEmail).toHaveBeenCalledWith(decided);
  });

  it("still succeeds when the email cannot be sent", async () => {
    const { handler } = createHandler({
      data: { bookingId: BOOKING_ID, status: "rejected" },
      sendBookingEmail: vi.fn().mockRejectedValue(new Error("SMTP down")),
    });

    const response = await handler.fetch(
      request("/api/meetings?operation=booking-decide", {
        bookingId: BOOKING_ID,
        decision: "reject",
        reason: "Room unavailable",
        tower: "tower_2",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ emailSent: false });
  });
});

describe("booking schedules", () => {
  it("finds the first day a weekly meeting happens", () => {
    expect(
      firstMeetingDay({
        endsOn: "2026-12-01",
        recurrenceDays: [1, 3],
        scheduleType: "weekly",
        startsOn: "2026-11-19",
      }),
    ).toBe("2026-11-23");
  });

  it("describes each kind of schedule", () => {
    const times = { endsAt: "11:00", startsAt: "10:00" };

    expect(
      formatBookingSchedule({ ...times, scheduleType: "single", startsOn: "2026-11-18" }),
    ).toBe("Wed, 18 Nov 2026 · 10:00 – 11:00");
    expect(
      formatBookingSchedule({
        ...times,
        endsOn: "2026-11-21",
        scheduleType: "continuous",
        startsOn: "2026-11-18",
      }),
    ).toBe("Every day · 18 Nov – 21 Nov 2026 · 10:00 – 11:00");
    expect(
      formatBookingSchedule({
        ...times,
        endsOn: "2026-12-16",
        recurrenceDays: [3, 1],
        scheduleType: "weekly",
        startsOn: "2026-11-18",
      }),
    ).toBe("Every Mon, Wed · 18 Nov – 16 Dec 2026 · 10:00 – 11:00");
  });

  it("treats a weekly range with one meeting as a single day", () => {
    expect(
      isMultiDayBooking({
        endsOn: "2026-11-20",
        meetingDate: "2026-11-18",
        recurrenceDays: [3],
        scheduleType: "weekly",
        startsOn: "2026-11-18",
      }),
    ).toBe(false);
    expect(
      isMultiDayBooking({
        endsOn: "2026-11-20",
        meetingDate: "2026-11-18",
        scheduleType: "continuous",
        startsOn: "2026-11-18",
      }),
    ).toBe(true);
  });
});

describe("booking emails", () => {
  it("tells the booker how guests check in on later days", () => {
    const message = createMeetingBookingMessage(
      {
        bookerName: "Ama Mensah",
        endsAt: "11:00",
        endsOn: "2026-11-20",
        guests: [{}],
        meetingDate: "2026-11-18",
        referenceCode: "MTG-A1B2C3",
        scheduleType: "continuous",
        startsAt: "10:00",
        startsOn: "2026-11-18",
        status: "approved",
        title: "Budget workshop",
        venue: "Room 4",
      },
      { myBookingsUrl: "https://example.gov.gh/book/mine" },
    );

    expect(message.text).toContain("When: Every day · 18 Nov – 20 Nov 2026 · 10:00 – 11:00");
    expect(message.text).toContain("Guests expected: Wed, 18 Nov 2026");
    expect(message.text).toContain(LATER_DAYS_NOTE);
  });

  it("includes the rejection reason and escapes HTML", () => {
    const message = createMeetingBookingMessage(
      {
        bookerName: "Ama <Mensah>",
        decisionReason: "Room unavailable",
        endsAt: "11:00",
        guests: [{}, {}],
        meetingDate: "2026-11-18",
        referenceCode: "MTG-A1B2C3",
        startsAt: "10:00",
        status: "rejected",
        title: "Budget review",
        venue: null,
      },
      { myBookingsUrl: "https://example.gov.gh/book/mine" },
    );

    expect(message.subject).toBe("Meeting not approved: Budget review");
    expect(message.text).toContain("Reason: Room unavailable");
    expect(message.text).toContain("Guests: 2");
    expect(message.html).toContain("Ama &lt;Mensah&gt;");
    expect(message.html).not.toContain("Ama <Mensah>");
  });
});
