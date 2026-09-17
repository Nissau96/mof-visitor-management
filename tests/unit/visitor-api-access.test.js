import {
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
import returningSearchHandler from "../../api/returning/search.js";
import returningVerifyHandler from "../../api/returning/verify.js";

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
    handler: returningSearchHandler,
    method: "POST",
    name: "returning-visitor search",
    url:
      "https://visitor.example/api/returning/search",
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
