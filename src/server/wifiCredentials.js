import { Buffer } from "node:buffer";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import process from "node:process";
import nodemailer from "nodemailer";
import { resolveSmsProvider, sendSms } from "./smsSender.js";
import { escapeHtml, readSmtpConfiguration } from "./staffInvitation.js";

// Guest Wi-Fi credentials. IT creates the password in the Wi-Fi system
// and pastes it here; it is encrypted (AES-256-GCM) before it reaches
// the database and kept only until it expires.

export const DEFAULT_WIFI_NETWORK_NAME = "MoF-Guest";

// Each tower has its own guest network. Tower 1's is "PEACE - HUB -
// Guest"; either can be overridden per tower, and WIFI_NETWORK_NAME is
// the fallback for a tower without its own name.
const TOWER_NETWORK_DEFAULTS = Object.freeze({
  tower_1: "PEACE - HUB - Guest",
});

const TOWER_NETWORK_SETTINGS = Object.freeze({
  tower_1: "WIFI_NETWORK_NAME_TOWER_1",
  tower_2: "WIFI_NETWORK_NAME_TOWER_2",
});

const CIPHER_VERSION = "v1";

function encryptionKey(environment) {
  const secret = String(environment.WIFI_PASSWORD_SECRET || "");

  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("WIFI_PASSWORD_SECRET must contain at least 32 bytes.");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptWifiPassword(password, environment = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(environment), iv);
  const data = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);

  return [
    CIPHER_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}

export function decryptWifiPassword(value, environment = process.env) {
  const [version, iv, tag, data] = String(value || "").split(".");

  if (version !== CIPHER_VERSION || !iv || !tag || !data) {
    throw new Error("The stored Wi-Fi password is unreadable.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(environment),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function getWifiNetworkName(environment = process.env, tower = "") {
  const towerSetting = TOWER_NETWORK_SETTINGS[tower];

  return (
    String((towerSetting && environment[towerSetting]) || "").trim() ||
    TOWER_NETWORK_DEFAULTS[tower] ||
    String(environment.WIFI_NETWORK_NAME || "").trim() ||
    DEFAULT_WIFI_NETWORK_NAME
  );
}

export function isSmsAvailable(environment = process.env) {
  try {
    resolveSmsProvider(environment);
    return true;
  } catch {
    return false;
  }
}

export function isEmailAvailable() {
  try {
    readSmtpConfiguration();
    return true;
  } catch {
    return false;
  }
}

// What the Wi-Fi page needs to know about sending.
export function getWifiSettings(environment = process.env) {
  return {
    emailAvailable: isEmailAvailable(),
    networkNames: {
      tower_1: getWifiNetworkName(environment, "tower_1"),
      tower_2: getWifiNetworkName(environment, "tower_2"),
    },
    smsAvailable: isSmsAvailable(environment),
  };
}

const expiryFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "Africa/Accra",
});

export function formatWifiExpiry(expiresAt) {
  return `${expiryFormat.format(new Date(expiresAt))} (Accra time)`;
}

export function createWifiMessages({ expiresAt, networkName, password }) {
  const until = formatWifiExpiry(expiresAt);
  const sms = `Ministry of Finance guest Wi-Fi. Network: ${networkName}. Password: ${password}. Valid until ${until}.`;
  const text = [
    "Your guest Wi-Fi access at the Ministry of Finance",
    "",
    `Network: ${networkName}`,
    `Password: ${password}`,
    `Valid until: ${until}`,
    "",
    "Please do not share this password.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px">
          <tr><td style="padding:24px">
            <p style="margin:0;font-size:12px;font-weight:700;color:#0f766e">MINISTRY OF FINANCE</p>
            <h1 style="margin:8px 0 0;font-size:22px">Your guest Wi-Fi access</h1>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:15px">
              <tr><td style="padding:6px 16px 6px 0;color:#475569">Network</td><td style="font-weight:700">${escapeHtml(networkName)}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#475569">Password</td><td style="font-weight:700;font-family:Consolas,monospace;font-size:17px">${escapeHtml(password)}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#475569">Valid until</td><td style="font-weight:700">${escapeHtml(until)}</td></tr>
            </table>
            <p style="margin:20px 0 0;font-size:14px;color:#475569">Please do not share this password.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    html,
    sms,
    subject: "Your Ministry of Finance guest Wi-Fi",
    text,
  };
}

async function sendEmails(recipients, messages) {
  const smtp = readSmtpConfiguration();
  const transport = nodemailer.createTransport({
    auth: { pass: smtp.password, user: smtp.user },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    host: smtp.host,
    port: smtp.port,
    requireTLS: !smtp.secure,
    secure: smtp.secure,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2" },
  });

  let sent = 0;

  try {
    for (const recipient of recipients) {
      await transport.sendMail({
        disableFileAccess: true,
        disableUrlAccess: true,
        from: { address: smtp.fromEmail, name: smtp.fromName },
        html: messages.html,
        subject: messages.subject,
        text: messages.text,
        to: recipient.email,
      });
      sent += 1;
    }
  } finally {
    transport.close();
  }

  return sent;
}

// Sends by the chosen channels ("sms", "email"). Returns the channels
// that reached at least one person, and a note for any that failed.
export async function deliverWifiCredentials({
  channels,
  environment = process.env,
  expiresAt,
  password,
  recipients,
  send = { email: sendEmails, sms: sendSms },
  tower = "",
}) {
  const messages = createWifiMessages({
    expiresAt,
    networkName: getWifiNetworkName(environment, tower),
    password,
  });
  const delivered = [];
  const problems = [];

  if (channels.includes("sms")) {
    const withPhone = recipients.filter((recipient) => recipient.phone);
    let sent = 0;

    for (const recipient of withPhone) {
      try {
        await send.sms({ environment, message: messages.sms, phone: recipient.phone });
        sent += 1;
      } catch {
        // Counted below.
      }
    }

    if (sent > 0) {
      delivered.push("sms");
    }

    if (sent < withPhone.length || withPhone.length === 0) {
      problems.push(
        withPhone.length === 0
          ? "No one has a mobile number for SMS."
          : `The SMS could not be sent to ${withPhone.length - sent} of ${withPhone.length}.`,
      );
    }
  }

  if (channels.includes("email")) {
    const withEmail = recipients.filter((recipient) => recipient.email);

    if (withEmail.length === 0) {
      problems.push("No one has an email address.");
    } else {
      try {
        if ((await send.email(withEmail, messages)) > 0) {
          delivered.push("email");
        }
      } catch {
        problems.push("The email could not be sent.");
      }
    }
  }

  return { delivered, problems };
}
