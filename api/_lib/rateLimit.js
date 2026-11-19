import { getAdminClient } from "./supabase.js";
import { createPrivateRequestKey } from "./visitorLookup.js";
import { readKioskDevice } from "../../src/server/weeklyQrAccess.js";

// A reception kiosk serves visitor after visitor from one device, so
// its per-client limits are counted per tablet and multiplied.
// Per-visitor (subject) limits stay as they are.
export const KIOSK_RATE_LIMIT_MULTIPLIER = 6;

export const RATE_LIMIT_KEY_MODES =
  Object.freeze({
    client: "client",
    subject: "subject",
  });

export class RateLimitExceededError extends Error {
  constructor(retryAfterSeconds) {
    super("Too many requests.");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function enforceRateLimit(
  request,
  options,
) {
  const kioskDevice =
    (options.keyMode ??
      RATE_LIMIT_KEY_MODES.client) ===
      RATE_LIMIT_KEY_MODES.client
      ? readKioskDevice(request)
      : null;

  const {
    keyMode = RATE_LIMIT_KEY_MODES.client,
    limit,
    scope,
    subject = "",
    windowSeconds,
  } = kioskDevice
    ? {
        ...options,
        keyMode:
          RATE_LIMIT_KEY_MODES.subject,
        limit:
          options.limit *
          KIOSK_RATE_LIMIT_MULTIPLIER,
        subject: `kiosk:${kioskDevice.deviceId}`,
      }
    : options;

  if (
    keyMode !== RATE_LIMIT_KEY_MODES.client &&
    keyMode !== RATE_LIMIT_KEY_MODES.subject
  ) {
    throw new Error(
      "The rate-limit key mode is invalid.",
    );
  }

  const normalizedSubject =
    String(subject || "").trim();

  if (
    keyMode === RATE_LIMIT_KEY_MODES.subject &&
    !normalizedSubject
  ) {
    throw new Error(
      "A rate-limit subject is required.",
    );
  }

  const requestKey = createPrivateRequestKey(
    request,
    scope,
    normalizedSubject,
    keyMode,
  );

  const { data, error } =
    await getAdminClient().rpc(
      "consume_public_rate_limit",
      {
        p_limit: limit,
        p_request_key: requestKey,
        p_window_seconds: windowSeconds,
      },
    );

  if (error) {
    const rateLimitError = new Error(
      "The request limit could not be checked.",
    );

    rateLimitError.code = error.code;
    throw rateLimitError;
  }

  if (data !== true) {
    throw new RateLimitExceededError(
      windowSeconds,
    );
  }
}