import { Buffer } from "node:buffer";
import process from "node:process";

// Sends the returning-visitor code by SMS through Hubtel or Arkesel,
// chosen by SMS_PROVIDER. Outside Production, with no provider set, a
// development sender writes the code to the server log instead; it is
// never returned to the browser. Production without a provider cannot
// send codes, and the returning check-in says to ask reception.

export const DEFAULT_SMS_SENDER_ID = "MoF-Visitor";

const REQUEST_TIMEOUT_MS = 10_000;

export class SmsUnavailableError extends Error {
  constructor(message = "SMS sending is not configured.") {
    super(message);
    this.name = "SmsUnavailableError";
  }
}

export function createCodeMessage(code) {
  return `Your Ministry of Finance visitor code is ${code}. It expires in 5 minutes. Do not share this code.`;
}

// +233241112233 → 233241112233, the form both providers expect.
function toProviderNumber(phone) {
  return String(phone).replace(/^\+/, "");
}

function senderId(environment) {
  const value = String(environment.SMS_SENDER_ID || DEFAULT_SMS_SENDER_ID).trim();

  // Alphanumeric sender IDs are limited to 11 characters.
  if (!/^[A-Za-z0-9 -]{1,11}$/.test(value)) {
    throw new SmsUnavailableError("SMS_SENDER_ID must be 1 to 11 letters, digits, spaces or hyphens.");
  }

  return value;
}

function required(environment, name) {
  const value = String(environment[name] || "").trim();

  if (!value) {
    throw new SmsUnavailableError(`${name} is not set.`);
  }

  return value;
}

async function postJson(fetchImplementation, url, { body, headers }) {
  const response = await fetchImplementation(url, {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`SMS provider responded with ${response.status}.`);
  }

  return response.json().catch(() => ({}));
}

function idFrom(value) {
  const id = String(value ?? "").trim();

  return id ? id.slice(0, 200) : null;
}

const PROVIDERS = {
  // Arkesel SMS API v2: api-key header, recipients in 233… form.
  async arkesel({ environment, fetchImplementation, message, phone }) {
    const result = await postJson(
      fetchImplementation,
      "https://sms.arkesel.com/api/v2/sms/send",
      {
        body: {
          message,
          recipients: [toProviderNumber(phone)],
          sender: senderId(environment),
        },
        headers: { "api-key": required(environment, "ARKESEL_API_KEY") },
      },
    );

    if (result?.status && result.status !== "success") {
      throw new Error("Arkesel did not accept the message.");
    }

    return { providerMessageId: idFrom(result?.data?.[0]?.id) };
  },

  // Hubtel SMS "send message": Basic auth with the client ID and secret.
  async hubtel({ environment, fetchImplementation, message, phone }) {
    const credentials = Buffer.from(
      `${required(environment, "HUBTEL_CLIENT_ID")}:${required(environment, "HUBTEL_CLIENT_SECRET")}`,
      "utf8",
    ).toString("base64");

    const result = await postJson(fetchImplementation, "https://smsc.hubtel.com/v1/messages/send", {
      body: {
        Content: message,
        From: senderId(environment),
        To: toProviderNumber(phone),
      },
      headers: { Authorization: `Basic ${credentials}` },
    });

    return { providerMessageId: idFrom(result?.messageId) };
  },
};

export function resolveSmsProvider(environment = process.env) {
  const provider = String(environment.SMS_PROVIDER || "").trim().toLowerCase();

  if (provider) {
    if (!PROVIDERS[provider]) {
      throw new SmsUnavailableError("SMS_PROVIDER must be hubtel or arkesel.");
    }

    return provider;
  }

  if (environment.VERCEL_ENV === "production") {
    throw new SmsUnavailableError();
  }

  return "log";
}

// Any text message. Outside Production with no provider, it is
// written to the server log instead. Resolves to { provider,
// providerMessageId } so the caller can record the message.
export async function sendSms({
  environment = process.env,
  fetchImplementation = fetch,
  logger = console,
  message,
  phone,
}) {
  const provider = resolveSmsProvider(environment);

  if (provider === "log") {
    logger.info(`[sms:development] To ${phone}: ${message}`);
    return { provider, providerMessageId: null };
  }

  const { providerMessageId } = await PROVIDERS[provider]({
    environment,
    fetchImplementation,
    message,
    phone,
  });

  return { provider, providerMessageId };
}

export function sendVisitorCodeSms({ code, ...options }) {
  return sendSms({ ...options, message: createCodeMessage(code) });
}
