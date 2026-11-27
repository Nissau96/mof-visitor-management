import { withAuditContext } from "../_lib/auditContext.js";
import { randomInt } from "node:crypto";
import process from "node:process";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../_lib/http.js";
import {
  RateLimitExceededError,
  enforceRateLimit,
} from "../_lib/rateLimit.js";
import { getAdminClient } from "../_lib/supabase.js";
import {
  VERIFIED_TOKEN_TTL_SECONDS,
  createKeyedHash,
  createVerifiedVisitorToken,
  maskEmail,
  maskPhone,
} from "../_lib/visitorLookup.js";
import {
  SmsUnavailableError,
  resolveSmsProvider,
  sendVisitorCodeSms,
} from "../../src/server/smsSender.js";
import { readWeeklyQrAccess } from "../../src/server/weeklyQrAccess.js";
import {
  returningVisitorCodeSchema,
  returningVisitorLookupSchema,
} from "../../src/validation/returningVisitor.js";

// Returning-visitor verification, one Vercel Function.
//
// SMS codes are off unless RETURNING_SMS_CODES=on. While they are off,
// the visitor's mobile number alone finds their record (the Ministry
// accepted this until SMS codes are switched on):
//   GET  /api/returning/verify?operation=mode  → { smsCodes }
//   POST /api/returning/verify { phone }        → the record, or 400
//
// With SMS codes on:
//   POST /api/returning/send-code (?operation=send-code): text a code
//     to the number if it is registered. The answer is the same either
//     way, so the page never reveals who has visited.
//   POST /api/returning/verify { phone, code }: check the code and
//     return the record with a short-lived check-in token.

export function smsCodesEnabled(environment = process.env) {
  return String(environment.RETURNING_SMS_CODES || "")
    .trim()
    .toLowerCase() === "on";
}

export const SMS_CODE_TTL_SECONDS = 5 * 60;
export const SMS_RESEND_SECONDS = 60;

// Code requests from one browser or kiosk.
export const SMS_REQUEST_RATE_LIMIT = Object.freeze({
  limit: 10,
  scope: "returning-visitor-sms-request",
  windowSeconds: 10 * 60,
});

// All code requests together, to protect the SMS budget.
export const SMS_GLOBAL_RATE_LIMIT = Object.freeze({
  keyMode: "subject",
  limit: 100,
  scope: "returning-visitor-sms-global",
  subject: "all-numbers",
  windowSeconds: 60 * 60,
});

// Code checks per phone number; each code also allows only 5 tries.
export const VISITOR_VERIFICATION_RATE_LIMIT = Object.freeze({
  keyMode: "subject",
  limit: 10,
  scope: "returning-visitor-verification-phone",
  windowSeconds: 10 * 60,
});

// Lookups by number alone, while SMS codes are off: per browser or
// kiosk, and per number so one number cannot be tried over and over.
export const NUMBER_LOOKUP_RATE_LIMIT = Object.freeze({
  limit: 20,
  scope: "returning-visitor-verification",
  windowSeconds: 10 * 60,
});

export const VISITOR_LOOKUP_RATE_LIMIT = Object.freeze({
  keyMode: "subject",
  limit: 5,
  scope: "returning-visitor-lookup-phone",
  windowSeconds: 10 * 60,
});

const ASK_RECEPTION =
  "Returning check-in is unavailable. Please ask reception for help.";

// When the visitor last checked in, shown as a reminder on the verified
// card. Optional: a failed lookup never blocks the check-in.
async function findLastVisitAt(client, visitorId) {
  try {
    const { data, error } = await client
      .from("visits")
      .select("checked_in_at")
      .eq("visitor_id", visitorId)
      .not("checked_in_at", "is", null)
      .order("checked_in_at", { ascending: false })
      .limit(1);

    return error ? null : data?.[0]?.checked_in_at || null;
  } catch {
    return null;
  }
}

function verifiedResponse({ email, fullName, lastVisitAt, organization, phone, visitorId }) {
  return json({
    expiresIn: VERIFIED_TOKEN_TTL_SECONDS,
    lastVisitAt,
    profile: {
      email: maskEmail(email),
      fullName,
      organization: organization || "",
      phone: maskPhone(phone),
    },
    verificationToken: createVerifiedVisitorToken(visitorId),
  });
}

// While SMS codes are off: the number alone finds the record.
async function findByNumber(request, dependencies) {
  const body = await readJsonBody(request);
  const parsed = returningVisitorLookupSchema.safeParse(body);

  if (!parsed.success) {
    return json(
      {
        error:
          parsed.error.issues[0]?.message ||
          "Enter a valid mobile number, for example 024 000 0000.",
      },
      400,
    );
  }

  const { phone } = parsed.data;

  await dependencies.enforceRateLimit(request, NUMBER_LOOKUP_RATE_LIMIT);
  await dependencies.enforceRateLimit(request, {
    ...VISITOR_LOOKUP_RATE_LIMIT,
    subject: phone,
  });

  const client = dependencies.getAdminClient();
  const { data, error } = await client.rpc(
    "find_returning_visitor_by_phone",
    { p_phone: phone },
  );

  if (error) {
    return json(
      { error: "The visitor record could not be found. Please try again." },
      500,
    );
  }

  const profile = data?.[0];

  if (!profile?.visitor_id) {
    return json(
      {
        error:
          "We couldn't find a visitor with that mobile number. Check it and try again, or register as a first-time visitor.",
        notFound: true,
      },
      400,
    );
  }

  return verifiedResponse({
    email: profile.email,
    fullName: profile.full_name,
    lastVisitAt: await findLastVisitAt(client, profile.visitor_id),
    organization: profile.organization,
    phone,
    visitorId: profile.visitor_id,
  });
}

function createCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function codeHash(phone, code) {
  return createKeyedHash("sms-code", `${phone}:${code}`);
}

async function sendCode(request, dependencies) {
  const body = await readJsonBody(request);
  const parsed = returningVisitorLookupSchema.safeParse(body);

  if (!parsed.success) {
    return json(
      {
        error:
          parsed.error.issues[0]?.message ||
          "Enter a valid mobile number, for example 024 000 0000.",
      },
      400,
    );
  }

  try {
    resolveSmsProvider(dependencies.environment);
  } catch (error) {
    if (error instanceof SmsUnavailableError) {
      return json({ error: ASK_RECEPTION, unavailable: true }, 503);
    }

    throw error;
  }

  await dependencies.enforceRateLimit(request, SMS_REQUEST_RATE_LIMIT);

  try {
    await dependencies.enforceRateLimit(request, SMS_GLOBAL_RATE_LIMIT);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return json({ error: ASK_RECEPTION, unavailable: true }, 503);
    }

    throw error;
  }

  const { phone } = parsed.data;
  const code = createCode();

  const { data, error } = await dependencies.getAdminClient().rpc(
    "create_visitor_sms_code",
    {
      p_code_hash: codeHash(phone, code),
      p_phone: phone,
      p_phone_hash: createKeyedHash("sms-phone", phone),
      p_ttl_seconds: SMS_CODE_TTL_SECONDS,
    },
  );

  if (error || !data || typeof data !== "object") {
    return json(
      { error: "The code could not be sent. Please try again." },
      500,
    );
  }

  const waitSeconds = Number(data.retryAfterSeconds) || 0;

  if (data.registered && waitSeconds === 0) {
    try {
      await dependencies.sendSms({
        code,
        environment: dependencies.environment,
        phone,
      });
    } catch {
      return json(
        {
          error:
            "The code could not be sent. Try again in a minute, or ask reception for help.",
        },
        502,
      );
    }
  }

  return json({
    codeLength: 6,
    expiresIn: SMS_CODE_TTL_SECONDS,
    maskedPhone: maskPhone(phone),
    resendAfterSeconds: Math.max(SMS_RESEND_SECONDS, waitSeconds),
  });
}

async function confirmCode(request, dependencies) {
  const body = await readJsonBody(request);
  const parsed = returningVisitorCodeSchema.safeParse(body);

  if (!parsed.success) {
    return json(
      {
        error:
          parsed.error.issues[0]?.message ||
          "Enter the 6-digit code from the SMS.",
      },
      400,
    );
  }

  const { code, phone } = parsed.data;

  await dependencies.enforceRateLimit(request, {
    ...VISITOR_VERIFICATION_RATE_LIMIT,
    subject: phone,
  });

  const client = dependencies.getAdminClient();
  const { data, error } = await client.rpc("verify_visitor_sms_code", {
    p_code_hash: codeHash(phone, code),
    p_phone_hash: createKeyedHash("sms-phone", phone),
  });

  if (error || !data || typeof data !== "object") {
    return json(
      { error: "The code could not be checked. Please try again." },
      500,
    );
  }

  if (data.status === "wrong") {
    const left = Number(data.attemptsLeft) || 0;

    return json(
      {
        attemptsLeft: left,
        error: `That code is not right. You have ${left} ${left === 1 ? "try" : "tries"} left.`,
      },
      400,
    );
  }

  if (data.status !== "verified" || !data.visitorId) {
    return json(
      {
        error:
          "This code has expired or has been tried too many times. Send a new code.",
        expired: true,
      },
      400,
    );
  }

  return verifiedResponse({
    email: data.email,
    fullName: data.fullName,
    lastVisitAt: await findLastVisitAt(client, data.visitorId),
    organization: data.organization,
    phone,
    visitorId: data.visitorId,
  });
}

export function createReturningVerifyHandler({
  enforceRateLimitForRequest = enforceRateLimit,
  environment = process.env,
  getAdminClientForRequest = getAdminClient,
  sendSms = sendVisitorCodeSms,
} = {}) {
  const dependencies = {
    enforceRateLimit: enforceRateLimitForRequest,
    environment,
    getAdminClient: getAdminClientForRequest,
    sendSms,
  };

  return {
    async fetch(request) {
      const operation =
        new URL(request.url).searchParams.get("operation") || "";
      const allowed = operation === "mode" ? "GET" : "POST";

      if (request.method !== allowed) {
        return methodNotAllowed([allowed]);
      }

      try {
        await readWeeklyQrAccess(request);

        const smsCodes = smsCodesEnabled(dependencies.environment);

        if (operation === "mode") {
          return json({ smsCodes });
        }

        if (operation === "send-code") {
          return smsCodes
            ? await sendCode(request, dependencies)
            : json({ error: "SMS codes are not in use." }, 404);
        }

        return smsCodes
          ? await confirmCode(request, dependencies)
          : await findByNumber(request, dependencies);
      } catch (error) {
        if (error instanceof RateLimitExceededError) {
          return json(
            {
              error:
                "Too many attempts. Please wait before trying again.",
            },
            429,
            { "Retry-After": String(error.retryAfterSeconds) },
          );
        }

        if (error instanceof HttpError) {
          return json({ error: error.message }, error.status);
        }

        return json(
          {
            error:
              "The visitor record could not be verified. Please try again.",
          },
          500,
        );
      }
    },
  };
}

export default withAuditContext(createReturningVerifyHandler());
