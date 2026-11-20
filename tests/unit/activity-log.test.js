import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditFetch, getAuditHeaders, setAuditActor, withAuditContext } from "../../api/_lib/auditContext.js";
import { handleActivityExport, handleActivityList } from "../../api/_lib/activityLog.js";
import {
  actionLabel,
  describeDevice,
  describeTarget,
  eventReference,
  formatChangeValue,
  toActivityCsvTable,
} from "../../src/lib/activityLog.js";
import { activityLogSchema } from "../../src/validation/activityLog.js";

const ADMIN = { fullName: "Ibrahim Halidu", role: "admin", userId: "00000000-0000-4000-8000-000000000001" };

function request(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
    method: "POST",
  });
}

describe("audit request context", () => {
  it("carries IP, device and actor onto database calls", async () => {
    let seen = {};

    const handler = withAuditContext({
      async fetch() {
        setAuditActor({ id: ADMIN.userId, name: "Akua Boaténg", role: "receptionist" });
        seen = getAuditHeaders();
        return new Response("ok");
      },
    });

    await handler.fetch(
      new Request("http://localhost/api/x", {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120", "x-forwarded-for": "10.20.4.18, 1.1.1.1" },
      }),
    );

    expect(seen).toMatchObject({
      "x-audit-actor": ADMIN.userId,
      "x-audit-ip": "10.20.4.18",
      "x-audit-role": "receptionist",
      "x-audit-ua": "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
    });
    // Non-ASCII names travel as base64.
    expect(Buffer.from(seen["x-audit-actor-name"], "base64").toString("utf8")).toBe("Akua Boaténg");
  });

  it("adds no headers outside a request", async () => {
    expect(getAuditHeaders()).toEqual({});

    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await auditFetch("http://localhost/rest", { headers: { apikey: "k" } });
    expect(spy.mock.calls[0][1].headers).toEqual({ apikey: "k" });
    spy.mockRestore();
  });
});

describe("activity labels", () => {
  it("names known actions and words unknown ones", () => {
    expect(actionLabel("host.updated")).toBe("Updated host details");
    expect(actionLabel("staff_sign_in_failed")).toBe("Sign-in failed");
    expect(actionLabel("something.new_thing")).toBe("Something new thing");
  });

  it("reads the device from the user agent", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit Chrome/120 Safari/537")).toBe("Windows · Chrome");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604")).toBe("iOS · Safari");
    expect(describeDevice("Mozilla/5.0 (Macintosh) Edg/120 Chrome/120")).toBe("macOS · Edge");
    expect(describeDevice("")).toBe("");
  });

  it("describes export and sign-in targets from their details", () => {
    expect(
      describeTarget({
        action: "visit_history.exported",
        category: "export",
        details: { dateFrom: "2026-11-01", dateTo: "2026-11-20", rows: 6 },
      }),
    ).toEqual({ detail: "2026-11-01 – 2026-11-20", name: "Visit history (CSV, 6 rows)" });

    expect(
      describeTarget({ action: "staff_sign_in_failed", category: "signin", details: { email: "nana@mofep.gov.gh" } }),
    ).toEqual({ detail: "Wrong email or password", name: "nana@mofep.gov.gh" });
  });

  it("formats before/after values", () => {
    expect(formatChangeValue("tower_2")).toBe("Tower 2");
    expect(formatChangeValue(true)).toBe("Yes");
    expect(formatChangeValue(null)).toBe("—");
    expect(formatChangeValue("receptionist")).toBe("Receptionist");
    expect(formatChangeValue("Floor 4")).toBe("Floor 4");
  });

  it("references events as EV-<id>", () => {
    expect(eventReference({ id: 20477 })).toBe("EV-20477");
  });

  it("writes one CSV row per event", () => {
    const { columns, rows } = toActivityCsvTable([
      {
        action: "host.updated",
        actorName: "Ibrahim Halidu",
        actorRole: "admin",
        category: "settings",
        createdAt: "2026-11-20T15:10:00Z",
        details: {},
        id: 20477,
        ipAddress: "10.20.4.18",
        result: "success",
        sensitive: true,
        targetDetail: "Budget Office",
        targetName: "Isaac Sam",
        tower: null,
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
      },
    ]);

    expect(columns.map((column) => column.label)[0]).toBe("Time");
    expect(Object.values(rows[0])).toEqual([
      "2026-11-20 15:10",
      "EV-20477",
      "Ibrahim Halidu",
      "Super Administrator",
      "Updated host details",
      "Settings",
      "Yes",
      "Isaac Sam",
      "Budget Office",
      "All towers",
      "Success",
      "10.20.4.18",
      "Windows · Chrome",
    ]);
  });
});

describe("activity filters", () => {
  it("defaults to everything, ten a page", () => {
    expect(activityLogSchema.parse({})).toMatchObject({ category: "", page: 1, pageSize: 10, result: "", role: "" });
  });

  it("rejects unknown filters and reversed dates", () => {
    expect(activityLogSchema.safeParse({ category: "gossip" }).success).toBe(false);
    expect(activityLogSchema.safeParse({ result: "maybe" }).success).toBe(false);
    expect(activityLogSchema.safeParse({ dateFrom: "2026-11-20", dateTo: "2026-11-01" }).success).toBe(false);
    expect(activityLogSchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });
});

describe("activity log API", () => {
  const rpc = vi.fn();
  const insert = vi.fn();
  const client = { from: () => ({ insert }), rpc };
  const requireAdmin = vi.fn();
  const deps = { getAdminClientForRequest: () => client, requireActiveStaffForRequest: requireAdmin };

  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({
      data: { events: [{ id: 1 }], pagination: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 }, stats: {}, users: [] },
      error: null,
    });
    insert.mockReset().mockResolvedValue({ error: null });
    requireAdmin.mockReset().mockResolvedValue({ profile: ADMIN });
  });

  it("is for administrators only", async () => {
    await handleActivityList(request("/api/admin/activity/list", {}), deps);
    expect(requireAdmin).toHaveBeenCalledWith(expect.any(Request), ["admin"]);
  });

  it("passes the filters to the database", async () => {
    const response = await handleActivityList(
      request("/api/admin/activity/list", { category: "settings", dateFrom: "2026-11-20", dateTo: "2026-11-20", result: "failed" }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "get_activity_log",
      expect.objectContaining({
        p_actor_id: ADMIN.userId,
        p_category: "settings",
        p_date_from: "2026-11-20",
        p_page_size: 10,
        p_result: "failed",
        p_user_id: null,
      }),
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("exports every matching event and logs the export", async () => {
    await handleActivityExport(request("/api/admin/activity/export", { page: 3 }), deps);

    expect(rpc).toHaveBeenCalledWith("get_activity_log", expect.objectContaining({ p_page: 1, p_page_size: 5000 }));
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "activity_log.exported", actor_id: ADMIN.userId, entity_type: "export" }),
    );
  });

  it("refuses invalid filters", async () => {
    await expect(handleActivityList(request("/api/admin/activity/list", { role: "king" }), deps)).rejects.toMatchObject({
      status: 400,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("browser-reported session events", async () => {
  const { createStaffSessionHandler } = await import("../../api/staff/session.js");
  const insert = vi.fn();
  const limit = vi.fn();
  const requireStaff = vi.fn();
  const handler = createStaffSessionHandler({
    enforceRateLimitForRequest: limit,
    getAdminClientForRequest: () => ({ from: () => ({ insert }) }),
    requireActiveStaffForRequest: requireStaff,
  });

  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ error: null });
    limit.mockReset().mockResolvedValue(undefined);
    requireStaff.mockReset().mockResolvedValue({ profile: ADMIN });
  });

  it("logs a failed sign-in without a session, rate-limited", async () => {
    const response = await handler.fetch(
      request("/api/staff/session?event=sign-in-failed", { email: "Nana@MoFEP.gov.gh", tower: "tower_1" }),
    );

    expect(response.status).toBe(202);
    expect(limit).toHaveBeenCalledOnce();
    expect(requireStaff).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "staff_sign_in_failed",
        actor_name: "nana@mofep.gov.gh",
        result: "failed",
      }),
    );
  });

  it("refuses a sign-in report with no email", async () => {
    const response = await handler.fetch(request("/api/staff/session?event=sign-in-failed", { email: "nope" }));
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("logs an idle sign-out for the signed-in staff member", async () => {
    const response = await handler.fetch(request("/api/staff/session?event=signed-out", { reason: "idle" }));

    expect(response.status).toBe(202);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "staff_signed_out", actor_id: ADMIN.userId, details: { reason: "idle" } }),
    );
  });

  it("logs a report export", async () => {
    await handler.fetch(
      request("/api/staff/session?event=report-exported", { format: "csv", report: "Daily visitor log", rows: 42 }),
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report.exported",
        details: expect.objectContaining({ report: "Daily visitor log", rows: 42 }),
        entity_type: "export",
      }),
    );
  });
});
