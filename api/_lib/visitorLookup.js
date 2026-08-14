import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import process from "node:process";

export const VISITOR_LOOKUP_AUDIENCE =
  "returning-visitor-lookup";

export const VERIFIED_VISITOR_AUDIENCE =
  "returning-visitor-verified";

export const LOOKUP_TOKEN_TTL_SECONDS = 5 * 60;
export const VERIFIED_TOKEN_TTL_SECONDS = 10 * 60;

const TOKEN_ISSUER = "mof-visitor-management";
const TOKEN_VERSION = 1;
const MAXIMUM_TOKEN_LIFETIME_SECONDS = 15 * 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getLookupSecret() {
  const secret = process.env.VISITOR_LOOKUP_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "VISITOR_LOOKUP_SECRET must contain at least 32 bytes.",
    );
  }

  return secret;
}

function createSignature(encodedPayload) {
  return createHmac("sha256", getLookupSecret())
    .update(encodedPayload)
    .digest();
}

function createVisitorToken(
  visitorId,
  audience,
  lifetimeSeconds,
  oneTime = false,
) {
  if (!UUID_PATTERN.test(visitorId)) {
    throw new Error(
      "Cannot create a token for an invalid visitor.",
    );
  }

  const issuedAt = Math.floor(Date.now() / 1000);

  const payload = {
    aud: audience,
    exp: issuedAt + lifetimeSeconds,
    iat: issuedAt,
    iss: TOKEN_ISSUER,
    sub: visitorId,
    v: TOKEN_VERSION,
  };

  if (oneTime) {
    payload.jti = randomUUID();
  }

  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");

  const signature = createSignature(
    encodedPayload,
  ).toString("base64url");

  return `${encodedPayload}.${signature}`;
}

export function createLookupToken(visitorId) {
  return createVisitorToken(
    visitorId,
    VISITOR_LOOKUP_AUDIENCE,
    LOOKUP_TOKEN_TTL_SECONDS,
  );
}

export function createVerifiedVisitorToken(visitorId) {
  return createVisitorToken(
    visitorId,
    VERIFIED_VISITOR_AUDIENCE,
    VERIFIED_TOKEN_TTL_SECONDS,
    true,
  );
}

export function readVisitorToken(
  token,
  expectedAudience,
) {
  if (
    typeof token !== "string" ||
    token.length < 20 ||
    token.length > 2048
  ) {
    throw new Error("Invalid visitor token.");
  }

  const segments = token.split(".");

  if (segments.length !== 2) {
    throw new Error("Invalid visitor token.");
  }

  const [encodedPayload, encodedSignature] = segments;
  const expectedSignature =
    createSignature(encodedPayload);

  let suppliedSignature;

  try {
    suppliedSignature = Buffer.from(
      encodedSignature,
      "base64url",
    );
  } catch {
    throw new Error("Invalid visitor token.");
  }

  if (
    suppliedSignature.length !==
      expectedSignature.length ||
    !timingSafeEqual(
      suppliedSignature,
      expectedSignature,
    )
  ) {
    throw new Error("Invalid visitor token.");
  }

  let payload;

  try {
    payload = JSON.parse(
      Buffer.from(
        encodedPayload,
        "base64url",
      ).toString("utf8"),
    );
  } catch {
    throw new Error("Invalid visitor token.");
  }

  const currentTime = Math.floor(Date.now() / 1000);

  if (
    payload?.v !== TOKEN_VERSION ||
    payload?.iss !== TOKEN_ISSUER ||
    payload?.aud !== expectedAudience ||
    !UUID_PATTERN.test(payload?.sub || "") ||
    !Number.isInteger(payload?.iat) ||
    !Number.isInteger(payload?.exp) ||
    payload.iat > currentTime + 30 ||
    payload.exp <= currentTime ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat >
      MAXIMUM_TOKEN_LIFETIME_SECONDS
  ) {
    throw new Error(
      "Invalid or expired visitor token.",
    );
  }

  const requiresOneTimeIdentifier =
    expectedAudience === VERIFIED_VISITOR_AUDIENCE;

  if (
    requiresOneTimeIdentifier &&
    !UUID_PATTERN.test(payload?.jti || "")
  ) {
    throw new Error(
      "Invalid verified visitor token.",
    );
  }

  return {
    visitorId: payload.sub,
    tokenId: payload.jti || null,
    expiresAt: payload.exp,
  };
}

function maskWord(word) {
  const characters = Array.from(word);

  if (characters.length === 0) {
    return "";
  }

  if (characters.length === 1) {
    return characters[0];
  }

  return `${characters[0]}${"•".repeat(
    Math.min(characters.length - 1, 8),
  )}`;
}

function maskWords(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(maskWord)
    .join(" ");
}

export function maskVisitorName(fullName) {
  return maskWords(fullName);
}

export function maskVisitorOrganization(organization) {
  if (!organization) {
    return "Not provided";
  }

  return maskWords(organization);
}

export function maskPhoneSuffix(phoneSuffix) {
  const suffix = String(phoneSuffix || "").replace(
    /\D/g,
    "",
  );

  if (suffix.length !== 2) {
    return "•••• ••••";
  }

  return `•••• ••${suffix}`;
}

function getClientAddress(request) {
  const vercelForwardedAddress =
    request.headers.get(
      "x-vercel-forwarded-for",
    );

  const standardForwardedAddress =
    request.headers.get("x-forwarded-for");

  const forwardedAddress =
    vercelForwardedAddress ||
    standardForwardedAddress;

  const candidateAddress =
    forwardedAddress
      ?.split(",")[0]
      ?.trim() || "";

  if (
    candidateAddress.length > 45 ||
    isIP(candidateAddress) === 0
  ) {
    return "local-or-unknown-client";
  }

  return candidateAddress.toLowerCase();
}

export function createPrivateRequestKey(
  request,
  scope,
  subject = "",
) {
  const address = getClientAddress(request);

  return createHmac("sha256", getLookupSecret())
    .update(
      `${scope}\u0000${address}\u0000${subject}`,
    )
    .digest("hex");
}