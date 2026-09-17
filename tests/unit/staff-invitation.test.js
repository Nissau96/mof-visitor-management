import process from "node:process";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dependencies = vi.hoisted(() => ({
  close: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport:
      dependencies.createTransport,
  },
}));

import {
  TEMPORARY_PASSWORD_LENGTH,
  TEMPORARY_PASSWORD_TTL_MS,
  createStaffInvitationMessage,
  createTemporaryPassword,
  createTemporaryPasswordExpiry,
  getStaffLoginUrl,
  sendStaffInvitationEmail,
} from "../../src/server/staffInvitation.js";

const ENVIRONMENT_KEYS = [
  "STAFF_LOGIN_URL",
  "SMTP_FROM_EMAIL",
  "SMTP_FROM_NAME",
  "SMTP_HOST",
  "SMTP_PASSWORD",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
];

const originalEnvironment =
  Object.fromEntries(
    ENVIRONMENT_KEYS.map((key) => [
      key,
      process.env[key],
    ]),
  );

const TEMPORARY_PASSWORD =
  "Temporary!Password42";

function configureEnvironment() {
  process.env.STAFF_LOGIN_URL =
    "https://visitors.example.gov.gh/staff/login";

  process.env.SMTP_FROM_EMAIL =
    "visitor.management@example.gov.gh";

  process.env.SMTP_FROM_NAME =
    "MoF Visitor Management";

  process.env.SMTP_HOST =
    "smtp.example.gov.gh";

  process.env.SMTP_PASSWORD =
    "invented-smtp-password";

  process.env.SMTP_PORT = "587";
  process.env.SMTP_SECURE = "false";

  process.env.SMTP_USER =
    "visitor.management@example.gov.gh";
}

function restoreEnvironment() {
  for (const key of ENVIRONMENT_KEYS) {
    const originalValue =
      originalEnvironment[key];

    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] =
        originalValue;
    }
  }
}

describe("staff invitation onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureEnvironment();

    dependencies.sendMail
      .mockResolvedValue({
        messageId:
          "isolated-message-id",
      });

    dependencies.createTransport
      .mockReturnValue({
        close: dependencies.close,
        sendMail:
          dependencies.sendMail,
      });
  });

  afterEach(() => {
    restoreEnvironment();
  });

  it("creates strong temporary passwords", () => {
    for (
      let attempt = 0;
      attempt < 25;
      attempt += 1
    ) {
      const password =
        createTemporaryPassword();

      expect(password).toHaveLength(
        TEMPORARY_PASSWORD_LENGTH,
      );

      expect(password).toMatch(
        /[A-Z]/,
      );

      expect(password).toMatch(
        /[a-z]/,
      );

      expect(password).toMatch(
        /[0-9]/,
      );

      expect(password).toMatch(
        /[!@#$%&*+=?-]/,
      );
    }
  });

  it("sets temporary-password expiry to exactly 24 hours", () => {
    const now = new Date(
      "2026-08-24T13:30:00.000Z",
    );

    const expiry =
      createTemporaryPasswordExpiry(
        now,
      );

    expect(
      expiry.getTime() -
        now.getTime(),
    ).toBe(
      TEMPORARY_PASSWORD_TTL_MS,
    );

    expect(expiry.toISOString()).toBe(
      "2026-08-25T13:30:00.000Z",
    );
  });

  it("rejects an invalid expiry date", () => {
    expect(() =>
      createTemporaryPasswordExpiry(
        new Date("invalid"),
      ),
    ).toThrow(
      "A valid current date is required.",
    );
  });

  it("accepts the configured secure staff login URL", () => {
    expect(getStaffLoginUrl()).toBe(
      "https://visitors.example.gov.gh/staff/login",
    );
  });

  it.each([
    "http://visitors.example.gov.gh/staff/login",
    "https://user:password@visitors.example.gov.gh/staff/login",
    "https://visitors.example.gov.gh/staff/login?source=email",
    "https://visitors.example.gov.gh/staff/login#setup",
    "https://visitors.example.gov.gh/staff/setup",
  ])(
    "rejects an unsafe staff login URL: %s",
    (loginUrl) => {
      process.env.STAFF_LOGIN_URL =
        loginUrl;

      expect(() =>
        getStaffLoginUrl(),
      ).toThrow(
        "STAFF_LOGIN_URL must be a secure staff sign-in URL.",
      );
    },
  );

  it("creates a receptionist email with account and Assigned Tower details", () => {
    const message =
      createStaffInvitationMessage({
        email:
          "RECEPTIONIST@example.invalid",
        expiresAt:
          "2026-08-25T13:30:00.000Z",
        fullName:
          "Test <Receptionist>",
        loginUrl:
          "https://visitors.example.gov.gh/staff/login",
        role: "receptionist",
        temporaryPassword:
          TEMPORARY_PASSWORD,
      });

    expect(message.subject).toBe(
      "Your MoF Visitor Management staff account is ready",
    );

    expect(message.text).toContain(
      "Hello Test <Receptionist>",
    );

    expect(message.text).toContain(
      "Email address: receptionist@example.invalid",
    );

    expect(message.text).toContain(
      "Role: Receptionist",
    );

    expect(message.text).toContain(
      "Assigned Tower: Select your working tower when signing in.",
    );

    expect(message.text).toContain(
      `Temporary password: ${TEMPORARY_PASSWORD}`,
    );

    expect(message.html).toContain(
      "Test &lt;Receptionist&gt;",
    );

    expect(message.html).not.toContain(
      "Test <Receptionist>",
    );

    expect(message.html).toContain(
      "Select at sign-in",
    );
  });

  it("creates a password-reissue email that invalidates earlier temporary passwords", () => {
    const message =
      createStaffInvitationMessage({
        email:
          "RECOVERY@example.invalid",
        expiresAt:
          "2026-08-26T13:30:00.000Z",
        fullName:
          "Recovery Receptionist",
        loginUrl:
          "https://visitors.example.gov.gh/staff/login",
        messageType: "reissue",
        role: "receptionist",
        temporaryPassword:
          TEMPORARY_PASSWORD,
      });

    expect(message.subject).toBe(
      "Your MoF Visitor Management temporary password has been reissued",
    );

    expect(message.text).toContain(
      "A Visitor Management administrator has reissued the temporary password",
    );

    expect(message.text).toContain(
      "Any earlier temporary password for this account is no longer valid.",
    );

    expect(message.text).toContain(
      "How to complete password recovery",
    );

    expect(message.text).toContain(
      "If you were not expecting this password reissue",
    );

    expect(message.html).toContain(
      "Your temporary password has been reissued",
    );

    expect(message.html).toContain(
      "Any earlier temporary password for this account is no longer valid.",
    );
  });

  it("creates Client Service Head account details without an Assigned Tower", () => {
    const message =
      createStaffInvitationMessage({
        email:
          "client.service@example.invalid",
        expiresAt:
          "2026-08-25T13:30:00.000Z",
        fullName:
          "Test Client Service Head",
        loginUrl:
          "https://visitors.example.gov.gh/staff/login",
        role: "client_service_head",
        temporaryPassword:
          TEMPORARY_PASSWORD,
      });

    expect(message.text).toContain(
      "Role: Client Service Head",
    );

    expect(message.text).not.toContain(
      "Assigned Tower: Select your working tower when signing in.",
    );

    expect(message.html).not.toContain(
      "Select at sign-in",
    );
  });

  it("does not add a tower value to administrator account details", () => {
    const message =
      createStaffInvitationMessage({
        email:
          "administrator@example.invalid",
        expiresAt:
          "2026-08-25T13:30:00.000Z",
        fullName:
          "Test Administrator",
        loginUrl:
          "https://visitors.example.gov.gh/staff/login",
        role: "admin",
        temporaryPassword:
          TEMPORARY_PASSWORD,
      });

    expect(message.text).toContain(
      "Role: Administrator",
    );

    expect(message.text).not.toContain(
      "Assigned Tower: Select your working tower when signing in.",
    );

    expect(message.html).not.toContain(
      "Select at sign-in",
    );
  });

  it("sends the onboarding email through the configured SMTP transport", async () => {
    await sendStaffInvitationEmail({
      email:
        "RECEPTIONIST@example.invalid",
      expiresAt:
        "2026-08-25T13:30:00.000Z",
      fullName:
        "Test Receptionist",
      role: "receptionist",
      temporaryPassword:
        TEMPORARY_PASSWORD,
    });

    expect(
      dependencies.createTransport,
    ).toHaveBeenCalledWith({
      auth: {
        pass:
          "invented-smtp-password",
        user:
          "visitor.management@example.gov.gh",
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      host: "smtp.example.gov.gh",
      port: 587,
      requireTLS: true,
      secure: false,
      socketTimeout: 20_000,
      tls: {
        minVersion: "TLSv1.2",
      },
    });

    expect(
      dependencies.sendMail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        disableFileAccess: true,
        disableUrlAccess: true,
        from: {
          address:
            "visitor.management@example.gov.gh",
          name:
            "MoF Visitor Management",
        },
        subject:
          "Your MoF Visitor Management staff account is ready",
        to:
          "receptionist@example.invalid",
      }),
    );

    const sentMessage =
      dependencies.sendMail.mock
        .calls[0][0];

    expect(sentMessage.text).toContain(
      TEMPORARY_PASSWORD,
    );

    expect(sentMessage.html).toContain(
      TEMPORARY_PASSWORD,
    );

    expect(
      dependencies.close,
    ).toHaveBeenCalledOnce();
  });

  it("closes the SMTP transport when delivery fails", async () => {
    dependencies.sendMail
      .mockRejectedValueOnce(
        new Error(
          "Invented SMTP failure",
        ),
      );

    await expect(
      sendStaffInvitationEmail({
        email:
          "receptionist@example.invalid",
        expiresAt:
          "2026-08-25T13:30:00.000Z",
        fullName:
          "Test Receptionist",
        role: "receptionist",
        temporaryPassword:
          TEMPORARY_PASSWORD,
      }),
    ).rejects.toThrow(
      "Invented SMTP failure",
    );

    expect(
      dependencies.close,
    ).toHaveBeenCalledOnce();
  });
});
