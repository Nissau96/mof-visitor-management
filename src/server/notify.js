import process from "node:process";
import { SmsUnavailableError, resolveSmsProvider, sendSms } from "./smsSender.js";

// Every visitor-facing text message goes through notify(), by SMS. Each
// message is recorded in notification_log without its text. notify()
// never throws: a message problem must not undo a booking, a check-in or
// a Wi-Fi grant.

// The SMS text for each purpose, built from its parameters in order.
export const NOTIFICATION_PURPOSES = Object.freeze({
  booking_confirmation: {
    sms: ([date, host, code]) =>
      `Ministry of Finance: your visit on ${date} with ${host} is booked. Show code ${code} at reception.`,
  },
  visit_reminder: {
    sms: ([date, time, code]) =>
      `Ministry of Finance: reminder of your visit tomorrow, ${date} at ${time}. Show code ${code} at reception.`,
  },
  // After first-visit registration or a returning check-in.
  registration_success: {
    sms: ([firstName, reference]) =>
      [
        `Welcome to the Ministry of Finance, ${firstName}.`,
        "",
        "Your visitor registration is successful.",
        "",
        `Visit Reference: ${reference}`,
        "",
        "Kindly proceed to the reception desk for assistance.",
      ].join("\n"),
  },
  // When reception admits the visitor with a card.
  card_issued: {
    sms: ([cardNumber, reference]) =>
      [
        "Ministry of Finance",
        "",
        `Visitor Card: ${cardNumber}`,
        `Visit Reference: ${reference}`,
        "",
        "Kindly keep your visitor card with you and return it to reception before leaving.",
      ].join("\n"),
  },
  // The short link (smsContext.shortUrl) hides the full site address.
  visit_feedback: {
    sms: ([firstName], context = {}) =>
      context.shortUrl
        ? [
            `Dear ${firstName},`,
            "",
            "Thank you for visiting the Ministry of Finance.",
            "",
            "We hope you had a pleasant experience. Kindly share your feedback to help us improve our services.",
            "",
            context.shortUrl,
          ].join("\n")
        : null,
  },
  wifi_details: {
    sms: ([network, password, expiryDate, expiryTime]) =>
      [
        "Welcome to the Ministry of Finance.",
        "",
        "Guest Wi-Fi Access",
        `Network: ${network}`,
        `Password: ${password}`,
        `Valid until: ${expiryDate}, ${expiryTime} GMT.`,
        "",
        "Enjoy your visit.",
      ].join("\n"),
  },
});

export function phoneLast4(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-4);
}

// Short, text-free error for the log.
function errorCode(error) {
  if (error instanceof SmsUnavailableError) {
    return "not_configured";
  }

  const code = String(error?.code || "").trim();

  return (code ? `code_${code}` : String(error?.name || "error")).slice(0, 60);
}

// Writes rows through the service-role client. Imported lazily so this
// module stays usable in tests without Supabase settings.
export function createSupabaseRecorder(getClient) {
  async function client() {
    if (getClient) {
      return getClient();
    }

    const { getAdminClient } = await import("../../api/_lib/supabase.js");

    return getAdminClient();
  }

  return {
    async insert(row) {
      const { data, error } = await (await client())
        .from("notification_log")
        .insert(row)
        .select("id")
        .single();

      if (error) {
        throw new Error(`notification_log insert failed (${error.code || "unknown"}).`);
      }

      return data.id;
    },

    async update(id, patch) {
      const { error } = await (await client())
        .from("notification_log")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        throw new Error(`notification_log update failed (${error.code || "unknown"}).`);
      }
    },
  };
}

async function safely(logger, label, work) {
  try {
    return await work();
  } catch (error) {
    logger.error?.(`[notify] ${label}: ${error?.message || error}`);
    return null;
  }
}

/**
 * notify({ purpose, phone, parameters, smsContext?, referenceCode?, meetingId? })
 * → { channel: "sms" | null, status: "accepted" | "failed" }
 */
export async function notify({
  environment = process.env,
  logger = console,
  meetingId = null,
  parameters,
  phone,
  purpose,
  recorder = createSupabaseRecorder(),
  referenceCode = null,
  sms = sendSms,
  smsContext = {},
}) {
  const definition = NOTIFICATION_PURPOSES[purpose];
  const message = definition ? definition.sms(parameters, smsContext) : null;

  if (!message || !phone) {
    return { channel: null, status: "failed" };
  }

  let provider;

  try {
    provider = resolveSmsProvider(environment);
  } catch {
    return { channel: null, status: "failed" };
  }

  const rowId = await safely(logger, "record sms", () =>
    recorder.insert({
      channel: "sms",
      meeting_id: meetingId,
      phone_last4: phoneLast4(phone),
      provider,
      purpose,
      reference_code: referenceCode,
      status: "accepted",
    }),
  );

  try {
    const result = await sms({ environment, message, phone });

    if (rowId && result?.providerMessageId) {
      await safely(logger, "update sms", () =>
        recorder.update(rowId, { provider_message_id: result.providerMessageId }),
      );
    }

    return { channel: "sms", status: "accepted" };
  } catch (error) {
    if (rowId) {
      await safely(logger, "update sms", () =>
        recorder.update(rowId, { error: errorCode(error), status: "failed" }),
      );
    }

    return { channel: null, status: "failed" };
  }
}
