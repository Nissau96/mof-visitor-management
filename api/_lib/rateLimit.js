import { getAdminClient } from "./supabase.js";
import { createPrivateRequestKey } from "./visitorLookup.js";

export class RateLimitExceededError extends Error {
  constructor(retryAfterSeconds) {
    super("Too many requests.");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function enforceRateLimit(
  request,
  {
    limit,
    scope,
    subject = "",
    windowSeconds,
  },
) {
  const requestKey = createPrivateRequestKey(
    request,
    scope,
    subject,
  );

  const { data, error } = await getAdminClient().rpc(
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
    throw new RateLimitExceededError(windowSeconds);
  }
}