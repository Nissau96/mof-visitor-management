import assert from "node:assert/strict";
import {
  readdir,
  readFile,
} from "node:fs/promises";
import { json } from "../api/_lib/http.js";

const EXPECTED_CONTENT_SECURITY_POLICY =
  "default-src 'self'; " +
  "base-uri 'self'; " +
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co; " +
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
    source: "/api/admin/hosts/list",
    destination: "/api/admin?operation=host-list",
  },
  {
    source: "/api/admin/hosts/save",
    destination: "/api/admin?operation=host-save",
  },
  {
    source: "/api/admin/staff/invite",
    destination: "/api/admin?operation=staff-invite",
  },
  {
    source: "/api/admin/staff/list",
    destination: "/api/admin?operation=staff-list",
  },
  {
    source: "/api/admin/staff/update",
    destination: "/api/admin?operation=staff-update",
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
];

function getSingleHeaderRule(configuration, source) {
  const matches = configuration.headers.filter(
    (rule) => rule.source === source,
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
    rule.headers.map(({ key, value }) => [
      key.toLowerCase(),
      value,
    ]),
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
  const entries = await readdir(directoryUrl, {
    withFileTypes: true,
  });

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
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      directoryUrl,
    );

    if (entry.isDirectory()) {
      count += await countVercelFunctions(
        entryUrl,
        false,
      );

      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      count += 1;
    }
  }

  return count;
}

const vercelConfiguration = JSON.parse(
  await readFile(
    new URL("../vercel.json", import.meta.url),
    "utf8",
  ),
);

assert.ok(
  Array.isArray(vercelConfiguration.headers),
  "vercel.json must contain header rules.",
);

assert.deepEqual(
  vercelConfiguration.rewrites,
  EXPECTED_REWRITES,
  "Existing Vercel rewrites must remain unchanged.",
);

const globalHeaderRule = getSingleHeaderRule(
  vercelConfiguration,
  "/(.*)",
);

const apiHeaderRule = getSingleHeaderRule(
  vercelConfiguration,
  "/api/(.*)",
);

const globalHeaders = createHeaderMap(globalHeaderRule);
const apiHeaders = createHeaderMap(apiHeaderRule);

assert.equal(
  globalHeaders.get("content-security-policy"),
  EXPECTED_CONTENT_SECURITY_POLICY,
);

assert.equal(
  globalHeaders.get("strict-transport-security"),
  "max-age=31536000",
);

assert.equal(
  globalHeaders.get("x-content-type-options"),
  "nosniff",
);

assert.equal(
  globalHeaders.get("referrer-policy"),
  "no-referrer",
);

assert.equal(
  globalHeaders.get("permissions-policy"),
  EXPECTED_PERMISSIONS_POLICY,
);

assert.equal(
  globalHeaders.get("x-frame-options"),
  "DENY",
);

assert.equal(
  globalHeaders.has("cache-control"),
  false,
  "Static assets must not receive global no-store.",
);

assert.equal(
  apiHeaders.get("cache-control"),
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
  apiJsonResponse.headers.get("cache-control"),
  "no-store",
);

const throttledJsonResponse = json(
  {
    error: "Too many requests.",
  },
  429,
  {
    "Retry-After": "600",
  },
);

assert.equal(
  throttledJsonResponse.headers.get("cache-control"),
  "no-store",
);

assert.equal(
  throttledJsonResponse.headers.get("retry-after"),
  "600",
);

const vercelFunctionCount =
  await countVercelFunctions(
    new URL("../api/", import.meta.url),
  );

assert.equal(
  vercelFunctionCount,
  11,
  "The project must remain within the Vercel Hobby Function limit.",
);

console.log(
  "Security header and Vercel configuration validation checks passed.",
);