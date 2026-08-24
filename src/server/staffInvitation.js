import {
  randomInt,
} from "node:crypto";
import process from "node:process";
import nodemailer from "nodemailer";

export const TEMPORARY_PASSWORD_LENGTH = 20;

export const TEMPORARY_PASSWORD_TTL_MS =
  24 * 60 * 60 * 1_000;

const UPPERCASE_CHARACTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ";

const LOWERCASE_CHARACTERS =
  "abcdefghijkmnopqrstuvwxyz";

const NUMBER_CHARACTERS =
  "23456789";

const SYMBOL_CHARACTERS =
  "!@#$%&*+-=?";

const CHARACTER_GROUPS = [
  UPPERCASE_CHARACTERS,
  LOWERCASE_CHARACTERS,
  NUMBER_CHARACTERS,
  SYMBOL_CHARACTERS,
];

const ALL_PASSWORD_CHARACTERS =
  CHARACTER_GROUPS.join("");

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STAFF_ROLES = new Set([
  "receptionist",
  "admin",
]);

function selectRandomCharacter(
  characters,
) {
  return characters[
    randomInt(characters.length)
  ];
}

function shuffleCharacters(characters) {
  for (
    let index = characters.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex =
      randomInt(index + 1);

    [
      characters[index],
      characters[randomIndex],
    ] = [
      characters[randomIndex],
      characters[index],
    ];
  }

  return characters;
}

export function createTemporaryPassword() {
  const characters =
    CHARACTER_GROUPS.map(
      selectRandomCharacter,
    );

  while (
    characters.length <
    TEMPORARY_PASSWORD_LENGTH
  ) {
    characters.push(
      selectRandomCharacter(
        ALL_PASSWORD_CHARACTERS,
      ),
    );
  }

  return shuffleCharacters(
    characters,
  ).join("");
}

export function createTemporaryPasswordExpiry(
  now = new Date(),
) {
  if (
    !(now instanceof Date) ||
    Number.isNaN(now.getTime())
  ) {
    throw new TypeError(
      "A valid current date is required.",
    );
  }

  return new Date(
    now.getTime() +
      TEMPORARY_PASSWORD_TTL_MS,
  );
}

function readRequiredEnvironmentVariable(
  name,
) {
  const value = String(
    process.env[name] || "",
  ).trim();

  if (!value) {
    throw new Error(
      `${name} is not configured.`,
    );
  }

  return value;
}

export function getStaffLoginUrl() {
  const configuredUrl =
    readRequiredEnvironmentVariable(
      "STAFF_LOGIN_URL",
    );

  let loginUrl;

  try {
    loginUrl = new URL(configuredUrl);
  } catch {
    throw new Error(
      "STAFF_LOGIN_URL must be a valid absolute URL.",
    );
  }

  const localDevelopment =
    loginUrl.protocol === "http:" &&
    (
      loginUrl.hostname ===
        "localhost" ||
      loginUrl.hostname ===
        "127.0.0.1"
    );

  if (
    (
      loginUrl.protocol !== "https:" &&
      !localDevelopment
    ) ||
    loginUrl.username ||
    loginUrl.password ||
    loginUrl.search ||
    loginUrl.hash ||
    loginUrl.pathname !==
      "/staff/login"
  ) {
    throw new Error(
      "STAFF_LOGIN_URL must be a secure staff sign-in URL.",
    );
  }

  return loginUrl.toString();
}

function readSmtpConfiguration() {
  const host =
    readRequiredEnvironmentVariable(
      "SMTP_HOST",
    );

  const portValue =
    readRequiredEnvironmentVariable(
      "SMTP_PORT",
    );

  if (!/^\d{2,5}$/.test(portValue)) {
    throw new Error(
      "SMTP_PORT must be a valid port number.",
    );
  }

  const port = Number(portValue);

  if (
    port !== 465 &&
    port !== 587
  ) {
    throw new Error(
      "SMTP_PORT must be 465 or 587.",
    );
  }

  const secureValue =
    readRequiredEnvironmentVariable(
      "SMTP_SECURE",
    ).toLowerCase();

  if (
    secureValue !== "true" &&
    secureValue !== "false"
  ) {
    throw new Error(
      "SMTP_SECURE must be true or false.",
    );
  }

  const secure =
    secureValue === "true";

  if (
    (port === 465 && !secure) ||
    (port === 587 && secure)
  ) {
    throw new Error(
      "SMTP_SECURE does not match the configured SMTP port.",
    );
  }

  const user =
    readRequiredEnvironmentVariable(
      "SMTP_USER",
    );

  const password =
    readRequiredEnvironmentVariable(
      "SMTP_PASSWORD",
    );

  const fromEmail =
    readRequiredEnvironmentVariable(
      "SMTP_FROM_EMAIL",
    ).toLowerCase();

  if (
    !EMAIL_PATTERN.test(fromEmail)
  ) {
    throw new Error(
      "SMTP_FROM_EMAIL must be a valid email address.",
    );
  }

  const fromName =
    readRequiredEnvironmentVariable(
      "SMTP_FROM_NAME",
    );

  return {
    fromEmail,
    fromName,
    host,
    password,
    port,
    secure,
    user,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatExpiry(expiry) {
  const expiryDate =
    expiry instanceof Date
      ? expiry
      : new Date(expiry);

  if (
    Number.isNaN(
      expiryDate.getTime(),
    )
  ) {
    throw new TypeError(
      "A valid temporary-password expiry is required.",
    );
  }

  const formatted =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Africa/Accra",
      },
    ).format(expiryDate);

  return `${formatted} GMT`;
}

function getRoleLabel(role) {
  if (role === "admin") {
    return "Administrator";
  }

  if (role === "receptionist") {
    return "Receptionist";
  }

  throw new TypeError(
    "A valid staff role is required.",
  );
}

function validateInvitationDetails({
  email,
  fullName,
  role,
  temporaryPassword,
}) {
  if (
    typeof fullName !== "string" ||
    fullName.trim().length < 2
  ) {
    throw new TypeError(
      "A valid staff name is required.",
    );
  }

  if (
    typeof email !== "string" ||
    !EMAIL_PATTERN.test(
      email.trim(),
    )
  ) {
    throw new TypeError(
      "A valid staff email address is required.",
    );
  }

  if (!STAFF_ROLES.has(role)) {
    throw new TypeError(
      "A valid staff role is required.",
    );
  }

  if (
    typeof temporaryPassword !==
      "string" ||
    temporaryPassword.length <
      TEMPORARY_PASSWORD_LENGTH
  ) {
    throw new TypeError(
      "A valid temporary password is required.",
    );
  }
}

export function createStaffInvitationMessage({
  email,
  expiresAt,
  fullName,
  loginUrl,
  role,
  temporaryPassword,
}) {
  validateInvitationDetails({
    email,
    fullName,
    role,
    temporaryPassword,
  });

  let parsedLoginUrl;

  try {
    parsedLoginUrl =
      new URL(loginUrl);
  } catch {
    throw new TypeError(
      "A valid staff login URL is required.",
    );
  }

  const normalizedName =
    fullName.trim();

  const normalizedEmail =
    email.trim().toLowerCase();

  const roleLabel =
    getRoleLabel(role);

  const expiryLabel =
    formatExpiry(expiresAt);

  const towerText =
    role === "receptionist"
      ? "\nAssigned Tower: Select your working tower when signing in."
      : "";

  const towerHtml =
    role === "receptionist"
      ? `
        <tr>
          <td style="padding: 7px 0; color: #475569; font-size: 14px; vertical-align: top;">
            Assigned Tower
          </td>
          <td style="padding: 7px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right; vertical-align: top;">
            Select at sign-in
          </td>
        </tr>`
      : "";

  const subject =
    "Your MoF Visitor Management staff account is ready";

  const text = `Hello ${normalizedName},

Your staff account for the Ministry of Finance Visitor Management system has been created.

Your account details

Full name: ${normalizedName}
Email address: ${normalizedEmail}
Role: ${roleLabel}${towerText}

Temporary sign-in details

Temporary password: ${temporaryPassword}
Password expires: ${expiryLabel}

Sign in and create your password:
${parsedLoginUrl.toString()}

How to activate your account

1. Open the staff sign-in page using the link above.
2. Select your Assigned Tower if you are signing in as a receptionist.
3. Enter your email address and temporary password.
4. Create your own password when prompted.
5. Sign in again using your new password.

Security notice

This temporary password is unique to your account and expires after 24 hours. Do not forward this email or share the password with anyone.

If the password expires before you complete your account setup, contact the Visitor Management administrator for assistance.

If you were not expecting this account, do not attempt to sign in. Please report this email to the Visitor Management administrator.

Kind regards,

MoF Visitor Management
Ministry of Finance`;

  const safeName =
    escapeHtml(normalizedName);

  const safeEmail =
    escapeHtml(normalizedEmail);

  const safeRole =
    escapeHtml(roleLabel);

  const safePassword =
    escapeHtml(temporaryPassword);

  const safeExpiry =
    escapeHtml(expiryLabel);

  const safeLoginUrl =
    escapeHtml(
      parsedLoginUrl.toString(),
    );

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f1f5f9; color: #0f172a; font-family: Arial, Helvetica, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
      Your staff account has been created. Replace your temporary password within 24 hours.
    </div>

    <table role="presentation" style="width: 100%; border-collapse: collapse; background: #f1f5f9;">
      <tr>
        <td style="padding: 32px 16px;">
          <table role="presentation" style="width: 100%; max-width: 640px; margin: 0 auto; border-collapse: collapse; overflow: hidden; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px;">
            <tr>
              <td style="height: 7px; background: #d4a017;"></td>
            </tr>

            <tr>
              <td style="padding: 32px 32px 20px;">
                <p style="margin: 0; color: #166534; font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">
                  Ministry of Finance
                </p>

                <h1 style="margin: 12px 0 0; color: #0f172a; font-size: 28px; line-height: 1.25;">
                  Your staff account is ready
                </h1>

                <p style="margin: 20px 0 0; color: #334155; font-size: 16px; line-height: 1.7;">
                  Hello ${safeName},
                </p>

                <p style="margin: 12px 0 0; color: #475569; font-size: 16px; line-height: 1.7;">
                  Your staff account for the Ministry of Finance Visitor Management system has been created.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding: 0 32px 24px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 14px;">
                  <tr>
                    <td style="padding: 20px;">
                      <h2 style="margin: 0 0 10px; color: #0f172a; font-size: 17px;">
                        Your account details
                      </h2>

                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="padding: 7px 0; color: #475569; font-size: 14px;">
                            Full name
                          </td>
                          <td style="padding: 7px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right;">
                            ${safeName}
                          </td>
                        </tr>

                        <tr>
                          <td style="padding: 7px 0; color: #475569; font-size: 14px;">
                            Email address
                          </td>
                          <td style="padding: 7px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right;">
                            ${safeEmail}
                          </td>
                        </tr>

                        <tr>
                          <td style="padding: 7px 0; color: #475569; font-size: 14px;">
                            Role
                          </td>
                          <td style="padding: 7px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right;">
                            ${safeRole}
                          </td>
                        </tr>
                        ${towerHtml}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding: 0 32px 24px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 14px;">
                  <tr>
                    <td style="padding: 20px;">
                      <h2 style="margin: 0; color: #9a3412; font-size: 17px;">
                        Temporary sign-in details
                      </h2>

                      <p style="margin: 16px 0 6px; color: #7c2d12; font-size: 13px; font-weight: 700;">
                        Temporary password
                      </p>

                      <p style="margin: 0; padding: 14px; background: #ffffff; border: 1px dashed #fb923c; border-radius: 10px; color: #0f172a; font-family: Consolas, Monaco, monospace; font-size: 19px; font-weight: 800; letter-spacing: 1px; overflow-wrap: anywhere;">
                        ${safePassword}
                      </p>

                      <p style="margin: 12px 0 0; color: #9a3412; font-size: 13px; line-height: 1.6;">
                        This password expires on <strong>${safeExpiry}</strong>.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding: 0 32px 24px; text-align: center;">
                <a href="${safeLoginUrl}" style="display: inline-block; padding: 14px 24px; background: #166534; border-radius: 10px; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none;">
                  Sign in and create your password
                </a>

                <p style="margin: 14px 0 0; color: #64748b; font-size: 12px; line-height: 1.6;">
                  If the button does not work, copy and paste this address into your browser:<br>
                  <a href="${safeLoginUrl}" style="color: #166534; overflow-wrap: anywhere;">${safeLoginUrl}</a>
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding: 0 32px 24px;">
                <h2 style="margin: 0; color: #0f172a; font-size: 17px;">
                  How to activate your account
                </h2>

                <ol style="margin: 14px 0 0; padding-left: 22px; color: #475569; font-size: 14px; line-height: 1.8;">
                  <li>Open the staff sign-in page.</li>
                  <li>Select your Assigned Tower if you are signing in as a receptionist.</li>
                  <li>Enter your email address and temporary password.</li>
                  <li>Create your own password when prompted.</li>
                  <li>Sign in again using your new password.</li>
                </ol>
              </td>
            </tr>

            <tr>
              <td style="padding: 0 32px 32px;">
                <div style="padding: 18px; background: #fef2f2; border-left: 4px solid #b91c1c; border-radius: 8px;">
                  <h2 style="margin: 0; color: #991b1b; font-size: 15px;">
                    Security notice
                  </h2>

                  <p style="margin: 8px 0 0; color: #7f1d1d; font-size: 13px; line-height: 1.7;">
                    This temporary password is unique to your account and expires after 24 hours. Do not forward this email or share the password with anyone.
                  </p>
                </div>

                <p style="margin: 22px 0 0; color: #475569; font-size: 14px; line-height: 1.7;">
                  If the password expires before you complete setup, contact the Visitor Management administrator.
                </p>

                <p style="margin: 18px 0 0; color: #475569; font-size: 14px; line-height: 1.7;">
                  Kind regards,<br>
                  <strong>MoF Visitor Management</strong><br>
                  Ministry of Finance
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding: 18px 32px; background: #0f3d2e; color: #d1fae5; font-size: 12px; line-height: 1.6; text-align: center;">
                This is an automated account-security message. Please do not reply.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    html,
    subject,
    text,
  };
}

export async function sendStaffInvitationEmail({
  email,
  expiresAt,
  fullName,
  role,
  temporaryPassword,
}) {
  const smtp =
    readSmtpConfiguration();

  const loginUrl =
    getStaffLoginUrl();

  const message =
    createStaffInvitationMessage({
      email,
      expiresAt,
      fullName,
      loginUrl,
      role,
      temporaryPassword,
    });

  const transport =
    nodemailer.createTransport({
      auth: {
        pass: smtp.password,
        user: smtp.user,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      host: smtp.host,
      port: smtp.port,
      requireTLS: !smtp.secure,
      secure: smtp.secure,
      socketTimeout: 20_000,
      tls: {
        minVersion: "TLSv1.2",
      },
    });

  try {
    await transport.sendMail({
      disableFileAccess: true,
      disableUrlAccess: true,
      from: {
        address: smtp.fromEmail,
        name: smtp.fromName,
      },
      html: message.html,
      subject: message.subject,
      text: message.text,
      to: email.trim().toLowerCase(),
    });
  } finally {
    transport.close();
  }
}