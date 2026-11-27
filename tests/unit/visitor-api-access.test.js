import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dependencies = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  getAdminClient: vi.fn(),
}));

vi.mock(
  "../../api/_lib/rateLimit.js",
  async (importOriginal) => {
    const original = await importOriginal();

    return {
      ...original,
      enforceRateLimit:
        dependencies.enforceRateLimit,
    };
  },
);

vi.mock("../../api/_lib/supabase.js", () => ({
  getAdminClient:
    dependencies.getAdminClient,
}));

import hostsHandler from "../../api/hosts.js";
import meetingsHandler from "../../api/meetings.js";
import registerHandler from "../../api/register.js";
import returningCheckInHandler from "../../api/returning/check-in.js";
import returningVerifyHandler from "../../api/returning/verify.js";
import { createWeeklyQrToken } from "../../src/server/weeklyQrAccess.js";

const protectedHandlers = [
  {
    handler: hostsHandler,
    method: "GET",
    name: "host directory",
    url: "https://visitor.example/api/hosts",
  },
  {
    handler: meetingsHandler,
    method: "GET",
    name: "meeting directory",
    url: "https://visitor.example/api/meetings",
  },
  {
    handler: registerHandler,
    method: "POST",
    name: "first-visit registration",
    url: "https://visitor.example/api/register",
  },
  {
    handler: returningVerifyHandler,
    method: "POST",
    name: "returning-visitor verification",
    url:
      "https://visitor.example/api/returning/verify",
  },
  {
    handler: returningCheckInHandler,
    method: "POST",
    name: "returning-visitor check-in",
    url:
      "https://visitor.example/api/returning/check-in",
  },
];

describe("visitor API weekly QR access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const protectedHandler of protectedHandlers) {
    it(`rejects the ${protectedHandler.name} without weekly access`, async () => {
      const request = new Request(
        protectedHandler.url,
        {
          method: protectedHandler.method,
        },
      );

      const response =
        await protectedHandler.handler.fetch(
          request,
        );

      const body = await response.json();

      expect(response.status).toBe(401);

      expect(body).toEqual({
        error: expect.stringMatching(
          /weekly|visitor|access|QR/i,
        ),
      });

      expect(
        dependencies.enforceRateLimit,
      ).not.toHaveBeenCalled();

      expect(
        dependencies.getAdminClient,
      ).not.toHaveBeenCalled();
    });
  }
});

describe("reception kiosk QR link", () => {
  beforeEach(() => {
    vi.stubEnv(
      "WEEKLY_QR_SECRET",
      "invented-weekly-qr-secret-for-unit-testing-only-2026",
    );
    vi.stubEnv(
      "VISITOR_APP_URL",
      "https://visitor.example/visit",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function accessRequest(url, token) {
    return new Request(url, {
      headers: {
        cookie: `mof_visitor_weekly_access=${encodeURIComponent(token)}`,
      },
    });
  }

  it("returns this week's link to a kiosk holding weekly access", async () => {
    const { token } = createWeeklyQrToken();

    const response = await registerHandler.fetch(
      accessRequest(
        "https://visitor.example/api/register?kiosk=1",
        token,
      ),
    );

    const { access } = await response.json();
    const accessUrl = new URL(access.accessUrl);

    expect(response.status).toBe(200);
    expect(accessUrl.origin + accessUrl.pathname).toBe(
      "https://visitor.example/visit",
    );
    expect(
      new URLSearchParams(accessUrl.hash.slice(1)).get(
        "weeklyAccess",
      ),
    ).toBe(token);
  });

  it("leaves the link out of a plain access check", async () => {
    const { token } = createWeeklyQrToken();

    const response = await registerHandler.fetch(
      accessRequest(
        "https://visitor.example/api/register",
        token,
      ),
    );

    const { access } = await response.json();

    expect(access.valid).toBe(true);
    expect(access).not.toHaveProperty("accessUrl");
  });

  it("refuses the link without weekly access", async () => {
    const response = await registerHandler.fetch(
      new Request(
        "https://visitor.example/api/register?kiosk=1",
      ),
    );

    expect(response.status).toBe(401);
  });
});
