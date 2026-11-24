import assert from "node:assert/strict";
import {
  readdir,
  readFile,
} from "node:fs/promises";
import { json } from "../api/_lib/http.js";

const EXPECTED_CONTENT_SECURITY_POLICY =
  "default-src 'self'; " +
  "base-uri 'self'; " +
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://login.microsoftonline.com; " +
  "font-src 'self' data:; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'; " +
  "frame-src 'none'; " +
  "img-src 'self' data: blob:; " +
  "manifest-src 'self'; " +
  "object-src 'none'; " +
  "script-src 'self'; " +
  "style-src 'self'; " +
  "worker-src 'self' blob:; " +
  "upgrade-insecure-requests";

const EXPECTED_PERMISSIONS_POLICY =
  "accelerometer=(), " +
  "browsing-topics=(), " +
  "camera=(), " +
  "geolocation=(), " +
  "gyroscope=(), " +
  "magnetometer=(), " +
  "microphone=(), " +
  "payment=(), " +
  "usb=()";

const EXPECTED_REWRITES = [
  {
    source: "/api/staff/notifications",
    destination:
      "/api/staff/dashboard?operation=notifications",
  },
  {
    source: "/api/staff/invites/create",
    destination: "/api/meetings?operation=invite-create",
  },
  {
    source: "/api/staff/invites/list",
    destination: "/api/meetings?operation=invite-list",
  },
  {
    source: "/api/staff/invites/cancel",
    destination: "/api/meetings?operation=invite-cancel",
  },
  {
    source: "/api/staff/bookings/visitors",
    destination: "/api/meetings?operation=booked-list",
  },
  {
    source: "/api/staff/history/export",
    destination: "/api/staff/history?operation=export",
  },
  {
    source: "/api/staff/bookings/find",
    destination: "/api/meetings?operation=booking-find",
  },
  {
    source: "/api/bookings/invites/create",
    destination: "/api/meetings?operation=booker-invite-create",
  },
  {
    source: "/api/bookings/invites/list",
    destination: "/api/meetings?operation=booker-invite-list",
  },
  {
    source: "/api/bookings/invites/cancel",
    destination: "/api/meetings?operation=booker-invite-cancel",
  },
  {
    source: "/api/invites/view",
    destination: "/api/register?operation=invite-view",
  },
  {
    source: "/api/invites/submit",
    destination: "/api/register?operation=invite-submit",
  },
  {
    source: "/api/admin/activity/list",
    destination: "/api/admin?operation=activity-list",
  },
  {
    source: "/api/admin/activity/export",
    destination: "/api/admin?operation=activity-export",
  },
  {
    source: "/api/admin/email/test",
    destination:
      "/api/admin?operation=email-test",
  },
  {
    source: "/api/admin/hosts/list",
    destination:
      "/api/admin?operation=host-list",
  },
  {
    source: "/api/admin/hosts/save",
    destination:
      "/api/admin?operation=host-save",
  },
  {
    source:
      "/api/admin/staff/delete",
    destination:
      "/api/admin?operation=staff-delete",
  },
  {
    source:
      "/api/admin/staff/invite",
    destination:
      "/api/admin?operation=staff-invite",
  },
  {
    source:
      "/api/admin/staff/list",
    destination:
      "/api/admin?operation=staff-list",
  },
  {
    source:
      "/api/admin/staff/reissue-password",
    destination:
      "/api/admin?operation=staff-password-reissue",
  },
  {
    source:
      "/api/admin/staff/update",
    destination:
      "/api/admin?operation=staff-update",
  },
    {
    source:
      "/api/admin/cards/inventory",
    destination:
      "/api/admin?operation=card-inventory",
  },
  {
    source:
      "/api/admin/cards/create",
    destination:
      "/api/admin?operation=card-create",
  },
  {
    source:
      "/api/admin/cards/assign-tower",
    destination:
      "/api/admin?operation=card-tower-assign",
  },
  {
    source:
      "/api/staff/cards/pending",
    destination:
      "/api/staff/checkout?operation=pending-list",
  },
  {
    source:
      "/api/staff/cards/search",
    destination:
      "/api/staff/checkout?operation=card-search",
  },
  {
    source:
      "/api/staff/cards/admit",
    destination:
      "/api/staff/checkout?operation=admission",
  },
  {
    source:
      "/api/staff/cards/cancel",
    destination:
      "/api/staff/checkout?operation=admission-cancel",
  },
  {
    source:
      "/api/staff/cards/checked-in",
    destination:
      "/api/staff/checkout?operation=checked-in-list",
  },
  {
    source:
      "/api/staff/cards/checked-in-count",
    destination:
      "/api/staff/checkout?operation=checked-in-count",
  },
  {
    source:
      "/api/staff/cards/report-not-returned",
    destination:
      "/api/staff/checkout?operation=report-not-returned",
  },
  {
    source:
      "/api/staff/cards/incidents",
    destination:
      "/api/staff/checkout?operation=incident-list",
  },
  {
    source:
      "/api/staff/cards/incidents/start",
    destination:
      "/api/staff/checkout?operation=incident-start",
  },
  {
    source:
      "/api/staff/cards/incidents/resolve",
    destination:
      "/api/staff/checkout?operation=incident-resolve",
  },
  {
    source:
      "/api/staff/cards/reprint",
    destination:
      "/api/staff/checkout?operation=card-reprint",
  },
  {
    source:
      "/api/staff/meetings/list",
    destination:
      "/api/meetings?operation=staff-list",
  },
  {
    source:
      "/api/staff/meetings/save",
    destination:
      "/api/meetings?operation=staff-save",
  },
  {
    source:
      "/api/staff/meetings/status",
    destination:
      "/api/meetings?operation=staff-status",
  },
  {
    source:
      "/api/staff/meetings/delete",
    destination:
      "/api/meetings?operation=staff-delete",
  },
  {
    source:
      "/api/staff/meetings/visitors",
    destination:
      "/api/meetings?operation=staff-visitors",
  },
  ...[
    ["/api/staff/meetings/bookings", "booking-requests"],
    ["/api/staff/meetings/bookings/decide", "booking-decide"],
    ["/api/bookings/mine", "booker-list"],
    ["/api/bookings/submit", "booker-submit"],
    ["/api/bookings/guests", "booker-guests"],
    ["/api/bookings/cancel", "booker-cancel"],
    ["/api/bookings/wifi", "booker-wifi"],
    ["/api/staff/wifi/list", "wifi-list"],
    ["/api/staff/wifi/update", "wifi-update"],
    ["/api/staff/wifi/grant", "wifi-grant"],
    ["/api/staff/wifi/secret", "wifi-secret"],
    ["/api/staff/wifi/resend", "wifi-resend"],
    ["/api/staff/wifi/count", "wifi-count"],
  ].map(([source, operation]) => ({
    source,
    destination: `/api/meetings?operation=${operation}`,
  })),
  {
    source: "/api/feedback/view",
    destination: "/api/register?operation=feedback-view",
  },
  {
    source: "/api/feedback/submit",
    destination: "/api/register?operation=feedback-submit",
  },
  {
    source: "/api/staff/feedback",
    destination: "/api/staff/dashboard?operation=feedback",
  },
  {
    source: "/api/staff/history/messages",
    destination: "/api/staff/history?operation=messages",
  },
  {
    source: "/api/webhooks/whatsapp",
    destination: "/api/webhooks?provider=whatsapp",
  },
  {
    source: "/api/returning/send-code",
    destination:
      "/api/returning/verify?operation=send-code",
  },
  {
    source: "/visit",
    destination: "/index.html",
  },
  {
    source: "/visit/:path*",
    destination: "/index.html",
  },
  {
    source: "/staff",
    destination: "/index.html",
  },
  {
    source: "/staff/:path*",
    destination: "/index.html",
  },
  {
    source: "/admin",
    destination: "/index.html",
  },
  {
    source: "/admin/:path*",
    destination: "/index.html",
  },
  {
    source: "/book",
    destination: "/index.html",
  },
  {
    source: "/privacy",
    destination: "/index.html",
  },
  {
    source: "/feedback/:path*",
    destination: "/index.html",
  },
  {
    source: "/book/:path*",
    destination: "/index.html",
  },
];

function getSingleHeaderRule(
  configuration,
  source,
) {
  const matches =
    configuration.headers.filter(
      (rule) =>
        rule.source === source,
    );

  assert.equal(
    matches.length,
    1,
    `Expected exactly one header rule for ${source}.`,
  );

  return matches[0];
}

function createHeaderMap(rule) {
  const headers = new Map(
    rule.headers.map(
      ({ key, value }) => [
        key.toLowerCase(),
        value,
      ],
    ),
  );

  assert.equal(
    headers.size,
    rule.headers.length,
    `Duplicate headers were found for ${rule.source}.`,
  );

  return headers;
}

async function countVercelFunctions(
  directoryUrl,
  isApiRoot = true,
) {
  const entries = await readdir(
    directoryUrl,
    {
      withFileTypes: true,
    },
  );

  let count = 0;

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      isApiRoot &&
      entry.name.startsWith("_")
    ) {
      continue;
    }

    const entryUrl = new URL(
      `${entry.name}${
        entry.isDirectory()
          ? "/"
          : ""
      }`,
      directoryUrl,
    );

    if (entry.isDirectory()) {
      count +=
        await countVercelFunctions(
          entryUrl,
          false,
        );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(".js")
    ) {
      count += 1;
    }
  }

  return count;
}

const vercelConfiguration =
  JSON.parse(
    await readFile(
      new URL(
        "../vercel.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

assert.ok(
  Array.isArray(
    vercelConfiguration.headers,
  ),
  "vercel.json must contain header rules.",
);

assert.deepEqual(
  vercelConfiguration.rewrites,
  EXPECTED_REWRITES,
  "Existing Vercel rewrites must remain unchanged.",
);

const globalHeaderRule =
  getSingleHeaderRule(
    vercelConfiguration,
    "/(.*)",
  );

const apiHeaderRule =
  getSingleHeaderRule(
    vercelConfiguration,
    "/api/(.*)",
  );

const globalHeaders =
  createHeaderMap(
    globalHeaderRule,
  );

const apiHeaders =
  createHeaderMap(apiHeaderRule);

assert.equal(
  globalHeaders.get(
    "content-security-policy",
  ),
  EXPECTED_CONTENT_SECURITY_POLICY,
);

assert.equal(
  globalHeaders.get(
    "strict-transport-security",
  ),
  "max-age=31536000",
);

assert.equal(
  globalHeaders.get(
    "x-content-type-options",
  ),
  "nosniff",
);

assert.equal(
  globalHeaders.get(
    "referrer-policy",
  ),
  "no-referrer",
);

assert.equal(
  globalHeaders.get(
    "permissions-policy",
  ),
  EXPECTED_PERMISSIONS_POLICY,
);

assert.equal(
  globalHeaders.get(
    "x-frame-options",
  ),
  "DENY",
);

assert.equal(
  globalHeaders.has(
    "cache-control",
  ),
  false,
  "Static assets must not receive global no-store.",
);

assert.equal(
  apiHeaders.get(
    "cache-control",
  ),
  "no-store",
);

assert.equal(
  EXPECTED_CONTENT_SECURITY_POLICY.includes(
    "'unsafe-eval'",
  ),
  false,
);

assert.equal(
  EXPECTED_CONTENT_SECURITY_POLICY.includes(
    "'unsafe-inline'",
  ),
  false,
);

assert.equal(
  EXPECTED_CONTENT_SECURITY_POLICY.includes(
    "script-src 'self' data:",
  ),
  false,
);

const apiJsonResponse = json(
  {
    status: "ok",
  },
  200,
);

assert.equal(
  apiJsonResponse.headers.get(
    "cache-control",
  ),
  "no-store",
);

const throttledJsonResponse =
  json(
    {
      error:
        "Too many requests.",
    },
    429,
    {
      "Retry-After": "600",
    },
  );

assert.equal(
  throttledJsonResponse.headers.get(
    "cache-control",
  ),
  "no-store",
);

assert.equal(
  throttledJsonResponse.headers.get(
    "retry-after",
  ),
  "600",
);

const vercelFunctionCount =
  await countVercelFunctions(
    new URL(
      "../api/",
      import.meta.url,
    ),
  );

assert.equal(
  vercelFunctionCount,
  11,
  "The project must remain within the Vercel Hobby Function limit.",
);

console.log(
  "Security header and Vercel configuration validation checks passed.",
);