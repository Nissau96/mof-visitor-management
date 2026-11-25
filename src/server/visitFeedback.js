import { createHash, randomBytes } from "node:crypto";
import process from "node:process";
import { notify } from "./notify.js";
import { firstNameOf } from "./visitorMessages.js";

// After reception checks a visitor out, text them a short link to rate
// the visit. Each request also gets a random token whose SHA-256 hash is
// the key submit_visit_feedback uses; the token itself is never stored
// or sent. Nothing here can fail the check-out.

export const FEEDBACK_LINK_DAYS = 7;

// Base of the short SMS link: <base>/f/<code>. A short address keeps the
// full site address out of the message; the Ministry's own short domain
// replaces it later through FEEDBACK_SHORT_LINK_BASE.
export const DEFAULT_FEEDBACK_SHORT_LINK_BASE = "https://mofv.vercel.app";

// No 0, O, 1, I or l: codes are read off a phone screen.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const CODE_PATTERN = /^[A-HJ-NP-Za-km-z2-9]{8}$/;

export function createFeedbackCode() {
  let code = "";

  // 228 = 4 x 57 (the alphabet size): rejecting bytes above it keeps
  // every character equally likely.
  while (code.length < 8) {
    for (const byte of randomBytes(16)) {
      if (code.length < 8 && byte < 228) {
        code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      }
    }
  }

  return code;
}

export function isFeedbackCode(value) {
  return CODE_PATTERN.test(String(value || ""));
}

export function feedbackShortUrl(code, environment = process.env) {
  const base = String(environment.FEEDBACK_SHORT_LINK_BASE || DEFAULT_FEEDBACK_SHORT_LINK_BASE)
    .trim()
    .replace(/\/+$/, "");

  return `${base}/f/${code}`;
}

export function createFeedbackToken() {
  const token = randomBytes(32).toString("base64url");

  return { hash: hashFeedbackToken(token), token };
}

export function hashFeedbackToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

/**
 * Creates the feedback link for a checked-out visit and sends it.
 * Resolves to { sent: boolean, reason? }.
 */
export async function requestVisitFeedback({
  client,
  environment = process.env,
  logger = console,
  now = () => new Date(),
  notifyVisitor = notify,
  reference,
  visitId,
}) {
  try {
    const { data: visit } = await client
      .from("visits")
      .select("id, visitor_id, reference_code")
      .eq("id", visitId)
      .maybeSingle();

    if (!visit?.visitor_id) {
      return { reason: "no_visit", sent: false };
    }

    const { data: profile } = await client
      .from("visitor_profiles")
      .select("phone, full_name")
      .eq("id", visit.visitor_id)
      .maybeSingle();

    if (!profile?.phone) {
      return { reason: "no_phone", sent: false };
    }

    const { hash } = createFeedbackToken();
    const expiresAt = new Date(now().getTime() + FEEDBACK_LINK_DAYS * 86_400_000);
    let code = "";

    // One request per visit: a second check-out attempt finds the row. A
    // clash on the short code (very unlikely) is retried with a new one.
    for (let attempt = 0; attempt < 3 && !code; attempt += 1) {
      const candidate = createFeedbackCode();
      const { error } = await client.from("visit_feedback").insert({
        expires_at: expiresAt.toISOString(),
        short_code: candidate,
        token_hash: hash,
        visit_id: visitId,
      });

      if (!error) {
        code = candidate;
      } else if (error.code !== "23505" || !/short_code/.test(String(error.message || ""))) {
        return { reason: error.code === "23505" ? "already_requested" : "not_saved", sent: false };
      }
    }

    if (!code) {
      return { reason: "not_saved", sent: false };
    }

    const visitReference = visit.reference_code || reference;
    const result = await notifyVisitor({
      environment,
      logger,
      parameters: [firstNameOf(profile.full_name, "visitor")],
      phone: profile.phone,
      purpose: "visit_feedback",
      referenceCode: visitReference,
      smsContext: { shortUrl: feedbackShortUrl(code, environment) },
    });

    return { sent: result?.status === "accepted" };
  } catch (error) {
    logger.error?.(`[feedback] request failed: ${error?.message || error}`);
    return { reason: "error", sent: false };
  }
}
