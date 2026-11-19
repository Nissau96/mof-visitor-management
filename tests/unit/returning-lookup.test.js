import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  SMS_GLOBAL_RATE_LIMIT,
  VISITOR_LOOKUP_RATE_LIMIT,
  VISITOR_VERIFICATION_RATE_LIMIT,
  createReturningVerifyHandler,
  smsCodesEnabled,
} from "../../api/returning/verify.js";
import {
  maskEmail,
  maskPhone,
} from "../../api/_lib/visitorLookup.js";
import { createWeeklyQrToken } from "../../src/server/weeklyQrAccess.js";

const PROFILE = {
  email: "patrick.mensah@example.invalid",
  full_name: "Patrick Kwame Mensah",
  organization: "Synthetic Holdings",
  visitor_id: "00000000-0000-4000-8000-0000000000c1",
};

describe("masking", () => {
  it("hides most of the phone number", () => {
    expect(maskPhone("+233241112233")).toBe("024 ••• ••33");
    expect(maskPhone("+447700900123")).toBe("+4477 ••• ••23");
    expect(maskPhone("")).toBe("");
  });

  it("hides most of the email address", () => {
    expect(maskEmail(PROFILE.email)).toBe("p•••••@example.invalid");
    expect(maskEmail("")).toBe("");
  });
});

describe("returning-visitor SMS code", () => {
  const SEND_URL = "https://visitor.example/api/returning/verify?operation=send-code";

  function codeRequest(body, url = "https://visitor.example/api/returning/verify") {
    const { token } = createWeeklyQrToken();

    return new Request(url, {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        cookie: `mof_visitor_weekly_access=${encodeURIComponent(token)}`,
      },
      method: "POST",
    });
  }

  function handlerWith({ rpcResult, visits = [], environment = {} }) {
    const visitsQuery = {
      eq: vi.fn(() => visitsQuery),
      limit: vi.fn(async () => ({ data: visits, error: null })),
      not: vi.fn(() => visitsQuery),
      order: vi.fn(() => visitsQuery),
      select: vi.fn(() => visitsQuery),
    };
    const client = {
      from: vi.fn(() => visitsQuery),
      rpc: vi.fn(async () => ({ data: rpcResult, error: null })),
      visitsQuery,
    };
    const sendSms = vi.fn().mockResolvedValue(undefined);
    const enforceRateLimitForRequest = vi.fn().mockResolvedValue(undefined);

    const handler = createReturningVerifyHandler({
      enforceRateLimitForRequest,
      environment: { RETURNING_SMS_CODES: "on", VERCEL_ENV: "preview", ...environment },
      getAdminClientForRequest: () => client,
      sendSms,
    });

    return { client, enforceRateLimitForRequest, handler, sendSms };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WEEKLY_QR_SECRET", "invented-weekly-qr-secret-for-unit-testing-only-2026");
    vi.stubEnv("VISITOR_LOOKUP_SECRET", "invented-visitor-lookup-secret-for-unit-tests-2026");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("texts a 6-digit code to a registered number, storing only hashes", async () => {
    const { client, handler, sendSms } = handlerWith({
      rpcResult: { registered: true, retryAfterSeconds: 0 },
    });

    const response = await handler.fetch(codeRequest({ phone: "024 111 2233" }, SEND_URL));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      codeLength: 6,
      expiresIn: 300,
      maskedPhone: "024 ••• ••33",
      resendAfterSeconds: 60,
    });

    const [name, args] = client.rpc.mock.calls[0];
    expect(name).toBe("create_visitor_sms_code");
    expect(args.p_phone).toBe("+233241112233");
    expect(args.p_phone_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_code_hash).toMatch(/^[0-9a-f]{64}$/);

    const { code, phone } = sendSms.mock.calls[0][0];
    expect(phone).toBe("+233241112233");
    expect(code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(body)).not.toContain(code);
  });

  it("answers the same for an unknown number and sends nothing", async () => {
    const known = handlerWith({ rpcResult: { registered: true, retryAfterSeconds: 0 } });
    const unknown = handlerWith({ rpcResult: { registered: false } });

    const knownBody = await (await known.handler.fetch(codeRequest({ phone: "024 111 2233" }, SEND_URL))).json();
    const unknownBody = await (await unknown.handler.fetch(codeRequest({ phone: "024 111 2233" }, SEND_URL))).json();

    expect(unknownBody).toEqual(knownBody);
    expect(unknown.sendSms).not.toHaveBeenCalled();
  });

  it("does not send again while the number must wait", async () => {
    const { handler, sendSms } = handlerWith({
      rpcResult: { registered: true, retryAfterSeconds: 42 },
    });

    const body = await (await handler.fetch(codeRequest({ phone: "024 111 2233" }, SEND_URL))).json();

    expect(sendSms).not.toHaveBeenCalled();
    expect(body.resendAfterSeconds).toBe(60);
  });

  it("asks visitors to see reception when Production has no SMS provider", async () => {
    const { client, handler } = handlerWith({
      environment: { VERCEL_ENV: "production" },
      rpcResult: {},
    });

    const response = await handler.fetch(codeRequest({ phone: "024 111 2233" }, SEND_URL));

    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/ask reception/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("caps code SMS across all numbers", async () => {
    const { enforceRateLimitForRequest, handler } = handlerWith({
      rpcResult: { registered: true, retryAfterSeconds: 0 },
    });

    await handler.fetch(codeRequest({ phone: "024 111 2233" }, SEND_URL));

    expect(enforceRateLimitForRequest).toHaveBeenCalledWith(expect.any(Request), SMS_GLOBAL_RATE_LIMIT);
    expect(SMS_GLOBAL_RATE_LIMIT).toMatchObject({ limit: 100, windowSeconds: 3600 });
  });

  it("returns the record and a check-in token for the right code", async () => {
    const { client, enforceRateLimitForRequest, handler } = handlerWith({
      rpcResult: {
        email: PROFILE.email,
        fullName: PROFILE.full_name,
        organization: PROFILE.organization,
        status: "verified",
        visitorId: PROFILE.visitor_id,
      },
      visits: [{ checked_in_at: "2026-10-14T09:15:00.000Z" }],
    });

    const response = await handler.fetch(codeRequest({ code: "123456", phone: "024 111 2233" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith("verify_visitor_sms_code", {
      p_code_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_phone_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(body.profile).toEqual({
      email: "p•••••@example.invalid",
      fullName: "Patrick Kwame Mensah",
      organization: "Synthetic Holdings",
      phone: "024 ••• ••33",
    });
    expect(body.lastVisitAt).toBe("2026-10-14T09:15:00.000Z");
    expect(body.verificationToken).toEqual(expect.any(String));
    expect(enforceRateLimitForRequest).toHaveBeenCalledWith(expect.any(Request), {
      ...VISITOR_VERIFICATION_RATE_LIMIT,
      subject: "+233241112233",
    });
  });

  it("says how many tries are left after a wrong code", async () => {
    const { handler } = handlerWith({ rpcResult: { attemptsLeft: 3, status: "wrong" } });

    const response = await handler.fetch(codeRequest({ code: "000000", phone: "024 111 2233" }));
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain("3 tries left");
    expect(text).not.toContain("Mensah");
  });

  it("asks for a new code once a code has expired", async () => {
    const { handler } = handlerWith({ rpcResult: { status: "expired" } });

    const response = await handler.fetch(codeRequest({ code: "000000", phone: "024 111 2233" }));

    expect(response.status).toBe(400);
    expect((await response.json()).expired).toBe(true);
  });

  it("rejects a code that is not 6 digits without asking the database", async () => {
    const { client, handler } = handlerWith({ rpcResult: {} });

    const response = await handler.fetch(codeRequest({ code: "12ab", phone: "024 111 2233" }));

    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe("returning-visitor lookup with SMS codes off", () => {
  function lookupRequest(body, { method = "POST", url = "https://visitor.example/api/returning/verify" } = {}) {
    const { token } = createWeeklyQrToken();

    return new Request(url, {
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      headers: {
        "Content-Type": "application/json",
        cookie: `mof_visitor_weekly_access=${encodeURIComponent(token)}`,
      },
      method,
    });
  }

  function handlerWith(rows) {
    const visitsQuery = {
      eq: vi.fn(() => visitsQuery),
      limit: vi.fn(async () => ({ data: [], error: null })),
      not: vi.fn(() => visitsQuery),
      order: vi.fn(() => visitsQuery),
      select: vi.fn(() => visitsQuery),
    };
    const client = {
      from: vi.fn(() => visitsQuery),
      rpc: vi.fn(async () => ({ data: rows, error: null })),
    };
    const sendSms = vi.fn();
    const enforceRateLimitForRequest = vi.fn().mockResolvedValue(undefined);

    const handler = createReturningVerifyHandler({
      enforceRateLimitForRequest,
      environment: { VERCEL_ENV: "production" },
      getAdminClientForRequest: () => client,
      sendSms,
    });

    return { client, enforceRateLimitForRequest, handler, sendSms };
  }

  beforeEach(() => {
    vi.stubEnv("WEEKLY_QR_SECRET", "invented-weekly-qr-secret-for-unit-testing-only-2026");
    vi.stubEnv("VISITOR_LOOKUP_SECRET", "invented-visitor-lookup-secret-for-unit-tests-2026");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off unless RETURNING_SMS_CODES is on", () => {
    expect(smsCodesEnabled({})).toBe(false);
    expect(smsCodesEnabled({ RETURNING_SMS_CODES: "off" })).toBe(false);
    expect(smsCodesEnabled({ RETURNING_SMS_CODES: " ON " })).toBe(true);
  });

  it("tells the page which flow to show", async () => {
    const { handler } = handlerWith([]);

    const response = await handler.fetch(
      lookupRequest(null, {
        method: "GET",
        url: "https://visitor.example/api/returning/verify?operation=mode",
      }),
    );

    expect(await response.json()).toEqual({ smsCodes: false });
  });

  it("finds the record by mobile number alone", async () => {
    const { client, enforceRateLimitForRequest, handler } = handlerWith([PROFILE]);

    const response = await handler.fetch(lookupRequest({ phone: "024 111 2233" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith("find_returning_visitor_by_phone", {
      p_phone: "+233241112233",
    });
    expect(body.profile).toEqual({
      email: "p•••••@example.invalid",
      fullName: "Patrick Kwame Mensah",
      organization: "Synthetic Holdings",
      phone: "024 ••• ••33",
    });
    expect(body.verificationToken).toEqual(expect.any(String));
    expect(enforceRateLimitForRequest).toHaveBeenCalledWith(expect.any(Request), {
      ...VISITOR_LOOKUP_RATE_LIMIT,
      subject: "+233241112233",
    });
  });

  it("says when the number is not registered", async () => {
    const { handler } = handlerWith([]);

    const response = await handler.fetch(lookupRequest({ phone: "024 999 8877" }));

    expect(response.status).toBe(400);
    expect((await response.json()).notFound).toBe(true);
  });

  it("does not send codes while they are off", async () => {
    const { client, handler, sendSms } = handlerWith([PROFILE]);

    const response = await handler.fetch(
      lookupRequest(
        { phone: "024 111 2233" },
        { url: "https://visitor.example/api/returning/verify?operation=send-code" },
      ),
    );

    expect(response.status).toBe(404);
    expect(sendSms).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
