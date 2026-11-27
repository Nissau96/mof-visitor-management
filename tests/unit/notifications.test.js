import { describe, expect, it, vi } from "vitest";
import { describeMessages } from "../../src/lib/visitMessages.js";
import { notify } from "../../src/server/notify.js";
import { sendSms } from "../../src/server/smsSender.js";

function response(body, { ok = true, status = 200 } = {}) {
  return { json: async () => body, ok, status };
}

function memoryRecorder() {
  const rows = [];

  return {
    insert: vi.fn(async (row) => {
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
    environment: { SMS_PROVIDER: "arkesel" },
    logger: { error: vi.fn(), info: vi.fn() },
    parameters: ["24 Nov 2026", "Isaac Sam", "VIS-7F31A2"],
    phone: "+233241112233",
    purpose: "booking_confirmation",
    referenceCode: "VIS-7F31A2",
  };

  it("sends by SMS and records it without the message text", async () => {
    const recorder = memoryRecorder();
    const sms = vi.fn().mockResolvedValue({ provider: "arkesel", providerMessageId: "ark-1" });

    await expect(notify({ ...base, recorder, sms })).resolves.toEqual({ channel: "sms", status: "accepted" });
    expect(sms.mock.calls[0][0].message).toBe(
      "Ministry of Finance: your visit on 24 Nov 2026 with Isaac Sam is booked. Show code VIS-7F31A2 at reception.",
    );
    expect(recorder.rows).toEqual([
      {
        channel: "sms",
        id: "row-1",
        meeting_id: null,
        phone_last4: "2233",
        provider: "arkesel",
        provider_message_id: "ark-1",
        purpose: "booking_confirmation",
        reference_code: "VIS-7F31A2",
        status: "accepted",
      },
    ]);
    expect(JSON.stringify(recorder.rows)).not.toContain("Isaac Sam");
  });

  it("keeps the Wi-Fi password out of the log", async () => {
    const recorder = memoryRecorder();
    const sms = vi.fn().mockResolvedValue({ provider: "arkesel", providerMessageId: "ark-9" });

    await expect(
      notify({
        ...base,
        parameters: ["MoF-Guest", "Volta-Cedar-4821", "25 Nov 2026", "6:00 pm"],
        purpose: "wifi_details",
        recorder,
        sms,
      }),
    ).resolves.toEqual({ channel: "sms", status: "accepted" });
    expect(JSON.stringify(recorder.rows)).not.toContain("Volta-Cedar-4821");
  });

  it("does not send a feedback message without its link", async () => {
    const sms = vi.fn();

    await expect(
      notify({ ...base, parameters: ["Ama"], purpose: "visit_feedback", recorder: memoryRecorder(), sms }),
    ).resolves.toEqual({ channel: null, status: "failed" });
    expect(sms).not.toHaveBeenCalled();
  });

  it("records a failed send without throwing", async () => {
    const recorder = memoryRecorder();
    const sms = vi.fn().mockRejectedValue(Object.assign(new Error("down"), { code: 500 }));

    await expect(notify({ ...base, recorder, sms })).resolves.toEqual({ channel: null, status: "failed" });
    expect(recorder.rows[0]).toMatchObject({ error: "code_500", status: "failed" });
  });

  it("fails without sending when SMS is not set up in Production", async () => {
    const sms = vi.fn();

    await expect(
      notify({ ...base, environment: { VERCEL_ENV: "production" }, recorder: memoryRecorder(), sms }),
    ).resolves.toEqual({ channel: null, status: "failed" });
    expect(sms).not.toHaveBeenCalled();
  });

  it("still sends when the log is unavailable", async () => {
    const recorder = { insert: vi.fn().mockRejectedValue(new Error("db down")), update: vi.fn() };
    const sms = vi.fn().mockResolvedValue({ provider: "arkesel", providerMessageId: "ark-2" });

    await expect(notify({ ...base, recorder, sms })).resolves.toEqual({ channel: "sms", status: "accepted" });
    expect(sms).toHaveBeenCalledTimes(1);
  });
});

describe("visit drawer message lines", () => {
  it("shows one line per SMS and leaves out other channels", () => {
    const lines = describeMessages([
      { channel: "sms", createdAt: "2026-11-24T09:00:01Z", fallbackOf: null, id: "b", purpose: "wifi_details", status: "delivered" },
      { channel: "sms", createdAt: "2026-11-24T08:00:00Z", fallbackOf: null, id: "d", purpose: "card_issued", status: "failed" },
      { channel: "whatsapp", createdAt: "2026-11-23T10:00:00Z", fallbackOf: null, id: "c", purpose: "booking_confirmation", status: "read" },
    ]);

    expect(lines.map((line) => [line.label, line.text, line.tone])).toEqual([
      ["Wi-Fi details", "Delivered by SMS", "delivered"],
      ["Visitor card", "SMS failed", "failed"],
    ]);
  });
});
