import process from "node:process";
import { notify } from "./notify.js";

// SMS sent to a visitor at registration and when reception issues a
// visitor card. Neither can fail the registration or the admission.

// A missing name reads "Visitor" rather than leaving a gap.
export function firstNameOf(fullName, fallback = "Visitor") {
  return String(fullName || "").trim().split(/\s+/)[0] || fallback;
}

async function readVisitor(client, visitorId) {
  const { data } = await client
    .from("visitor_profiles")
    .select("phone, full_name")
    .eq("id", visitorId)
    .maybeSingle();

  return data || null;
}

async function send(logger, label, run) {
  try {
    const result = await run();

    return { sent: result?.status === "accepted" };
  } catch (error) {
    logger.error?.(`[visitor-sms] ${label} failed: ${error?.message || error}`);
    return { sent: false };
  }
}

/**
 * Registration SMS. Pass fullName and phone when the caller has them
 * (first visit); otherwise client and visitorId (returning visit).
 */
export function sendRegistrationSms({
  client,
  environment = process.env,
  fullName,
  logger = console,
  notifyVisitor = notify,
  phone,
  reference,
  visitorId,
}) {
  return send(logger, "registration", async () => {
    const visitor = phone ? { full_name: fullName, phone } : await readVisitor(client, visitorId);

    if (!visitor?.phone) {
      return null;
    }

    return notifyVisitor({
      environment,
      logger,
      parameters: [firstNameOf(visitor.full_name), reference],
      phone: visitor.phone,
      purpose: "registration_success",
      referenceCode: reference,
    });
  });
}

export function sendCardIssuedSms({
  cardNumber,
  client,
  environment = process.env,
  logger = console,
  notifyVisitor = notify,
  reference,
  visitorId,
}) {
  return send(logger, "card issued", async () => {
    const visitor = await readVisitor(client, visitorId);

    if (!visitor?.phone || !cardNumber) {
      return null;
    }

    return notifyVisitor({
      environment,
      logger,
      parameters: [cardNumber, reference],
      phone: visitor.phone,
      purpose: "card_issued",
      referenceCode: reference,
    });
  });
}
