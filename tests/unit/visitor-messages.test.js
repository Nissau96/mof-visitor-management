import { describe, expect, it, vi } from "vitest";
import { NOTIFICATION_PURPOSES } from "../../src/server/notify.js";
import { firstNameOf, sendCardIssuedSms, sendRegistrationSms } from "../../src/server/visitorMessages.js";
import { createWifiMessages } from "../../src/server/wifiCredentials.js";

function clientWith(profile) {
  const chain = {
    eq: () => chain,
    maybeSingle: async () => ({ data: profile, error: null }),
    select: () => chain,
  };

  return { from: () => chain };
}

describe("visitor SMS wording", () => {
  it("matches the approved registration and card texts", () => {
    expect(NOTIFICATION_PURPOSES.registration_success.sms(["Ama", "VIS-7F31A2"])).toBe(
      [
        "Welcome to the Ministry of Finance, Ama.",
        "",
        "Your visitor registration is successful.",
        "",
        "Visit Reference: VIS-7F31A2",
        "",
        "Kindly proceed to the reception desk for assistance.",
      ].join("\n"),
    );
    expect(NOTIFICATION_PURPOSES.card_issued.sms(["T1-014", "VIS-7F31A2"])).toBe(
      [
        "Ministry of Finance",
        "",
        "Visitor Card: T1-014",
        "Visit Reference: VIS-7F31A2",
        "",
        "Kindly keep your visitor card with you and return it to reception before leaving.",
      ].join("\n"),
    );
  });

  it("gives the Wi-Fi expiry as a GMT date and time", () => {
    const { sms } = createWifiMessages({
      expiresAt: "2026-11-25T17:30:00Z",
      networkName: "MoF-Guest",
      password: "Volta-Cedar-4821",
    });

    expect(sms).toBe(
      [
        "Welcome to the Ministry of Finance.",
        "",
        "Guest Wi-Fi Access",
        "Network: MoF-Guest",
        "Password: Volta-Cedar-4821",
        "Valid until: 25 Nov 2026, 5:30 pm GMT.",
        "",
        "Enjoy your visit.",
      ].join("\n"),
    );
  });

  it("uses the first word of the full name", () => {
    expect(firstNameOf("  Ama   Serwaa Mensah ")).toBe("Ama");
    expect(firstNameOf("")).toBe("");
  });
});

describe("registration and card SMS", () => {
  it("texts a first-time visitor from the form details", async () => {
    const notifyVisitor = vi.fn().mockResolvedValue({ channel: "sms", status: "accepted" });

    await expect(
      sendRegistrationSms({ fullName: "Ama Mensah", notifyVisitor, phone: "+233241112233", reference: "VIS-1" }),
    ).resolves.toEqual({ sent: true });
    expect(notifyVisitor).toHaveBeenCalledWith(
      expect.objectContaining({ parameters: ["Ama", "VIS-1"], purpose: "registration_success" }),
    );
  });

  it("looks up a returning visitor and the card holder", async () => {
    const notifyVisitor = vi.fn().mockResolvedValue({ channel: "sms", status: "accepted" });
    const client = clientWith({ full_name: "Kofi Boateng", phone: "+233201112233" });

    await sendRegistrationSms({ client, notifyVisitor, reference: "VIS-2", visitorId: "p1" });
    await sendCardIssuedSms({ cardNumber: "T2-003", client, notifyVisitor, reference: "VIS-2", visitorId: "p1" });

    expect(notifyVisitor.mock.calls[0][0]).toMatchObject({ parameters: ["Kofi", "VIS-2"], phone: "+233201112233" });
    expect(notifyVisitor.mock.calls[1][0]).toMatchObject({ parameters: ["T2-003", "VIS-2"], purpose: "card_issued" });
  });

  it("skips visitors without a phone and never throws", async () => {
    const notifyVisitor = vi.fn();

    await expect(
      sendCardIssuedSms({ cardNumber: "T1-1", client: clientWith({ phone: "" }), notifyVisitor, visitorId: "p1" }),
    ).resolves.toEqual({ sent: false });
    await expect(
      sendRegistrationSms({
        client: { from: () => { throw new Error("db down"); } },
        logger: { error: vi.fn() },
        notifyVisitor,
        visitorId: "p1",
      }),
    ).resolves.toEqual({ sent: false });
    expect(notifyVisitor).not.toHaveBeenCalled();
  });
});
