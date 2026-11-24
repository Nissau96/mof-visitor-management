import process from "node:process";
import { resolveSmsProvider, sendSms } from "./smsSender.js";
import { WhatsappUnavailableError, resolveWhatsappProvider, sendWhatsappTemplate } from "./whatsappSender.js";

// Every visitor-facing WhatsApp or SMS message goes through notify():
// WhatsApp first, SMS when WhatsApp refuses or is not set up. Each
// attempt is recorded in notification_log without the message text.
// notify() never throws: a message problem must not undo a booking or a
// Wi-Fi grant.

// WhatsApp template name and the matching SMS text for each purpose.
// The parameters are the same, in the same order, for both. A purpose
// with no template goes by SMS only.
export const NOTIFICATION_PURPOSES = Object.freeze({
  booking_confirmation: {
    sms: ([date, host, code]) =>
      `Ministry of Finance: your visit on ${date} with ${host} is booked. Show code ${code} at reception.`,
    template: "visit_booked",
  },
  visit_reminder: {
    sms: ([date, time, code]) =>
      `Ministry of Finance: reminder of your visit tomorrow, ${date} at ${time}. Show code ${code} at reception.`,
    template: "visit_reminder",
  },
  // WhatsApp only, no SMS fallback: optional, and each SMS costs credit.
  // The button parameter is the feedback link token.
  visit_feedback: {
    sms: null,
    template: "visit_feedback",
  },
  // SMS only: WhatsApp refuses a password in a Utility template (it is
  // Authentication content), and the password never passes through Meta.
  wifi_details: {
    sms: ([network, password, until]) =>
      `Ministry of Finance guest Wi-Fi. SSID: ${network}. Credentials: ${password}. Valid until ${until}.`,
    template: null,
  },
});

export function phoneLast4(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-4);
}

// Short, text-free error for the log.
function errorCode(error) {
  if (error instanceof WhatsappUnavailableError) {
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

// Sends the SMS version, recorded as the fallback of `fallbackOf` when
// given. The row is written first: the unique fallback_of index lets
// only one caller claim the fallback, so a repeated webhook cannot send
// a second SMS.
export async function sendSmsFallback({
  base,
  environment = process.env,
  fallbackOf = null,
  logger = console,
  message,
  phone,
  recorder,
  sms = sendSms,
}) {
  let provider;

  try {
    provider = resolveSmsProvider(environment);
  } catch {
    return { channel: null, status: "failed" };
  }

  const rowId = await safely(logger, "record sms", () =>
    recorder.insert({ ...base, channel: "sms", fallback_of: fallbackOf, provider, status: "accepted" }),
  );

  if (fallbackOf && !rowId) {
    // Someone else already claimed this fallback, or the log is down.
    // Sending anyway could text the visitor twice.
    return { channel: null, status: "failed" };
  }

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

/**
 * notify({ purpose, phone, parameters, buttonParameters?, referenceCode?, meetingId? })
 * → { channel: "whatsapp" | "sms" | null, status: "accepted" | "failed" }
 */
export async function notify({
  buttonParameters = [],
  environment = process.env,
  logger = console,
  meetingId = null,
  parameters,
  phone,
  purpose,
  recorder = createSupabaseRecorder(),
  referenceCode = null,
  senders = { sms: sendSms, whatsapp: sendWhatsappTemplate },
}) {
  const definition = NOTIFICATION_PURPOSES[purpose];

  if (!definition || !phone) {
    return { channel: null, status: "failed" };
  }

  const base = {
    meeting_id: meetingId,
    phone_last4: phoneLast4(phone),
    purpose,
    reference_code: referenceCode,
  };
  let whatsappRowId;

  if (!definition.template) {
    return sendSmsFallback({
      base,
      environment,
      logger,
      message: definition.sms(parameters),
      phone,
      recorder,
      sms: senders.sms,
    });
  }

  try {
    const result = await senders.whatsapp({
      buttonParameters,
      environment,
      parameters,
      phone,
      template: definition.template,
    });

    await safely(logger, "record whatsapp", () =>
      recorder.insert({
        ...base,
        channel: "whatsapp",
        provider: result.provider,
        provider_message_id: result.providerMessageId,
        status: "accepted",
        template: definition.template,
      }),
    );

    return { channel: "whatsapp", status: "accepted" };
  } catch (error) {
    let provider = "meta";

    try {
      provider = resolveWhatsappProvider(environment);
    } catch {
      // Not configured: recorded against Meta, the intended provider.
    }

    whatsappRowId = await safely(logger, "record whatsapp failure", () =>
      recorder.insert({
        ...base,
        channel: "whatsapp",
        error: errorCode(error),
        provider,
        status: "failed",
        template: definition.template,
      }),
    );
  }

  if (!definition.sms) {
    return { channel: null, status: "failed" };
  }

  return sendSmsFallback({
    base,
    environment,
    fallbackOf: whatsappRowId,
    logger,
    message: definition.sms(parameters),
    phone,
    recorder,
    sms: senders.sms,
  });
}
