import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dependencies = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
}));

vi.mock("../../api/_lib/supabase.js", () => ({
  getAdminClient: dependencies.getAdminClient,
}));

import {
  enforceRateLimit,
  KIOSK_RATE_LIMIT_MULTIPLIER,
} from "../../api/_lib/rateLimit.js";
import { createStaffSessionHandler } from "../../api/staff/session.js";
import {
  createKioskDeviceCookie,
  createWeeklyQrToken,
  readKioskDevice,
  readWeeklyQrAccess,
} from "../../src/server/weeklyQrAccess.js";

const TEST_SECRET =
  "invented-weekly-qr-secret-for-unit-testing-only-2026";

const NOW = new Date("2026-11-04T09:00:00.000Z");
const DAY_MS = 86_400_000;
const DEVICE_ID = "00000000-0000-4000-8000-0000000000a1";

const activeKiosk = { isKioskDeviceActive: async () => true };
const removedKiosk = { isKioskDeviceActive: async () => false };

// The name=value part of a Set-Cookie header, as a browser sends it back.
function cookiePair(setCookie) {
  return setCookie.split(";")[0];
}

function visitorRequest(
  cookie = "",
  url = "https://visitors.example.gov.gh/api/register",
) {
  return new Request(url, {
    headers: cookie ? { cookie } : {},
  });
}

function kioskCookie() {
  return cookiePair(
    createKioskDeviceCookie(visitorRequest(), NOW).cookie,
  );
}

function rpcClient(results = {}) {
  return {
    rpc: vi.fn(async (name) => results[name] ?? { data: true, error: null }),
  };
}

describe("reception kiosk devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WEEKLY_QR_SECRET", TEST_SECRET);
    vi.stubEnv("VERCEL_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a year-long HttpOnly device cookie", () => {
    const { cookie } = createKioskDeviceCookie(
      visitorRequest(),
      NOW,
    );

    expect(cookie).toMatch(/^mof_visitor_kiosk=v1\./);
    expect(cookie).toContain("Path=/api");
    expect(cookie).toContain(`Max-Age=${365 * 86_400}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it("gives a set-up kiosk this week's access without the weekly QR", async () => {
    const access = await readWeeklyQrAccess(
      visitorRequest(kioskCookie()),
      NOW,
      activeKiosk,
    );

    expect(access.token).toBe(createWeeklyQrToken(NOW).token);
    expect(access.weekStartsOn).toBe("2026-11-02");
  });

  it("checks the tablet against the kiosk register", async () => {
    const client = rpcClient();
    dependencies.getAdminClient.mockReturnValue(client);

    const cookie = kioskCookie();

    await readWeeklyQrAccess(visitorRequest(cookie), NOW);

    expect(client.rpc).toHaveBeenCalledWith("touch_kiosk_device", {
      p_device_id: readKioskDevice(visitorRequest(cookie), NOW).deviceId,
    });
  });

  it("refuses a removed tablet", async () => {
    await expect(
      readWeeklyQrAccess(
        visitorRequest(kioskCookie()),
        NOW,
        removedKiosk,
      ),
    ).rejects.toThrow(/reception QR code/);
  });

  it("falls back to the kiosk cookie when the weekly cookie has expired", async () => {
    const lastWeek = createWeeklyQrToken(
      new Date(NOW.getTime() - 7 * DAY_MS),
    ).token;

    const access = await readWeeklyQrAccess(
      visitorRequest(
        `mof_visitor_weekly_access=${encodeURIComponent(lastWeek)}; ${kioskCookie()}`,
      ),
      NOW,
      activeKiosk,
    );

    expect(access.weekStartsOn).toBe("2026-11-02");
  });

  it("rejects a tampered device cookie", async () => {
    const tampered = kioskCookie().replace(
      /\.(\d{13})\./,
      (_, expiry) => `.${Number(expiry) + DAY_MS * 365}.`,
    );

    expect(readKioskDevice(visitorRequest(tampered), NOW)).toBeNull();
    await expect(
      readWeeklyQrAccess(visitorRequest(tampered), NOW, activeKiosk),
    ).rejects.toThrow(/reception QR code/);
  });

  it("stops working after a year", () => {
    expect(
      readKioskDevice(
        visitorRequest(kioskCookie()),
        new Date(NOW.getTime() + 366 * DAY_MS),
      ),
    ).toBeNull();
  });

  it("opens visitor services on localhost during development only", async () => {
    const local = visitorRequest("", "http://localhost:3000/api/register");

    await expect(readWeeklyQrAccess(local, NOW)).rejects.toThrow(
      /reception QR code/,
    );

    vi.stubEnv("VERCEL_ENV", "");

    expect((await readWeeklyQrAccess(local, NOW)).weekStartsOn).toBe(
      "2026-11-02",
    );
  });

  it("counts a kiosk's requests per tablet with a larger allowance", async () => {
    vi.stubEnv(
      "VISITOR_LOOKUP_SECRET",
      "invented-visitor-lookup-secret-for-unit-tests-2026",
    );

    const client = rpcClient({
      consume_public_rate_limit: { data: true, error: null },
    });
    dependencies.getAdminClient.mockReturnValue(client);

    await enforceRateLimit(visitorRequest(kioskCookie()), {
      limit: 5,
      scope: "first-visit-registration",
      windowSeconds: 600,
    });

    await enforceRateLimit(visitorRequest(), {
      limit: 5,
      scope: "first-visit-registration",
      windowSeconds: 600,
    });

    const [kioskCall, phoneCall] = client.rpc.mock.calls;

    expect(kioskCall[1].p_limit).toBe(5 * KIOSK_RATE_LIMIT_MULTIPLIER);
    expect(phoneCall[1].p_limit).toBe(5);
    expect(kioskCall[1].p_request_key).not.toBe(
      phoneCall[1].p_request_key,
    );
  });
});

describe("kiosk tablet management", () => {
  const profile = {
    fullName: "Synthetic Receptionist",
    role: "receptionist",
    userId: "00000000-0000-4000-8000-0000000000b1",
  };

  function sessionHandler(client) {
    const requireActiveStaffForRequest = vi.fn(async () => ({ profile }));

    return {
      handler: createStaffSessionHandler({
        getAdminClientForRequest: () => client,
        requireActiveStaffForRequest,
      }),
      requireActiveStaffForRequest,
    };
  }

  function staffRequest(path, init = {}) {
    return new Request(`https://visitors.example.gov.gh${path}`, {
      ...init,
      headers: {
        Authorization: "Bearer synthetic",
        "Content-Type": "application/json",
      },
    });
  }

  beforeEach(() => {
    vi.stubEnv("WEEKLY_QR_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets up a named tablet for reception staff", async () => {
    const client = rpcClient({
      register_kiosk_device: { data: null, error: null },
    });
    const { handler, requireActiveStaffForRequest } = sessionHandler(client);

    const response = await handler.fetch(
      staffRequest("/api/staff/session?kiosk=1", {
        body: JSON.stringify({ label: "  Tower 1 reception " }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    expect(requireActiveStaffForRequest).toHaveBeenCalledWith(
      expect.any(Request),
      ["receptionist", "admin"],
      expect.any(Object),
    );
    expect(response.headers.get("set-cookie")).toMatch(
      /^mof_visitor_kiosk=/,
    );

    const { kiosk } = await response.json();

    expect(client.rpc).toHaveBeenCalledWith("register_kiosk_device", {
      p_actor_id: profile.userId,
      p_device_id: kiosk.id,
      p_expires_at: kiosk.expiresAt,
      p_label: "Tower 1 reception",
    });
  });

  it("requires a tablet name", async () => {
    const client = rpcClient();
    const { handler } = sessionHandler(client);

    const response = await handler.fetch(
      staffRequest("/api/staff/session?kiosk=1", {
        body: JSON.stringify({ label: "x" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("lists the tablets that still work", async () => {
    const client = rpcClient({
      list_kiosk_devices: {
        data: [
          {
            created_at: "2026-11-04T09:00:00Z",
            created_by_name: "Synthetic Receptionist",
            expires_at: "2027-11-04T09:00:00Z",
            id: DEVICE_ID,
            label: "Tower 1 reception",
            last_seen_at: "2026-11-05T10:00:00Z",
          },
        ],
        error: null,
      },
    });
    const { handler } = sessionHandler(client);

    const response = await handler.fetch(
      staffRequest("/api/staff/session?kiosks=1"),
    );

    expect(await response.json()).toEqual({
      kiosks: [
        {
          createdAt: "2026-11-04T09:00:00Z",
          createdByName: "Synthetic Receptionist",
          expiresAt: "2027-11-04T09:00:00Z",
          id: DEVICE_ID,
          label: "Tower 1 reception",
          lastSeenAt: "2026-11-05T10:00:00Z",
        },
      ],
    });
  });

  it("removes a lost tablet", async () => {
    const client = rpcClient({
      revoke_kiosk_device: { data: true, error: null },
    });
    const { handler } = sessionHandler(client);

    const response = await handler.fetch(
      staffRequest(`/api/staff/session?kiosk=${DEVICE_ID}`, {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith("revoke_kiosk_device", {
      p_actor_id: profile.userId,
      p_device_id: DEVICE_ID,
    });
  });

  it("reports a tablet that is already removed", async () => {
    const client = rpcClient({
      revoke_kiosk_device: { data: false, error: null },
    });
    const { handler } = sessionHandler(client);

    const response = await handler.fetch(
      staffRequest(`/api/staff/session?kiosk=${DEVICE_ID}`, {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(404);
  });
});
