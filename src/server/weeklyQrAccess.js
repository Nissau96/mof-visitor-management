import { Buffer } from "node:buffer";
import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import process from "node:process";
import { HttpError } from "../../api/_lib/http.js";
import { getAdminClient } from "../../api/_lib/supabase.js";

const TOKEN_VERSION = "v1";

const TOKEN_AUDIENCE =
  "mof-weekly-visitor-access";

const MINIMUM_SECRET_BYTES = 32;
const MAXIMUM_TOKEN_LENGTH = 256;

const WEEKLY_QR_COOKIE_NAME =
  "mof_visitor_weekly_access";

// A reception tablet set up as a kiosk holds a signed device cookie
// instead of reopening the weekly QR link every Monday.
const KIOSK_AUDIENCE =
  "mof-reception-kiosk-device";

const KIOSK_COOKIE_NAME =
  "mof_visitor_kiosk";

export const KIOSK_DEVICE_LIFETIME_DAYS = 365;

const ACCRA_DATE_FORMATTER =
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Accra",
    year: "numeric",
  });

function getWeeklyQrSecret() {
  const secret =
    process.env.WEEKLY_QR_SECRET || "";

  if (
    Buffer.byteLength(secret, "utf8") <
    MINIMUM_SECRET_BYTES
  ) {
    throw new Error(
      "WEEKLY_QR_SECRET must contain at least 32 bytes.",
    );
  }

  return secret;
}

function getAccraDateParts(date) {
  const parts =
    ACCRA_DATE_FORMATTER.formatToParts(
      date,
    );

  const values = Object.fromEntries(
    parts
      .filter((part) =>
        [
          "day",
          "month",
          "year",
        ].includes(part.type),
      )
      .map((part) => [
        part.type,
        Number(part.value),
      ]),
  );

  if (
    !Number.isInteger(values.year) ||
    !Number.isInteger(values.month) ||
    !Number.isInteger(values.day)
  ) {
    throw new Error(
      "The Ghana calendar date could not be calculated.",
    );
  }

  return values;
}

function formatCalendarDate(date) {
  const year = date.getUTCFullYear();

  const month = String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getUTCDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addCalendarDays(date, numberOfDays) {
  const result = new Date(date.getTime());

  result.setUTCDate(
    result.getUTCDate() + numberOfDays,
  );

  return result;
}

export function getWeeklyQrWindow(
  now = new Date(),
) {
  if (
    !(now instanceof Date) ||
    Number.isNaN(now.getTime())
  ) {
    throw new TypeError(
      "A valid date is required.",
    );
  }

  const accraDate = getAccraDateParts(now);

  const currentCalendarDate = new Date(
    Date.UTC(
      accraDate.year,
      accraDate.month - 1,
      accraDate.day,
    ),
  );

  const daysSinceMonday =
    (currentCalendarDate.getUTCDay() + 6) %
    7;

  const monday = addCalendarDays(
    currentCalendarDate,
    -daysSinceMonday,
  );

  const sunday = addCalendarDays(
    monday,
    6,
  );

  const nextMonday = addCalendarDays(
    monday,
    7,
  );

  const weekStartsOn =
    formatCalendarDate(monday);

  const weekEndsOn =
    formatCalendarDate(sunday);

  return {
    expiresAt:
      nextMonday.toISOString(),
    validFrom:
      monday.toISOString(),
    validThrough:
      `${weekEndsOn}T23:59:59.999Z`,
    weekEndsOn,
    weekStartsOn,
  };
}

function createSignature(weekStartsOn) {
  return createHmac(
    "sha256",
    getWeeklyQrSecret(),
  )
    .update(
      [
        TOKEN_AUDIENCE,
        TOKEN_VERSION,
        weekStartsOn,
      ].join("\u0000"),
      "utf8",
    )
    .digest();
}

export function createWeeklyQrToken(
  now = new Date(),
) {
  const window = getWeeklyQrWindow(now);

  const signature = createSignature(
    window.weekStartsOn,
  ).toString("base64url");

  return {
    ...window,
    token: [
      TOKEN_VERSION,
      window.weekStartsOn,
      signature,
    ].join("."),
  };
}

export function validateWeeklyQrToken(
  token,
  now = new Date(),
) {
  if (
    typeof token !== "string" ||
    token.length < 40 ||
    token.length > MAXIMUM_TOKEN_LENGTH
  ) {
    throw new HttpError(
      "The weekly visitor access token is invalid.",
      401,
    );
  }

  const segments = token.split(".");

  if (segments.length !== 3) {
    throw new HttpError(
      "The weekly visitor access token is invalid.",
      401,
    );
  }

  const [
    version,
    weekStartsOn,
    encodedSignature,
  ] = segments;

  const currentWindow =
    getWeeklyQrWindow(now);

  if (
    version !== TOKEN_VERSION ||
    weekStartsOn !==
      currentWindow.weekStartsOn
  ) {
    throw new HttpError(
      "The weekly visitor QR code has expired.",
      401,
    );
  }

  let suppliedSignature;

  try {
    suppliedSignature = Buffer.from(
      encodedSignature,
      "base64url",
    );
  } catch {
    throw new HttpError(
      "The weekly visitor access token is invalid.",
      401,
    );
  }

  if (
    suppliedSignature.toString(
      "base64url",
    ) !== encodedSignature
  ) {
    throw new HttpError(
      "The weekly visitor access token is invalid.",
      401,
    );
  }

  const expectedSignature =
    createSignature(weekStartsOn);

  if (
    suppliedSignature.length !==
      expectedSignature.length ||
    !timingSafeEqual(
      suppliedSignature,
      expectedSignature,
    )
  ) {
    throw new HttpError(
      "The weekly visitor access token is invalid.",
      401,
    );
  }

  return {
    ...currentWindow,
    token,
  };
}

function getVisitorApplicationUrl(
  applicationUrl,
) {
  const configuredUrl =
    applicationUrl ??
    process.env.VISITOR_APP_URL ??
    "";

  let url;

  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error(
      "VISITOR_APP_URL must be a valid absolute URL.",
    );
  }

  const localDevelopment =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1";

  if (
    url.protocol !== "https:" &&
    !(
      localDevelopment &&
      url.protocol === "http:"
    )
  ) {
    throw new Error(
      "VISITOR_APP_URL must use HTTPS outside local development.",
    );
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "VISITOR_APP_URL must not contain credentials, a query or a fragment.",
    );
  }

  return url;
}

// Local development serves the visitor app from the request's own
// origin, so the QR code works without VISITOR_APP_URL. Deployed
// environments return undefined and use VISITOR_APP_URL.
export function getLocalVisitorApplicationUrl(
  request,
) {
  const vercelEnvironment =
    process.env.VERCEL_ENV || "";

  if (
    vercelEnvironment &&
    vercelEnvironment !== "development"
  ) {
    return undefined;
  }

  let requestUrl;

  try {
    requestUrl = new URL(request.url);
  } catch {
    return undefined;
  }

  const localHostname =
    requestUrl.hostname === "localhost" ||
    requestUrl.hostname === "127.0.0.1";

  if (
    requestUrl.protocol !== "http:" ||
    !localHostname
  ) {
    return undefined;
  }

  return new URL(
    "/visit",
    requestUrl.origin,
  ).toString();
}

export function createWeeklyQrAccessUrl(
  token,
  applicationUrl,
) {
  const url = new URL(
    "/visit",
    getVisitorApplicationUrl(
      applicationUrl,
    ),
  );

  url.hash = new URLSearchParams({
    weeklyAccess: token,
  }).toString();

  return url.toString();
}

function readCookie(request, cookieName) {
  const cookieHeader =
    request.headers.get("cookie") || "";

  for (const segment of cookieHeader.split(";")) {
    const separatorIndex =
      segment.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = segment
      .slice(0, separatorIndex)
      .trim();

    if (name !== cookieName) {
      continue;
    }

    const value = segment
      .slice(separatorIndex + 1)
      .trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return "";
    }
  }

  return "";
}

function signKioskDevice(
  deviceId,
  expiresAt,
) {
  return createHmac(
    "sha256",
    getWeeklyQrSecret(),
  )
    .update(
      [
        KIOSK_AUDIENCE,
        TOKEN_VERSION,
        deviceId,
        expiresAt,
      ].join("\u0000"),
      "utf8",
    )
    .digest();
}

export function createKioskDeviceCookie(
  request,
  now = new Date(),
) {
  const expiryTime =
    now.getTime() +
    KIOSK_DEVICE_LIFETIME_DAYS *
      86_400_000;

  const deviceId = randomUUID();
  const expiresAt = String(expiryTime);

  const token = [
    TOKEN_VERSION,
    deviceId,
    expiresAt,
    signKioskDevice(
      deviceId,
      expiresAt,
    ).toString("base64url"),
  ].join(".");

  const attributes = [
    `${KIOSK_COOKIE_NAME}=${token}`,
    "Path=/api",
    `Max-Age=${KIOSK_DEVICE_LIFETIME_DAYS * 86_400}`,
    `Expires=${new Date(
      expiryTime,
    ).toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (requestUsesHttps(request)) {
    attributes.push("Secure");
  }

  return {
    cookie: attributes.join("; "),
    deviceId,
    expiresAt: new Date(
      expiryTime,
    ).toISOString(),
  };
}

export function readKioskDevice(
  request,
  now = new Date(),
) {
  const segments = readCookie(
    request,
    KIOSK_COOKIE_NAME,
  ).split(".");

  if (segments.length !== 4) {
    return null;
  }

  const [
    version,
    deviceId,
    expiresAt,
    encodedSignature,
  ] = segments;

  if (
    version !== TOKEN_VERSION ||
    !/^\d{13}$/.test(expiresAt) ||
    Number(expiresAt) <= now.getTime()
  ) {
    return null;
  }

  const suppliedSignature =
    Buffer.from(
      encodedSignature,
      "base64url",
    );

  const expectedSignature =
    signKioskDevice(
      deviceId,
      expiresAt,
    );

  if (
    suppliedSignature.length !==
      expectedSignature.length ||
    !timingSafeEqual(
      suppliedSignature,
      expectedSignature,
    )
  ) {
    return null;
  }

  return { deviceId };
}

// A removed or expired tablet stops working on its next request.
async function isRegisteredKioskActive(deviceId) {
  const { data, error } =
    await getAdminClient().rpc(
      "touch_kiosk_device",
      {
        p_device_id: deviceId,
      },
    );

  if (error) {
    throw new Error(
      "The kiosk device could not be checked.",
    );
  }

  return data === true;
}

// Phones use the weekly QR cookie. A set-up kiosk tablet, or any
// browser in local development, gets this week's access without it.
export async function readWeeklyQrAccess(
  request,
  now = new Date(),
  {
    isKioskDeviceActive =
      isRegisteredKioskActive,
  } = {},
) {
  const token = readCookie(
    request,
    WEEKLY_QR_COOKIE_NAME,
  );

  let weeklyError = null;

  if (token) {
    try {
      return validateWeeklyQrToken(
        token,
        now,
      );
    } catch (error) {
      weeklyError = error;
    }
  }

  if (
    getLocalVisitorApplicationUrl(
      request,
    )
  ) {
    return createWeeklyQrToken(now);
  }

  const kioskDevice = readKioskDevice(
    request,
    now,
  );

  if (
    kioskDevice &&
    (await isKioskDeviceActive(
      kioskDevice.deviceId,
    ))
  ) {
    return createWeeklyQrToken(now);
  }

  if (weeklyError) {
    throw weeklyError;
  }

  throw new HttpError(
    "Scan the current reception QR code to access visitor services.",
    401,
  );
}

function requestUsesHttps(request) {
  try {
    return (
      new URL(request.url).protocol ===
      "https:"
    );
  } catch {
    return false;
  }
}

export function createWeeklyQrCookie(
  request,
  token,
  now = new Date(),
) {
  const access =
    validateWeeklyQrToken(token, now);

  const expiryTime = Date.parse(
    access.expiresAt,
  );

  const maximumAge = Math.max(
    1,
    Math.floor(
      (expiryTime - now.getTime()) / 1000,
    ),
  );

  const attributes = [
    `${WEEKLY_QR_COOKIE_NAME}=${encodeURIComponent(
      token,
    )}`,
    "Path=/api",
    `Max-Age=${maximumAge}`,
    `Expires=${new Date(
      expiryTime,
    ).toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (requestUsesHttps(request)) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function clearWeeklyQrCookie(
  request,
) {
  const attributes = [
    `${WEEKLY_QR_COOKIE_NAME}=`,
    "Path=/api",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (requestUsesHttps(request)) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}