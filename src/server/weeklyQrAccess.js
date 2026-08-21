import { Buffer } from "node:buffer";
import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import process from "node:process";
import { HttpError } from "../../api/_lib/http.js";

const TOKEN_VERSION = "v1";

const TOKEN_AUDIENCE =
  "mof-weekly-visitor-access";

const MINIMUM_SECRET_BYTES = 32;
const MAXIMUM_TOKEN_LENGTH = 256;

const WEEKLY_QR_COOKIE_NAME =
  "mof_visitor_weekly_access";

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

export function readWeeklyQrAccess(
  request,
  now = new Date(),
) {
  const token = readCookie(
    request,
    WEEKLY_QR_COOKIE_NAME,
  );

  if (!token) {
    throw new HttpError(
      "Scan the current reception QR code to access visitor services.",
      401,
    );
  }

  return validateWeeklyQrToken(
    token,
    now,
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