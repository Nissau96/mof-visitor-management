import process from "node:process";

// Sends approved WhatsApp templates through Meta's Cloud API, chosen by
// WHATSAPP_PROVIDER. Outside Production with no provider, the template
// is written to the server log instead. Production without a provider
// cannot send, and notify() falls back to SMS.

export const WHATSAPP_LANGUAGE = "en_US";
export const DEFAULT_WHATSAPP_GRAPH_VERSION = "25.0";

const REQUEST_TIMEOUT_MS = 10_000;

export class WhatsappUnavailableError extends Error {
  constructor(message = "WhatsApp sending is not configured.") {
    super(message);
    this.name = "WhatsappUnavailableError";
  }
}

// The provider refused the message. `code` is the provider's error code,
// kept for the delivery log; it never contains the message text.
export class WhatsappSendError extends Error {
  constructor(message, code = "") {
    super(message);
    this.name = "WhatsappSendError";
    this.code = String(code || "");
  }
}

function required(environment, name) {
  const value = String(environment[name] || "").trim();

  if (!value) {
    throw new WhatsappUnavailableError(`${name} is not set.`);
  }

  return value;
}

function graphVersion(environment) {
  const value = String(
    environment.WHATSAPP_GRAPH_VERSION || DEFAULT_WHATSAPP_GRAPH_VERSION,
  )
    .trim()
    .replace(/^v/i, "");

  if (!/^\d{1,3}\.\d{1,2}$/.test(value)) {
    throw new WhatsappUnavailableError("WHATSAPP_GRAPH_VERSION must look like 25.0.");
  }

  return value;
}

// +233241112233 → 233241112233
function toProviderNumber(phone) {
  return String(phone).replace(/^\+/, "");
}

const PROVIDERS = {
  async meta({ buttonParameters, environment, fetchImplementation, parameters, phone, template }) {
    const phoneNumberId = required(environment, "WHATSAPP_PHONE_NUMBER_ID");

    if (!/^\d{5,30}$/.test(phoneNumberId)) {
      throw new WhatsappUnavailableError("WHATSAPP_PHONE_NUMBER_ID must be digits.");
    }

    const response = await fetchImplementation(
      `https://graph.facebook.com/v${graphVersion(environment)}/${phoneNumberId}/messages`,
      {
        body: JSON.stringify({
          messaging_product: "whatsapp",
          template: {
            components: [
              // A template without body values (such as hello_world) takes no body component.
              ...(parameters.length
                ? [
                    {
                      parameters: parameters.map((text) => ({ text: String(text), type: "text" })),
                      type: "body",
                    },
                  ]
                : []),
              // Fills the {{1}} at the end of each URL button, in order.
              ...buttonParameters.map((text, index) => ({
                index: String(index),
                parameters: [{ text: String(text), type: "text" }],
                sub_type: "url",
                type: "button",
              })),
            ],
            language: { code: WHATSAPP_LANGUAGE },
            name: template,
          },
          to: toProviderNumber(phone),
          type: "template",
        }),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${required(environment, "WHATSAPP_ACCESS_TOKEN")}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const code = result?.error?.code || response.status;

      if (response.status === 401 || code === 190) {
        throw new WhatsappUnavailableError("The WhatsApp access token was refused.");
      }

      throw new WhatsappSendError(`WhatsApp refused the message (${code}).`, code);
    }

    const providerMessageId = String(result?.messages?.[0]?.id || "").trim();

    if (!providerMessageId) {
      throw new WhatsappSendError("WhatsApp did not return a message id.");
    }

    return { providerMessageId: providerMessageId.slice(0, 200) };
  },
};

export function resolveWhatsappProvider(environment = process.env) {
  const provider = String(environment.WHATSAPP_PROVIDER || "").trim().toLowerCase();

  if (provider) {
    if (!PROVIDERS[provider]) {
      throw new WhatsappUnavailableError("WHATSAPP_PROVIDER must be meta.");
    }

    return provider;
  }

  if (environment.VERCEL_ENV === "production") {
    throw new WhatsappUnavailableError();
  }

  return "log";
}

export function isWhatsappAvailable(environment = process.env) {
  try {
    resolveWhatsappProvider(environment);
    return true;
  } catch {
    return false;
  }
}

// Resolves to { provider, providerMessageId }. Throws
// WhatsappUnavailableError or WhatsappSendError when it cannot send.
export async function sendWhatsappTemplate({
  buttonParameters = [],
  environment = process.env,
  fetchImplementation = fetch,
  logger = console,
  parameters = [],
  phone,
  template,
}) {
  const provider = resolveWhatsappProvider(environment);

  if (provider === "log") {
    logger.info(`[whatsapp:development] To ${phone} template ${template}: ${parameters.join(" | ")}`);
    return { provider, providerMessageId: null };
  }

  const { providerMessageId } = await PROVIDERS[provider]({
    buttonParameters,
    environment,
    fetchImplementation,
    parameters,
    phone,
    template,
  });

  return { provider, providerMessageId };
}
