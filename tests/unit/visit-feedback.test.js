import { describe, expect, it, vi } from "vitest";
import { summariseFeedback } from "../../api/_lib/visitFeedbackReport.js";
import { createRegisterHandler } from "../../api/register.js";
import { notify } from "../../src/server/notify.js";
import {
  createFeedbackCode,
  createFeedbackToken,
  feedbackShortUrl,
  hashFeedbackToken,
  isFeedbackCode,
  requestVisitFeedback,
} from "../../src/server/visitFeedback.js";

// A tiny fake of the Supabase query builder: from(table) → rows by table.
function fakeClient({ inserts = [], rows = {}, insertError = null, rpc } = {}) {
  return {
    from(table) {
      const chain = {
        eq: () => chain,
        insert: async (row) => {
          inserts.push({ row, table });
          return { error: insertError };
        },
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        select: () => chain,
      };

      return chain;
    },
    inserts,
    rpc,
  };
}

describe("feedback keys", () => {
  it("store only a SHA-256 hash of a random token", () => {
    const { hash, token } = createFeedbackToken();

    expect(hash).toBe(hashFeedbackToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(createFeedbackToken().hash).not.toBe(hash);
  });
});

describe("short feedback codes", () => {
  it("are 8 characters without look-alikes and build the short link", () => {
    const codes = new Set(Array.from({ length: 500 }, () => createFeedbackCode()));

    expect(codes.size).toBe(500);
    for (const code of codes) {
      expect(isFeedbackCode(code)).toBe(true);
      expect(code).not.toMatch(/[0O1Il]/);
    }
    expect(isFeedbackCode("K7pQ2xZ0")).toBe(false);
    expect(feedbackShortUrl("K7pQ2xZm", {})).toBe("https://mofv.vercel.app/f/K7pQ2xZm");
    expect(feedbackShortUrl("K7pQ2xZm", { FEEDBACK_SHORT_LINK_BASE: "https://mofv.gh/" })).toBe("https://mofv.gh/f/K7pQ2xZm");
  });
});

describe("feedback request at check-out", () => {
  const now = () => new Date("2026-11-24T12:00:00Z");

  it("saves the row with a 7-day expiry and texts the short link", async () => {
    const client = fakeClient({
      rows: {
        visitor_profiles: { full_name: "Ama Mensah", phone: "+233241112233" },
        visits: { id: "v1", reference_code: "VIS-7F31A2", visitor_id: "p1" },
      },
    });
    const notifyVisitor = vi.fn().mockResolvedValue({ channel: "sms", status: "accepted" });

    const result = await requestVisitFeedback({ client, notifyVisitor, now, reference: "VIS-7F31A2", visitId: "v1" });

    expect(result).toEqual({ sent: true });
    const saved = client.inserts[0];
    expect(saved.table).toBe("visit_feedback");
    expect(saved.row.expires_at).toBe("2026-12-01T12:00:00.000Z");
    expect(saved.row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(isFeedbackCode(saved.row.short_code)).toBe(true);
    const call = notifyVisitor.mock.calls[0][0];
    expect(call).toMatchObject({ parameters: ["Ama"], purpose: "visit_feedback", referenceCode: "VIS-7F31A2" });
    expect(call.smsContext).toEqual({ shortUrl: `https://mofv.vercel.app/f/${saved.row.short_code}` });
  });

  it("skips visitors without a phone and visits already asked", async () => {
    const notifyVisitor = vi.fn();
    const noPhone = fakeClient({ rows: { visitor_profiles: { phone: "" }, visits: { id: "v1", visitor_id: "p1" } } });
    const asked = fakeClient({
      insertError: { code: "23505" },
      rows: { visitor_profiles: { phone: "+233241112233" }, visits: { id: "v1", visitor_id: "p1" } },
    });

    await expect(requestVisitFeedback({ client: noPhone, notifyVisitor, visitId: "v1" })).resolves.toEqual({
      reason: "no_phone",
      sent: false,
    });
    await expect(requestVisitFeedback({ client: asked, notifyVisitor, visitId: "v1" })).resolves.toEqual({
      reason: "already_requested",
      sent: false,
    });
    expect(notifyVisitor).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    const client = { from: () => { throw new Error("db down"); } };

    await expect(
      requestVisitFeedback({ client, logger: { error: vi.fn() }, visitId: "v1" }),
    ).resolves.toEqual({ reason: "error", sent: false });
  });
});

describe("feedback message", () => {
  it("uses the approved wording with the short link", async () => {
    const recorder = { insert: vi.fn().mockResolvedValue("row-1"), update: vi.fn() };
    const sms = vi.fn().mockResolvedValue({ provider: "arkesel", providerMessageId: "a1" });

    await expect(
      notify({
        environment: { SMS_PROVIDER: "arkesel" },
        logger: { error: vi.fn() },
        parameters: ["Ama"],
        phone: "+233241112233",
        purpose: "visit_feedback",
        recorder,
        sms,
        smsContext: { shortUrl: "https://mofv.vercel.app/f/K7pQ2xZm" },
      }),
    ).resolves.toEqual({ channel: "sms", status: "accepted" });
    expect(sms.mock.calls[0][0].message).toBe(
      [
        "Dear Ama,",
        "",
        "Thank you for visiting the Ministry of Finance.",
        "",
        "We hope you had a pleasant experience. Kindly share your feedback to help us improve our services.",
        "",
        "https://mofv.vercel.app/f/K7pQ2xZm",
      ].join("\n"),
    );
  });
});

describe("public feedback endpoints", () => {
  const CODE = "K7pQ2xZm";
  const hash = createFeedbackToken().hash;
  const post = (operation, body) =>
    new Request(`https://example.test/api/register?operation=${operation}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

  function handlerWith(client) {
    return createRegisterHandler({
      enforceRateLimitForRequest: vi.fn().mockResolvedValue(undefined),
      getAdminClientForRequest: () => client,
    });
  }

  it("shows an open link and refuses an unknown one", async () => {
    const open = handlerWith(
      fakeClient({
        rows: {
          visit_feedback: { expires_at: "2999-01-01T00:00:00Z", submitted_at: null, visit_id: "v1" },
          visits: { checked_out_at: "2026-11-24T11:00:00Z", reference_code: "VIS-7F31A2" },
        },
      }),
    );
    const unknown = handlerWith(fakeClient());

    const ok = await open.fetch(post("feedback-view", { code: CODE }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).feedback).toMatchObject({ reference: "VIS-7F31A2", status: "open" });

    expect((await unknown.fetch(post("feedback-view", { code: CODE }))).status).toBe(404);
    expect((await unknown.fetch(post("feedback-view", { code: "bad-code" }))).status).toBe(404);
    expect((await open.fetch(post("feedback-view", { token: "a".repeat(43) }))).status).toBe(404);
  });

  it("saves one rating and reports a used link", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { reference: "VIS-7F31A2" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "55000" } });
    const handler = handlerWith(
      fakeClient({
        rows: {
          visit_feedback: { expires_at: "2999-01-01T00:00:00Z", submitted_at: null, token_hash: hash, visit_id: "v1" },
        },
        rpc,
      }),
    );

    const saved = await handler.fetch(post("feedback-submit", { code: CODE, comment: "Quick and friendly", rating: 5 }));
    const again = await handler.fetch(post("feedback-submit", { code: CODE, rating: 4 }));
    const bad = await handler.fetch(post("feedback-submit", { code: CODE, rating: 9 }));

    expect(saved.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("submit_visit_feedback", {
      p_comment: "Quick and friendly",
      p_rating: 5,
      p_token_hash: hash,
    });
    expect(again.status).toBe(410);
    expect(bad.status).toBe(400);
  });
});

describe("feedback summary", () => {
  it("averages to one decimal and counts each star level", () => {
    expect(summariseFeedback([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({
      average: 4.3,
      distribution: [
        { count: 0, stars: 1 },
        { count: 0, stars: 2 },
        { count: 0, stars: 3 },
        { count: 2, stars: 4 },
        { count: 1, stars: 5 },
      ],
      total: 3,
    });
    expect(summariseFeedback([]).average).toBeNull();
  });
});
