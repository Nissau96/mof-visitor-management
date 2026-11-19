import process from "node:process";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { HttpError } from "./http.js";

// Meeting bookers sign in with their Ministry work email (Microsoft
// Entra ID) in the browser and send the resulting ID token as a Bearer
// token. Bookers have no account in this app: the token's signature,
// tenant, audience and expiry are the whole proof of who they are.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const keySets = new Map();

function getKeySet(tenantId) {
  if (!keySets.has(tenantId)) {
    keySets.set(
      tenantId,
      createRemoteJWKSet(
        new URL(
          `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        ),
      ),
    );
  }

  return keySets.get(tenantId);
}

export function readWorkEmailConfiguration(environment = process.env) {
  const tenantId = String(environment.VITE_ENTRA_TENANT_ID || "").trim();
  const clientId = String(environment.VITE_ENTRA_CLIENT_ID || "").trim();

  if (!GUID.test(tenantId) || !GUID.test(clientId)) {
    return null;
  }

  return { clientId, tenantId };
}

function readBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(header.trim());

  return match ? match[1] : "";
}

// Returns { email, name, oid } for a valid Ministry ID token.
export async function verifyWorkEmailToken(
  request,
  {
    environment = process.env,
    keySetForTenant = getKeySet,
  } = {},
) {
  const configuration = readWorkEmailConfiguration(environment);

  if (!configuration) {
    throw new HttpError(
      "Work email sign-in is not configured. Contact the system administrator.",
      503,
    );
  }

  const token = readBearerToken(request);

  if (!token) {
    throw new HttpError(
      "Sign in with your work email to continue.",
      401,
    );
  }

  let payload;

  try {
    ({ payload } = await jwtVerify(
      token,
      keySetForTenant(configuration.tenantId),
      {
        audience: configuration.clientId,
        clockTolerance: 60,
        issuer: `https://login.microsoftonline.com/${configuration.tenantId}/v2.0`,
      },
    ));
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      throw new HttpError(
        "Your work email sign-in has expired. Sign in again.",
        401,
      );
    }

    throw new HttpError(
      "Your work email sign-in could not be verified. Sign in again.",
      401,
    );
  }

  const email = String(payload.email || payload.preferred_username || "")
    .trim()
    .toLowerCase();

  const oid = String(payload.oid || "");

  if (
    payload.tid !== configuration.tenantId ||
    !GUID.test(oid) ||
    !EMAIL.test(email)
  ) {
    throw new HttpError(
      "Only Ministry work accounts can book meetings.",
      403,
    );
  }

  return {
    email,
    name: String(payload.name || email).trim().slice(0, 160) || email,
    oid,
  };
}
