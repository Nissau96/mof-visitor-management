import { AsyncLocalStorage } from "node:async_hooks";

// Who made this request, and from where, for the activity log.
//
// Each API entry point runs inside withAuditContext(). The shared
// Supabase client's fetch adds the context as x-audit-* headers to every
// database call; PostgREST exposes them as request.headers, and the
// audit_events trigger copies them onto every row the call writes. So no
// database function has to pass IP, device or actor along itself.

const storage = new AsyncLocalStorage();

function readClientIp(request) {
  // Vercel sets x-forwarded-for to the caller's public address.
  const forwarded = request.headers.get("x-forwarded-for") || "";

  return (
    forwarded.split(",")[0].trim() ||
    (request.headers.get("x-real-ip") || "").trim()
  ).slice(0, 64);
}

function createContext(request) {
  return {
    actorId: "",
    actorName: "",
    ip: readClientIp(request),
    role: "",
    userAgent: (request.headers.get("user-agent") || "").slice(0, 400),
  };
}

/** Wraps an API handler ({ fetch }) so its requests carry audit context. */
export function withAuditContext(handler) {
  return {
    ...handler,
    fetch(request, ...rest) {
      return storage.run(createContext(request), () =>
        handler.fetch(request, ...rest),
      );
    },
  };
}

/** Records the signed-in actor (staff member or booker) for this request. */
export function setAuditActor({ id = "", name = "", role = "" } = {}) {
  const context = storage.getStore();

  if (!context) {
    return;
  }

  if (id) context.actorId = String(id);
  if (name) context.actorName = String(name).slice(0, 160);
  if (role) context.role = String(role).slice(0, 40);
}

// Header values must be ASCII, so free text (a name) travels as base64.
function toBase64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

/** The x-audit-* headers for the current request, or {} outside one. */
export function getAuditHeaders() {
  const context = storage.getStore();

  if (!context) {
    return {};
  }

  const headers = {};

  if (context.ip) headers["x-audit-ip"] = context.ip.replace(/[^\x20-\x7e]/g, "");
  if (context.userAgent) headers["x-audit-ua"] = context.userAgent.replace(/[^\x20-\x7e]/g, "");
  if (context.actorId) headers["x-audit-actor"] = context.actorId;
  if (context.role) headers["x-audit-role"] = context.role;
  if (context.actorName) headers["x-audit-actor-name"] = toBase64(context.actorName);

  return headers;
}

/** fetch for the Supabase client: adds the audit headers when present. */
export function auditFetch(input, init = {}) {
  const extra = getAuditHeaders();

  if (Object.keys(extra).length === 0) {
    return fetch(input, init);
  }

  const headers = new Headers(
    init.headers ?? (input instanceof Request ? input.headers : undefined),
  );

  for (const [name, value] of Object.entries(extra)) {
    headers.set(name, value);
  }

  return fetch(input, { ...init, headers });
}
