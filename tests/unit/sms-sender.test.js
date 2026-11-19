import { describe, expect, it, vi } from "vitest";
import {
  SmsUnavailableError,
  createCodeMessage,
  resolveSmsProvider,
  sendVisitorCodeSms,
} from "../../src/server/smsSender.js";

function okFetch(body = {}) {
  return vi.fn().mockResolvedValue({
    json: async () => body,
    ok: true,
    status: 200,
  });
}

describe("SMS sender", () => {
  it("uses the approved message wording", () => {
    expect(createCodeMessage("012345")).toBe(
      "Your Ministry of Finance visitor code is 012345. It expires in 5 minutes. Do not share this code.",
    );
  });

  it("logs codes outside Production when no provider is set", async () => {
    const logger = { info: vi.fn() };
    const fetchImplementation = okFetch();

    await sendVisitorCodeSms({
      code: "123456",
      environment: { VERCEL_ENV: "preview" },
      fetchImplementation,
      logger,
      phone: "+233241112233",
    });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("123456"));
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("refuses to run in Production without a provider", () => {
    expect(() => resolveSmsProvider({ VERCEL_ENV: "production" })).toThrow(SmsUnavailableError);
    expect(() => resolveSmsProvider({ SMS_PROVIDER: "carrier-pigeon" })).toThrow(SmsUnavailableError);
  });

  it("sends through Hubtel with Basic auth", async () => {
    const fetchImplementation = okFetch({ status: 0 });

    await sendVisitorCodeSms({
      code: "123456",
      environment: {
        HUBTEL_CLIENT_ID: "client",
        HUBTEL_CLIENT_SECRET: "secret",
        SMS_PROVIDER: "hubtel",
      },
      fetchImplementation,
      phone: "+233241112233",
    });

    const [url, options] = fetchImplementation.mock.calls[0];
    expect(url).toBe("https://smsc.hubtel.com/v1/messages/send");
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from("client:secret").toString("base64")}`);
    expect(JSON.parse(options.body)).toEqual({
      Content: createCodeMessage("123456"),
      From: "MoF-Visitor",
      To: "233241112233",
    });
  });

  it("sends through Arkesel with the api-key header", async () => {
    const fetchImplementation = okFetch({ status: "success" });

    await sendVisitorCodeSms({
      code: "123456",
      environment: { ARKESEL_API_KEY: "key", SMS_PROVIDER: "arkesel" },
      fetchImplementation,
      phone: "+233241112233",
    });

    const [url, options] = fetchImplementation.mock.calls[0];
    expect(url).toBe("https://sms.arkesel.com/api/v2/sms/send");
    expect(options.headers["api-key"]).toBe("key");
    expect(JSON.parse(options.body)).toEqual({
      message: createCodeMessage("123456"),
      recipients: ["233241112233"],
      sender: "MoF-Visitor",
    });
  });

  it("fails when the provider refuses the message", async () => {
    await expect(
      sendVisitorCodeSms({
        code: "123456",
        environment: { ARKESEL_API_KEY: "key", SMS_PROVIDER: "arkesel" },
        fetchImplementation: vi.fn().mockResolvedValue({ ok: false, status: 401 }),
        phone: "+233241112233",
      }),
    ).rejects.toThrow("401");
  });

  it("needs the provider's keys", async () => {
    await expect(
      sendVisitorCodeSms({
        code: "123456",
        environment: { SMS_PROVIDER: "hubtel" },
        fetchImplementation: okFetch(),
        phone: "+233241112233",
      }),
    ).rejects.toThrow(SmsUnavailableError);
  });
});
