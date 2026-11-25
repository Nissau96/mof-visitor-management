import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createWebhooksHandler, verifyMetaSignature } from "../../api/webhooks.js";
import { describeMessages } from "../../src/lib/visitMessages.js";
import { notify, sendSmsFallback } from "../../src/server/notify.js";
import { sendSms } from "../../src/server/smsSender.js";
import {
  WhatsappSendError,
  WhatsappUnavailableError,
  resolveWhatsappProvider,
  sendWhatsappTemplate,
} from "../../src/server/whatsappSender.js";

const META_ENV = {
  WHATSAPP_ACCESS_TOKEN: "test-token",
  WHATSAPP_GRAPH_VERSION: "25.0",
  WHATSAPP_PHONE_NUMBER_ID: "1485090471365109",
  WHATSAPP_PROVIDER: "meta",
};

function response(body, { ok = true, status = 200 } = {}) {
  return { json: async () => body, ok, status };
}

function memoryRecorder() {
  const rows = [];

  return {
    insert: vi.fn(async (row) => {
      if (row.fallback_of && rows.some((other) => other.fallback_of === row.fallback_of)) {
        throw new Error("duplicate fallback");
      }

      const id = `row-${rows.length + 1}`;
      rows.push({ id, ...row });
      return id;
    }),
    rows,
    update: vi.fn(async (id, patch) => {
      Object.assign(rows.find((row) => row.id === id), patch);
    }),
  };
}

describe("WhatsApp sender", () => {
  it("logs outside Production when no provider is set and refuses in Production", () => {
    expect(resolveWhatsappProvider({ VERCEL_ENV: "preview" })).toBe("log");
    expect(() => resolveWhatsappProvider({ VERCEL_ENV: "production" })).toThrow(WhatsappUnavailableError);
    expect(() => resolveWhatsappProvider({ WHATSAPP_PROVIDER: "other" })).toThrow(WhatsappUnavailableError);
  });

  it("sends an en_US template to Meta and returns the message id", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(response({ messages: [{ id: "wamid.ABC" }] }));

    const result = await sendWhatsappTemplate({
      environment: META_ENV,
      fetchImplementation,
      parameters: ["24 Nov 2026", "Isaac Sam", "VIS-7F31A2"],
      phone: "+233241112233",
      template: "visit_booked",
    });

    expect(result).toEqual({ provider: "meta", providerMessageId: "wamid.ABC" });
    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v25.0/1485090471365109/messages");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      template: {
        components: [
          {
            parameters: [
              { text: "24 Nov 2026", type: "text" },
              { text: "Isaac Sam", type: "text" },
              { text: "VIS-7F31A2", type: "text" },
            ],
            type: "body",
          },
        ],
        language: { code: "en_US" },
        name: "visit_booked",
      },
      to: "233241112233",
      type: "template",
    });
  });

  it("maps Meta errors", async () => {
    const refused = vi.fn().mockResolvedValue(response({ error: { code: 131026 } }, { ok: false, status: 400 }));
    const badToken = vi.fn().mockResolvedValue(response({ error: { code: 190 } }, { ok: false, status: 401 }));
    const options = { environment: META_ENV, parameters: [], phone: "+233241112233", template: "visit_booked" };

    await expect(sendWhatsappTemplate({ ...options, fetchImplementation: refused })).rejects.toMatchObject({
      code: "131026",
      name: "WhatsappSendError",
    });
    await expect(sendWhatsappTemplate({ ...options, fetchImplementation: badToken })).rejects.toBeInstanceOf(
      WhatsappUnavailableError,
    );
  });
});

describe("SMS sender result", () => {
  it("returns Arkesel's message id", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      response({ data: [{ id: "ark-1", recipient: "233241112233" }], status: "success" }),
    );

    await expect(
      sendSms({
        environment: { ARKESEL_API_KEY: "k", SMS_PROVIDER: "arkesel", SMS_SENDER_ID: "MOFVMSDEMO" },
        fetchImplementation,
        message: "hi",
        phone: "+233241112233",
      }),
    ).resolves.toEqual({ provider: "arkesel", providerMessageId: "ark-1" });
  });
});

describe("notify()", () => {
  const base = {
    environment: { VERCEL_ENV: "preview" },
    logger: { error: vi.fn(), info: vi.fn() },
    parameters: ["24 Nov 2026", "Isaac Sam", "VIS-7F31A2"],
    phone: "+233241112233",
    purpose: "booking_confirmation",
    referenceCode: "VIS-7F31A2",
  };

  it("sends WhatsApp and records it without the message text", async () => {
    const recorder = memoryRecorder();
    const senders = {
      sms: vi.fn(),
      whatsapp: vi.fn().mockResolvedValue({ provider: "meta", providerMessageId: "wamid.1" }),
    };

    await expect(notify({ ...base, recorder, senders })).resolves.toEqual({ channel: "whatsapp", status: "accepted" });
    expect(senders.sms).not.toHaveBeenCalled();
    expect(recorder.rows).toEqual([
      {
        channel: "whatsapp",
        id: "row-1",
        meeting_id: null,
        phone_last4: "2233",
        provider: "meta",
        provider_message_id: "wamid.1",
        purpose: "booking_confirmation",
        reference_code: "VIS-7F31A2",
        status: "accepted",
        template: "visit_booked",
      },
    ]);
    expect(JSON.stringify(recorder.rows)).not.toContain("Isaac Sam");
  });

  it("falls back to SMS when WhatsApp refuses, linked to the WhatsApp row", async () => {
    const recorder = memoryRecorder();
    const senders = {
      sms: vi.fn().mockResolvedValue({ provider: "log", providerMessageId: null }),
      whatsapp: vi.fn().mockRejectedValue(new WhatsappSendError("refused", 131026)),
    };

    await expect(notify({ ...base, recorder, senders })).resolves.toEqual({ channel: "sms", status: "accepted" });
    expect(senders.sms.mock.calls[0][0].message).toBe(
      "Ministry of Finance: your visit on 24 Nov 2026 with Isaac Sam is booked. Show code VIS-7F31A2 at reception.",
    );
    expect(recorder.rows.map((row) => [row.channel, row.status, row.error, row.fallback_of])).toEqual([
      ["whatsapp", "failed", "code_131026", undefined],
      ["sms", "accepted", undefined, "row-1"],
    ]);
  });

  it("sends Wi-Fi details by SMS only, never through WhatsApp", async () => {
    const recorder = memoryRecorder();
    const senders = {
      sms: vi.fn().mockResolvedValue({ provider: "arkesel", providerMessageId: "ark-9" }),
      whatsapp: vi.fn(),
    };

    await expect(
      notify({ ...base, parameters: ["MoF-Guest", "Volta-Cedar-4821", "18:00"], purpose: "wifi_details", recorder, senders }),
    ).resolves.toEqual({ channel: "sms", status: "accepted" });
    expect(senders.whatsapp).not.toHaveBeenCalled();
    expect(recorder.rows).toHaveLength(1);
    expect(recorder.rows[0]).toMatchObject({ channel: "sms", fallback_of: null, provider: "log", purpose: "wifi_details" });
    expect(JSON.stringify(recorder.rows)).not.toContain("Volta-Cedar-4821");
  });

  it("goes straight to SMS when WhatsApp is switched off", async () => {
    const recorder = memoryRecorder();
    const senders = {
      sms: vi.fn().mockResolvedValue({ provider: "arkesel", providerMessageId: "ark-1" }),
      whatsapp: vi.fn(),
    };

    await expect(
      notify({ ...base, environment: { SMS_PROVIDER: "arkesel", WHATSAPP_PROVIDER: "off" }, recorder, senders }),
    ).resolves.toEqual({ channel: "sms", status: "accepted" });
    expect(senders.whatsapp).not.toHaveBeenCalled();
    expect(recorder.rows.map((row) => [row.channel, row.fallback_of])).toEqual([["sms", null]]);

    await expect(
      notify({ ...base, buttonParameters: ["t"], environment: { WHATSAPP_PROVIDER: "off" }, purpose: "visit_feedback", recorder, senders }),
    ).resolves.toEqual({ channel: null, status: "failed" });
    expect(senders.whatsapp).not.toHaveBeenCalled();
  });

  it("reports failure without throwing when nothing can send", async () => {
    const recorder = memoryRecorder();
    const senders = {
      sms: vi.fn().mockRejectedValue(new Error("down")),
      whatsapp: vi.fn().mockRejectedValue(new WhatsappUnavailableError()),
    };

    await expect(notify({ ...base, recorder, senders })).resolves.toEqual({ channel: null, status: "failed" });
    expect(recorder.rows.map((row) => row.status)).toEqual(["failed", "failed"]);
    expect(recorder.rows[0].error).toBe("not_configured");
  });

  it("still sends when the log is unavailable", async () => {
    const recorder = { insert: vi.fn().mockRejectedValue(new Error("db down")), update: vi.fn() };
    const senders = {
      sms: vi.fn(),
      whatsapp: vi.fn().mockResolvedValue({ provider: "meta", providerMessageId: "wamid.2" }),
    };

    await expect(notify({ ...base, recorder, senders })).resolves.toEqual({ channel: "whatsapp", status: "accepted" });
  });

  it("sends a claimed fallback only once", async () => {
    const recorder = memoryRecorder();
    const sms = vi.fn().mockResolvedValue({ provider: "log", providerMessageId: null });
    const options = {
      base: { meeting_id: null, phone_last4: "2233", purpose: "booking_confirmation", reference_code: "VIS-7F31A2" },
      environment: { VERCEL_ENV: "preview" },
      fallbackOf: "wa-row",
      logger: { error: vi.fn() },
      message: "text",
      phone: "+233241112233",
      recorder,
      sms,
    };

    await sendSmsFallback(options);
    await sendSmsFallback(options);

    expect(sms).toHaveBeenCalledTimes(1);
  });
});

describe("WhatsApp webhook", () => {
  const environment = { WHATSAPP_APP_SECRET: "app-secret", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify-me" };

  function signed(body, secret = "app-secret") {
    const raw = JSON.stringify(body);

    return {
      raw,
      signature: `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`,
    };
  }

  function post(raw, signature) {
    return new Request("https://example.test/api/webhooks?provider=whatsapp", {
      body: raw,
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      method: "POST",
    });
  }

  const statusEvent = (status) => ({
    entry: [{ changes: [{ value: { statuses: [{ errors: [{ code: 131026 }], id: "wamid.1", status }] } }] }],
  });

  it("verifies signatures", () => {
    const { raw, signature } = signed({ a: 1 });

    expect(verifyMetaSignature(raw, signature, "app-secret")).toBe(true);
    expect(verifyMetaSignature(`${raw} `, signature, "app-secret")).toBe(false);
    expect(verifyMetaSignature(raw, "", "app-secret")).toBe(false);
    expect(verifyMetaSignature(raw, signature, "other")).toBe(false);
  });

  it("answers Meta's handshake only with the right token", async () => {
    const handler = createWebhooksHandler({ environment });
    const url = "https://example.test/api/webhooks?provider=whatsapp&hub.mode=subscribe&hub.challenge=1158201444";

    const ok = await handler.fetch(new Request(`${url}&hub.verify_token=verify-me`));
    const bad = await handler.fetch(new Request(`${url}&hub.verify_token=wrong`));

    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("1158201444");
    expect(bad.status).toBe(403);
  });

  it("rejects a tampered body before touching the database", async () => {
    const getAdminClientForRequest = vi.fn();
    const handler = createWebhooksHandler({ environment, getAdminClientForRequest });
    const { signature } = signed(statusEvent("delivered"));

    const result = await handler.fetch(post(JSON.stringify(statusEvent("read")), signature));

    expect(result.status).toBe(401);
    expect(getAdminClientForRequest).not.toHaveBeenCalled();
  });

  it("updates the status and re-sends a failed booking confirmation by SMS", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        changed: true,
        channel: "whatsapp",
        hasFallback: false,
        id: "wa-row",
        purpose: "booking_confirmation",
        referenceCode: "VIS-7F31A2",
        status: "failed",
      },
      error: null,
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { host_name: "Isaac Sam", phone: "+233241112233", reference_code: "VIS-7F31A2", visit_date: "2026-11-24" },
    });
    const client = {
      from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
      rpc,
    };
    const sendFallback = vi.fn().mockResolvedValue({ channel: "sms", status: "accepted" });
    const handler = createWebhooksHandler({
      environment,
      getAdminClientForRequest: () => client,
      logger: { error: vi.fn() },
      sendFallback,
    });
    const { raw, signature } = signed(statusEvent("failed"));

    const result = await handler.fetch(post(raw, signature));

    expect(result.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("advance_notification_status", {
      p_error: "code_131026",
      p_provider: "meta",
      p_provider_message_id: "wamid.1",
      p_status: "failed",
    });
    expect(sendFallback).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackOf: "wa-row", phone: "+233241112233" }),
    );
    expect(sendFallback.mock.calls[0][0].message).toContain("VIS-7F31A2");
  });

  it("re-sends a failed card message by SMS with the assigned card", async () => {
    const rows = {
      visitor_card_assignments: { card_id: "c1" },
      visitor_cards: { card_number: "T1-014" },
      visitor_profiles: { full_name: "Ama Mensah", phone: "+233241112233" },
      visits: { id: "v1", reference_code: "VIS-7F31A2", visitor_id: "p1" },
    };
    const client = {
      from: (table) => {
        const chain = {
          eq: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: rows[table] }),
          select: () => chain,
        };

        return chain;
      },
      rpc: vi.fn().mockResolvedValue({
        data: {
          changed: true,
          channel: "whatsapp",
          hasFallback: false,
          id: "wa-card",
          purpose: "card_issued",
          referenceCode: "VIS-7F31A2",
          status: "failed",
        },
        error: null,
      }),
    };
    const sendFallback = vi.fn().mockResolvedValue({ channel: "sms", status: "accepted" });
    const handler = createWebhooksHandler({
      environment,
      getAdminClientForRequest: () => client,
      logger: { error: vi.fn() },
      sendFallback,
    });
    const { raw, signature } = signed(statusEvent("failed"));

    await handler.fetch(post(raw, signature));

    expect(sendFallback).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackOf: "wa-card", phone: "+233241112233" }),
    );
    expect(sendFallback.mock.calls[0][0].message).toContain("Visitor Card: T1-014");
  });
});

describe("visit drawer message lines", () => {
  it("merges a WhatsApp failure with its SMS fallback", () => {
    const lines = describeMessages([
      { channel: "whatsapp", createdAt: "2026-11-24T09:00:00Z", fallbackOf: null, id: "a", purpose: "wifi_details", status: "failed" },
      { channel: "sms", createdAt: "2026-11-24T09:00:01Z", fallbackOf: "a", id: "b", purpose: "wifi_details", status: "delivered" },
      { channel: "whatsapp", createdAt: "2026-11-23T10:00:00Z", fallbackOf: null, id: "c", purpose: "booking_confirmation", status: "read" },
    ]);

    expect(lines.map((line) => [line.label, line.text, line.tone])).toEqual([
      ["Wi-Fi details", "WhatsApp failed, delivered on SMS", "delivered"],
      ["Booking confirmation", "Read on WhatsApp", "delivered"],
    ]);
  });
});
