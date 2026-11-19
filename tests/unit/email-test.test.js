import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleEmailTest } from "../../api/admin.js";
import { HttpError } from "../../api/_lib/http.js";
import { sendTestEmail } from "../../src/server/emailTest.js";

const SMTP = {
  SMTP_FROM_EMAIL: "SMTPNotifications@mofep.gov.gh",
  SMTP_FROM_NAME: "Client Service Unit",
  SMTP_HOST: "smtp-mail.outlook.com",
  SMTP_PASSWORD: "invented-password-for-tests",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "SMTPNotifications@mofep.gov.gh",
};

function stubSmtp(overrides = {}) {
  for (const [name, value] of Object.entries({ ...SMTP, ...overrides })) {
    vi.stubEnv(name, value);
  }
}

function transportThat(sendMail) {
  return vi.fn(() => ({ close: vi.fn(), sendMail }));
}

describe("test email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends from the configured sender over STARTTLS on 587", async () => {
    stubSmtp();
    const sendMail = vi.fn().mockResolvedValue({});
    const createTransport = transportThat(sendMail);

    const result = await sendTestEmail({ createTransport, to: "admin@mofep.gov.gh" });

    expect(result).toEqual({
      from: "Client Service Unit <smtpnotifications@mofep.gov.gh>",
      sent: true,
      to: "admin@mofep.gov.gh",
    });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp-mail.outlook.com",
        port: 587,
        requireTLS: true,
        secure: false,
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { address: "smtpnotifications@mofep.gov.gh", name: "Client Service Unit" },
        to: "admin@mofep.gov.gh",
      }),
    );
  });

  it("explains a refused sign-in without revealing the password", async () => {
    stubSmtp();
    const failure = Object.assign(new Error("535 5.7.139 Authentication unsuccessful"), { code: "EAUTH" });

    const result = await sendTestEmail({
      createTransport: transportThat(vi.fn().mockRejectedValue(failure)),
      to: "admin@mofep.gov.gh",
    });

    expect(result.sent).toBe(false);
    expect(result.problem).toMatch(/SMTP AUTH/);
    expect(JSON.stringify(result)).not.toContain("invented-password");
  });

  it("explains an unreachable server", async () => {
    stubSmtp();
    const failure = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });

    const result = await sendTestEmail({
      createTransport: transportThat(vi.fn().mockRejectedValue(failure)),
      to: "admin@mofep.gov.gh",
    });

    expect(result.problem).toBe(
      "The mail server could not be reached at smtp-mail.outlook.com:587. Check SMTP_HOST and SMTP_PORT.",
    );
  });

  it("says which setting is missing", async () => {
    stubSmtp({ SMTP_PASSWORD: "" });

    const result = await sendTestEmail({ createTransport: vi.fn(), to: "admin@mofep.gov.gh" });

    expect(result.sent).toBe(false);
    expect(result.problem).toContain("SMTP_PASSWORD");
  });
});

describe("test email endpoint", () => {
  const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function call({ role = "admin" } = {}) {
    const sendTestEmailForRequest = vi.fn().mockResolvedValue({ sent: true, to: "admin@mofep.gov.gh" });
    const getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "admin@mofep.gov.gh" } },
      error: null,
    });

    const response = handleEmailTest(
      new Request("http://localhost/api/admin?operation=email-test", { body: "{}", method: "POST" }),
      {
        enforceRateLimitForRequest: vi.fn().mockResolvedValue(undefined),
        getAdminClientForRequest: () => ({ auth: { admin: { getUserById } } }),
        requireActiveStaffForRequest: vi.fn(async (_request, roles) => {
          if (!roles.includes(role)) {
            throw new HttpError("You do not have permission to perform this action.", 403);
          }

          return { profile: { role, userId: ADMIN_ID } };
        }),
        sendTestEmailForRequest,
      },
    );

    return { getUserById, response, sendTestEmailForRequest };
  }

  it("sends only to the signed-in administrator", async () => {
    const { getUserById, response, sendTestEmailForRequest } = call();

    expect((await response).status).toBe(200);
    expect(getUserById).toHaveBeenCalledWith(ADMIN_ID);
    expect(sendTestEmailForRequest).toHaveBeenCalledWith({ to: "admin@mofep.gov.gh" });
  });

  it("is for Super Administrators only", async () => {
    const { response, sendTestEmailForRequest } = call({ role: "receptionist" });

    await expect(response).rejects.toMatchObject({ status: 403 });
    expect(sendTestEmailForRequest).not.toHaveBeenCalled();
  });
});
