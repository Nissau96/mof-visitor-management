import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { withAuditContext } from "./_lib/auditContext.js";
import { json, methodNotAllowed } from "./_lib/http.js";
import { getAdminClient } from "./_lib/supabase.js";
import { formatDate } from "../src/lib/meetingSchedule.js";
import {
  NOTIFICATION_PURPOSES,
  createSupabaseRecorder,
  phoneLast4,
  sendSmsFallback,
} from "../src/server/notify.js";

// Delivery updates from messaging providers. Reached as
// /api/webhooks/whatsapp (rewritten to ?provider=whatsapp). There is no
// staff sign-in here: the provider's signature over the raw body is the
// only gate, so every POST is checked before anything is read.

const MAX_BODY_BYTES = 1_000_000;

function sameSecret(given, expected) {
  const a = Buffer.from(String(given || ""), "utf8");
  const b = Buffer.from(String(expected || ""), "utf8");

  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function verifyMetaSignature(rawBody, header, appSecret) {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(String(header || "").trim());

  if (!match || !appSecret) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(match[1], "hex");

  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Meta's subscription handshake: echo the challenge only for our token.
function verifySubscription(url, environment) {
  const params = url.searchParams;
  const token = String(environment.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "");

  const challenge = String(params.get("hub.challenge") || "");

  if (
    params.get("hub.mode") === "subscribe" &&
    token &&
    sameSecret(params.get("hub.verify_token"), token) &&
    /^[A-Za-z0-9_-]{1,200}$/.test(challenge)
  ) {
    return new Response(challenge, {
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      status: 200,
    });
  }

  return json({ error: "Verification failed." }, 403);
}

function readStatuses(payload) {
  const statuses = [];

  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      for (const status of Array.isArray(change?.value?.statuses) ? change.value.statuses : []) {
        if (typeof status?.id === "string" && typeof status?.status === "string") {
          statuses.push({
            error: status.errors?.[0]?.code ? `code_${status.errors[0].code}` : null,
            id: status.id.slice(0, 200),
            status: status.status.toLowerCase(),
          });
        }
      }
    }
  }

  return statuses;
}

// A booking confirmation WhatsApp reported as failed is re-sent by SMS.
// The text is rebuilt from the booking, never read from a log.
async function bookingFallback({ client, environment, logger, row, sendFallback }) {
  const { data: invite } = await client
    .from("visitor_invites")
    .select("phone, visit_date, host_name, reference_code")
    .eq("reference_code", row.referenceCode)
    .maybeSingle();

  if (!invite?.phone) {
    return;
  }

  const parameters = [formatDate(invite.visit_date), invite.host_name, invite.reference_code];

  await sendFallback({
    base: {
      meeting_id: null,
      phone_last4: phoneLast4(invite.phone),
      purpose: "booking_confirmation",
      reference_code: invite.reference_code,
    },
    environment,
    fallbackOf: row.id,
    logger,
    message: NOTIFICATION_PURPOSES.booking_confirmation.sms(parameters),
    phone: invite.phone,
    recorder: createSupabaseRecorder(() => client),
  });
}

async function handleWhatsappEvents(request, { environment, getAdminClientForRequest, logger, sendFallback }) {
  const declared = Number(request.headers.get("content-length") || 0);

  if (declared > MAX_BODY_BYTES) {
    return json({ error: "Request body is too large." }, 413);
  }

  const appSecret = String(environment.WHATSAPP_APP_SECRET || "");

  if (!appSecret) {
    return json({ error: "Webhook is not configured." }, 503);
  }

  const rawBody = await request.text();

  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: "Request body is too large." }, 413);
  }

  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return json({ error: "Invalid signature." }, 401);
  }

  let payload;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const client = getAdminClientForRequest();

  for (const status of readStatuses(payload)) {
    try {
      const { data: row, error } = await client.rpc("advance_notification_status", {
        p_error: status.error,
        p_provider: "meta",
        p_provider_message_id: status.id,
        p_status: status.status,
      });

      if (error) {
        logger.error(`[webhook:whatsapp] status update failed (${error.code || "unknown"}).`);
        continue;
      }

      if (
        row?.changed &&
        row.status === "failed" &&
        row.channel === "whatsapp" &&
        !row.hasFallback &&
        row.purpose === "booking_confirmation" &&
        row.referenceCode
      ) {
        await bookingFallback({ client, environment, logger, row, sendFallback });
      }
    } catch (error) {
      // Answer 200 anyway: Meta retries failed deliveries, and the
      // forward-only status rule makes a retry harmless.
      logger.error(`[webhook:whatsapp] ${error?.message || error}`);
    }
  }

  return json({ received: true });
}

export function createWebhooksHandler({
  environment = process.env,
  getAdminClientForRequest = getAdminClient,
  logger = console,
  sendFallback = sendSmsFallback,
} = {}) {
  return {
    async fetch(request) {
      const url = new URL(request.url);

      if (url.searchParams.get("provider") !== "whatsapp") {
        return json({ error: "Not found." }, 404);
      }

      if (request.method === "GET") {
        return verifySubscription(url, environment);
      }

      if (request.method !== "POST") {
        return methodNotAllowed(["GET", "POST"]);
      }

      return handleWhatsappEvents(request, {
        environment,
        getAdminClientForRequest,
        logger,
        sendFallback,
      });
    },
  };
}

export default withAuditContext(createWebhooksHandler());
