import { describe, expect, it, vi } from "vitest";
import { createMeetingsHandler } from "../../api/meetings.js";
import { HttpError } from "../../api/_lib/http.js";
import {
  createWifiMessages,
  decryptWifiPassword,
  deliverWifiCredentials,
  encryptWifiPassword,
  getWifiNetworkName,
} from "../../src/server/wifiCredentials.js";

const SECRET = { WIFI_PASSWORD_SECRET: "invented-wifi-password-secret-for-unit-tests-2026" };
const USER_ID = "44444444-4444-4444-8444-444444444444";
const VISIT_ID = "66666666-6666-4666-8666-666666666666";

describe("WiFi password storage", () => {
  it("encrypts so the database never sees the password", () => {
    const stored = encryptWifiPassword("Volta-Cedar-4821", SECRET);

    expect(stored).not.toContain("Volta");
    expect(stored.startsWith("v1.")).toBe(true);
    expect(decryptWifiPassword(stored, SECRET)).toBe("Volta-Cedar-4821");
  });

  it("uses a fresh nonce every time", () => {
    expect(encryptWifiPassword("same", SECRET)).not.toBe(encryptWifiPassword("same", SECRET));
  });

  it("refuses a short secret and a tampered value", () => {
    expect(() => encryptWifiPassword("x", { WIFI_PASSWORD_SECRET: "short" })).toThrow();

    const stored = encryptWifiPassword("Volta-Cedar-4821", SECRET);
    const tampered = `${stored.slice(0, -2)}AA`;

    expect(() => decryptWifiPassword(tampered, SECRET)).toThrow();
  });

  it("uses each tower's own guest network", () => {
    expect(getWifiNetworkName({}, "tower_1")).toBe("PEACE - HUB - Guest");
    expect(getWifiNetworkName({}, "tower_2")).toBe("MoF-Guest");
    expect(getWifiNetworkName({ WIFI_NETWORK_NAME: "Guest-T2" }, "tower_2")).toBe("Guest-T2");
    expect(getWifiNetworkName({ WIFI_NETWORK_NAME_TOWER_1: "T1-Guest" }, "tower_1")).toBe("T1-Guest");
  });
});

describe("WiFi delivery", () => {
  const recipients = [
    { email: "jack@example.invalid", fullName: "Jack", phone: "+233208151881" },
    { email: null, fullName: "Ama", phone: "+233244118802" },
  ];

  it("writes the network, password and expiry into every message", () => {
    const messages = createWifiMessages({
      expiresAt: "2026-11-19T23:59:59Z",
      networkName: "MoF-Guest",
      password: "Volta-Cedar-4821",
    });

    for (const text of [messages.sms, messages.text, messages.html]) {
      expect(text).toContain("MoF-Guest");
      expect(text).toContain("Volta-Cedar-4821");
      expect(text).toContain("11:59");
    }
  });

  it("texts everyone with a number and emails everyone with an address", async () => {
    const send = { email: vi.fn().mockResolvedValue(1), sms: vi.fn().mockResolvedValue(undefined) };

    const result = await deliverWifiCredentials({
      channels: ["sms", "email"],
      environment: {},
      expiresAt: "2026-11-19T23:59:59Z",
      password: "Volta-Cedar-4821",
      recipients,
      send,
    });

    expect(send.sms).toHaveBeenCalledTimes(2);
    expect(send.email).toHaveBeenCalledWith([recipients[0]], expect.any(Object));
    expect(result).toEqual({ delivered: ["sms", "email"], problems: [] });
  });

  it("reports what could not be sent", async () => {
    const send = {
      email: vi.fn().mockRejectedValue(new Error("SMTP down")),
      sms: vi.fn().mockRejectedValueOnce(new Error("refused")).mockResolvedValue(undefined),
    };

    const result = await deliverWifiCredentials({
      channels: ["sms", "email"],
      environment: {},
      expiresAt: "2026-11-19T23:59:59Z",
      password: "x",
      recipients,
      send,
    });

    expect(result.delivered).toEqual(["sms"]);
    expect(result.problems).toEqual([
      "The SMS could not be sent to 1 of 2.",
      "The email could not be sent.",
    ]);
  });
});

describe("WiFi grant operation", () => {
  function createHandler({ data, role = "it_network_admin" }) {
    const rpc = vi.fn(async (name) => ({
      data: name === "record_wifi_delivery" ? { sentBy: ["print"] } : data,
      error: null,
    }));

    const handler = createMeetingsHandler({
      enforceRateLimitForRequest: vi.fn().mockResolvedValue(undefined),
      getAdminClientForRequest: () => ({ rpc }),
      requireActiveStaffForRequest: vi.fn(async (_request, allowedRoles) => {
        if (!allowedRoles.includes(role)) {
          throw new HttpError("Not allowed.", 403);
        }

        return { profile: { role, userId: USER_ID } };
      }),
    });

    return { handler, rpc };
  }

  function grantRequest(body) {
    return new Request("http://localhost/api/meetings?operation=wifi-grant", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  it("stores only the encrypted password and records the slip", async () => {
    vi.stubEnv("WIFI_PASSWORD_SECRET", SECRET.WIFI_PASSWORD_SECRET);

    const { handler, rpc } = createHandler({
      data: { expiresAt: "2026-11-19T23:59:59Z", id: VISIT_ID, recipients: [], status: "given" },
    });

    const response = await handler.fetch(
      grantRequest({
        channels: ["print"],
        date: "2026-11-19",
        duration: "end_of_day",
        id: VISIT_ID,
        password: "Volta-Cedar-4821",
        type: "visit",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);

    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("grant_wifi_access");
    expect(args.p_password_cipher).not.toContain("Volta");
    expect(decryptWifiPassword(args.p_password_cipher, SECRET)).toBe("Volta-Cedar-4821");
    expect(rpc).toHaveBeenCalledWith("record_wifi_delivery", expect.objectContaining({ p_channels: ["print"] }));
    expect(body.sentBy).toEqual(["print"]);
    expect(JSON.stringify(body)).not.toContain("Volta");

    vi.unstubAllEnvs();
  });

  it("explains a missing encryption secret", async () => {
    vi.stubEnv("WIFI_PASSWORD_SECRET", "");

    const { handler, rpc } = createHandler({ data: {} });

    const response = await handler.fetch(
      grantRequest({
        channels: ["print"],
        date: "2026-11-19",
        duration: "2h",
        id: VISIT_ID,
        password: "Volta-Cedar-4821",
        type: "visit",
      }),
    );

    expect(response.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("needs a password and a way to send it", async () => {
    const { handler, rpc } = createHandler({ data: {} });

    const response = await handler.fetch(
      grantRequest({
        channels: [],
        date: "2026-11-19",
        duration: "2h",
        id: VISIT_ID,
        password: "",
        type: "visit",
      }),
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps receptionists out", async () => {
    const { handler } = createHandler({ data: {}, role: "receptionist" });

    const response = await handler.fetch(
      grantRequest({
        channels: ["print"],
        date: "2026-11-19",
        duration: "2h",
        id: VISIT_ID,
        password: "Volta-Cedar-4821",
        type: "visit",
      }),
    );

    expect(response.status).toBe(403);
  });
});
