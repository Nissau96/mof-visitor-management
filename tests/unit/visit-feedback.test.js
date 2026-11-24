import { describe, expect, it, vi } from "vitest";
import { summariseFeedback } from "../../api/_lib/visitFeedbackReport.js";
import { createRegisterHandler } from "../../api/register.js";
import { notify } from "../../src/server/notify.js";
import {
  createFeedbackToken,
  hashFeedbackToken,
  isFeedbackToken,
  requestVisitFeedback,
} from "../../src/server/visitFeedback.js";
import { sendWhatsappTemplate } from "../../src/server/whatsappSender.js";

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

describe("feedback tokens", () => {
  it("are 43-character base64url values stored only as a SHA-256 hash", () => {
    const { hash, token } = createFeedbackToken();

    expect(isFeedbackToken(token)).toBe(true);
    expect(hash).toBe(hashFeedbackToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(isFeedbackToken("short")).toBe(false);
    expect(isFeedbackToken(`${token}/..`)).toBe(false);
  });
});

describe("feedback request at check-out", () => {
  const now = () => new Date("2026-11-24T12:00:00Z");

  it("saves the token hash with a 7-day expiry and sends the WhatsApp link", async () => {
    const client = fakeClient({
      rows: {
        visitor_profiles: { phone: "+233241112233" },
        visits: { id: "v1", reference_code: "VIS-7F31A2", visitor_id: "p1" },
      },
    });
    const notifyVisitor = vi.fn().mockResolvedValue({ channel: "whatsapp", status: "accepted" });

    const result = await requestVisitFeedback({ client, notifyVisitor, now, reference: "VIS-7F31A2", visitId: "v1" });

    expect(result).toEqual({ sent: true });
    const saved = client.inserts[0];
    expect(saved.table).toBe("visit_feedback");
    expect(saved.row.expires_at).toBe("2026-12-01T12:00:00.000Z");
    const call = notifyVisitor.mock.calls[0][0];
    expect(call).toMatchObject({ parameters: ["VIS-7F31A2"], purpose: "visit_feedback", referenceCode: "VIS-7F31A2" });
    expect(hashFeedbackToken(call.buttonParameters[0])).toBe(saved.row.token_hash);
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
  it("fills the URL button with the token", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({ json: async () => ({ messages: [{ id: "wamid.F" }] }), ok: true, status: 200 });

    await sendWhatsappTemplate({
      buttonParameters: ["tok123"],
      environment: { WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1485090471365109", WHATSAPP_PROVIDER: "meta" },
      fetchImplementation,
      parameters: ["VIS-7F31A2"],
      phone: "+233241112233",
      template: "visit_feedback",
    });

    const body = JSON.parse(fetchImplementation.mock.calls[0][1].body);
    expect(body.template.components[1]).toEqual({
      index: "0",
      parameters: [{ text: "tok123", type: "text" }],
      sub_type: "url",
      type: "button",
    });
  });

  it("is WhatsApp only: no SMS when WhatsApp fails", async () => {
    const recorder = { insert: vi.fn().mockResolvedValue("row-1"), update: vi.fn() };
    const senders = { sms: vi.fn(), whatsapp: vi.fn().mockRejectedValue(new Error("refused")) };

    await expect(
      notify({
        buttonParameters: ["tok"],
        environment: { VERCEL_ENV: "preview" },
        logger: { error: vi.fn() },
        parameters: ["VIS-7F31A2"],
        phone: "+233241112233",
        purpose: "visit_feedback",
        recorder,
        senders,
      }),
    ).resolves.toEqual({ channel: null, status: "failed" });
    expect(senders.sms).not.toHaveBeenCalled();
  });
});

describe("public feedback endpoints", () => {
  const token = createFeedbackToken().token;
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

    const ok = await open.fetch(post("feedback-view", { token }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).feedback).toMatchObject({ reference: "VIS-7F31A2", status: "open" });

    expect((await unknown.fetch(post("feedback-view", { token }))).status).toBe(404);
    expect((await unknown.fetch(post("feedback-view", { token: "bad" }))).status).toBe(404);
  });

  it("saves one rating and reports a used link", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { reference: "VIS-7F31A2" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "55000" } });
    const handler = handlerWith(
      fakeClient({ rows: { visit_feedback: { expires_at: "2999-01-01T00:00:00Z", submitted_at: null, visit_id: "v1" } }, rpc }),
    );

    const saved = await handler.fetch(post("feedback-submit", { comment: "Quick and friendly", rating: 5, token }));
    const again = await handler.fetch(post("feedback-submit", { rating: 4, token }));
    const bad = await handler.fetch(post("feedback-submit", { rating: 9, token }));

    expect(saved.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("submit_visit_feedback", {
      p_comment: "Quick and friendly",
      p_rating: 5,
      p_token_hash: hashFeedbackToken(token),
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
