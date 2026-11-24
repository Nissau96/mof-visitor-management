import { createHash, randomBytes } from "node:crypto";
import process from "node:process";
import { notify } from "./notify.js";

// After reception checks a visitor out, WhatsApp them a link to rate the
// visit. The link carries a random token; only its SHA-256 hash is
// stored. Nothing here can fail the check-out.

export const FEEDBACK_LINK_DAYS = 7;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createFeedbackToken() {
  const token = randomBytes(32).toString("base64url");

  return { hash: hashFeedbackToken(token), token };
}

export function hashFeedbackToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

export function isFeedbackToken(value) {
  return TOKEN_PATTERN.test(String(value || ""));
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
      .select("phone")
      .eq("id", visit.visitor_id)
      .maybeSingle();

    if (!profile?.phone) {
      return { reason: "no_phone", sent: false };
    }

    const { hash, token } = createFeedbackToken();
    const expiresAt = new Date(now().getTime() + FEEDBACK_LINK_DAYS * 86_400_000);

    // One request per visit: a second check-out attempt finds the row.
    const { error } = await client.from("visit_feedback").insert({
      expires_at: expiresAt.toISOString(),
      token_hash: hash,
      visit_id: visitId,
    });

    if (error) {
      return { reason: error.code === "23505" ? "already_requested" : "not_saved", sent: false };
    }

    const code = visit.reference_code || reference;
    const result = await notifyVisitor({
      buttonParameters: [token],
      environment,
      logger,
      parameters: [code],
      phone: profile.phone,
      purpose: "visit_feedback",
      referenceCode: code,
    });

    return { sent: result?.status === "accepted" };
  } catch (error) {
    logger.error?.(`[feedback] request failed: ${error?.message || error}`);
    return { reason: "error", sent: false };
  }
}
