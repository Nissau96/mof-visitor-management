import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  checkStaffNetwork,
  requireActiveStaff,
} from "../../api/_lib/staffAuth.js";
import {
  adminStaffInviteSchema,
  adminStaffUpdateSchema,
} from "../../src/validation/adminManagement.js";

const USER_ID = "00000000-0000-4000-8000-000000000018";

const BASE_PROFILE = {
  access_expires_at: null,
  active: true,
  full_name: "Test Receptionist",
  password_change_required: false,
  password_setup_completed_at: null,
  role: "receptionist",
  temporary_password_expires_at: null,
  user_id: USER_ID,
};

const MICROSOFT_RECEPTIONIST = {
  ...BASE_PROFILE,
  sign_in_method: "microsoft",
};

const INTERN = {
  ...BASE_PROFILE,
  access_expires_at: "2099-01-01T00:00:00.000Z",
  sign_in_method: "password",
};

function nowSeconds() {
  return Math.floor(Date.now() / 1_000);
}

function createToken(method, timestamp) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    amr: [{ method, timestamp }],
    iat: timestamp,
  })}.isolated-signature`;
}

function createClient(profile) {
  const auditInsert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });

  return {
    auditInsert,
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: USER_ID } },
          error: null,
        }),
      },
      from: vi.fn((table) =>
        table === "audit_events"
          ? { insert: auditInsert }
          : { select: () => ({ eq: () => ({ maybeSingle }) }) },
      ),
    },
  };
}

function request(token) {
  return new Request("http://localhost/api/staff/session", {
    headers: { Authorization: `Bearer ${token}` },
    method: "GET",
  });
}

function check(profile, token, options = {}) {
  const { auditInsert, client } = createClient(profile);

  return {
    auditInsert,
    result: requireActiveStaff(request(token), [], {
      environment: {},
      getAdminClientForRequest: () => client,
      ...options,
    }),
  };
}

describe("requireActiveStaff sign-in rules", () => {
  it("accepts a Microsoft session for a Microsoft account", async () => {
    const { result } = check(
      MICROSOFT_RECEPTIONIST,
      createToken("oauth", nowSeconds()),
    );

    await expect(result).resolves.toMatchObject({
      profile: { accessExpiresAt: null, signInMethod: "microsoft" },
    });
  });

  it("reports an Intern/NSP account so reports can be refused", async () => {
    const { result } = check(
      { ...INTERN, is_nsp: true },
      createToken("password", nowSeconds()),
    );

    await expect(result).resolves.toMatchObject({
      profile: { isNsp: true, role: "receptionist" },
    });
  });

  it("refuses a password session for a Microsoft account and records it", async () => {
    const { auditInsert, result } = check(
      MICROSOFT_RECEPTIONIST,
      createToken("password", nowSeconds()),
      { recordRefusals: true },
    );

    await expect(result).rejects.toMatchObject({
      message: "This account signs in with a Ministry work email. Use Sign in with Work Email.",
      status: 403,
    });

    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "staff_sign_in_refused",
        actor_id: USER_ID,
        details: { reason: "wrong_method" },
      }),
    );
  });

  it("refuses a Microsoft session for an Intern/NSP password account", async () => {
    const { result } = check(INTERN, createToken("oauth", nowSeconds()));

    await expect(result).rejects.toMatchObject({
      message: "This account signs in with an email address and password.",
      status: 403,
    });
  });

  it("does not record refusals unless asked to", async () => {
    const { auditInsert, result } = check(
      INTERN,
      createToken("oauth", nowSeconds()),
    );

    await expect(result).rejects.toMatchObject({ status: 403 });
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("asks for a fresh sign-in after 12 hours", async () => {
    const { result } = check(
      MICROSOFT_RECEPTIONIST,
      createToken("oauth", nowSeconds() - 12 * 3_600 - 60),
    );

    await expect(result).rejects.toMatchObject({ status: 401 });
  });

  it("refuses an Intern/NSP account after the access end date", async () => {
    const { result } = check(
      { ...INTERN, access_expires_at: "2026-01-31T00:00:00.000Z" },
      createToken("password", nowSeconds()),
    );

    await expect(result).rejects.toMatchObject({
      message: "Your staff access ended on 31 Jan 2026. Contact an administrator.",
      status: 403,
    });
  });

  it("refuses a session without sign-in details once a method is set", async () => {
    const { result } = check(
      MICROSOFT_RECEPTIONIST,
      "header.e30.isolated-signature",
    );

    await expect(result).rejects.toMatchObject({ status: 401 });
  });
});

describe("checkStaffNetwork", () => {
  const from = (address) =>
    new Request("http://localhost/api/staff/session", {
      headers: address ? { "x-forwarded-for": `${address}, 10.0.0.1` } : {},
    });

  it("allows any network when no list is set outside Production", () => {
    expect(() => checkStaffNetwork(from("8.8.8.8"), {})).not.toThrow();
  });

  it("refuses every request in Production when no list is set", () => {
    expect(() =>
      checkStaffNetwork(from("196.10.20.5"), { VERCEL_ENV: "production" }),
    ).toThrow(/not configured/);
  });

  it("allows listed addresses and ranges and refuses others", () => {
    const environment = {
      STAFF_ALLOWED_IPS: "196.10.20.0/28, 41.66.200.7",
      VERCEL_ENV: "production",
    };

    expect(() => checkStaffNetwork(from("196.10.20.14"), environment)).not.toThrow();
    expect(() => checkStaffNetwork(from("41.66.200.7"), environment)).not.toThrow();
    expect(() => checkStaffNetwork(from("196.10.20.16"), environment)).toThrow(
      "Staff services can only be used from the Ministry of Finance network.",
    );
    expect(() => checkStaffNetwork(from(""), environment)).toThrow();
  });

  it("allows every network in Production when the list is *", () => {
    const environment = { STAFF_ALLOWED_IPS: "*", VERCEL_ENV: "production" };

    expect(() => checkStaffNetwork(from("8.8.8.8"), environment)).not.toThrow();
    expect(() => checkStaffNetwork(from("2001:db8::1"), environment)).not.toThrow();
  });
});

describe("staff sign-in settings validation", () => {
  const invite = {
    email: "intern@mofep.gov.gh",
    fullName: "Test Intern NSP",
    role: "receptionist",
  };

  it("keeps the old invitation shape valid", () => {
    expect(adminStaffInviteSchema.safeParse(invite).success).toBe(true);
  });

  it("requires an end date for an Intern/NSP password account", () => {
    const parsed = adminStaffInviteSchema.safeParse({
      ...invite,
      signInMethod: "password",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues[0]).toMatchObject({
      message: "Choose the date this Intern/NSP account's access ends.",
      path: ["accessEndDate"],
    });
  });

  it("lets the emergency administrator keep a password without an end date", () => {
    expect(
      adminStaffInviteSchema.safeParse({
        ...invite,
        role: "admin",
        signInMethod: "password",
      }).success,
    ).toBe(true);
  });

  it("refuses an end date that is not after today", () => {
    const today = new Date().toISOString().slice(0, 10);

    expect(
      adminStaffInviteSchema.safeParse({
        ...invite,
        accessEndDate: today,
        signInMethod: "password",
      }).success,
    ).toBe(false);
  });

  it("accepts a Microsoft account and clears an end date with an empty value", () => {
    const parsed = adminStaffUpdateSchema.safeParse({
      accessEndDate: "",
      active: true,
      fullName: "Test Receptionist",
      role: "receptionist",
      signInMethod: "microsoft",
      userId: USER_ID,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data.accessEndDate).toBeNull();
  });
});
