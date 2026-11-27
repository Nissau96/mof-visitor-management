import nodemailer from "nodemailer";
import { readSmtpConfiguration } from "./staffInvitation.js";

// "Send test email" for Super Administrators: sends one message to the
// signed-in administrator through the SMTP settings, and turns any
// failure into a plain explanation. The password is never included.

function explainFailure(error, smtp) {
  const code = String(error?.code || "");

  if (code === "EAUTH") {
    return "The mail server refused the sign-in. Check SMTP_USER and SMTP_PASSWORD, and ask IT whether SMTP AUTH is enabled for this mailbox.";
  }

  if (["ECONNECTION", "EDNS", "ESOCKET", "ETIMEDOUT"].includes(code)) {
    return `The mail server could not be reached at ${smtp.host}:${smtp.port}. Check SMTP_HOST and SMTP_PORT.`;
  }

  if (code === "EENVELOPE" || code === "EMESSAGE") {
    return `The mail server would not send as ${smtp.fromEmail}. Check SMTP_FROM_EMAIL, and that the account may send as that address.`;
  }

  return "The test email could not be sent. Check the email settings and try again.";
}

export async function sendTestEmail({
  createTransport = nodemailer.createTransport,
  to,
}) {
  let smtp;

  try {
    smtp = readSmtpConfiguration();
  } catch (error) {
    return {
      problem: `Email is not set up: ${error.message}`,
      sent: false,
    };
  }

  const transport = createTransport({
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

  try {
    await transport.sendMail({
      disableFileAccess: true,
      disableUrlAccess: true,
      from: { address: smtp.fromEmail, name: smtp.fromName },
      subject: "Test email from the visitor management system",
      text: [
        "This is a test email from the Ministry of Finance visitor management system.",
        "",
        "If you can read it, staff invitations, booking emails and WiFi details can be sent.",
        "",
        `Sent from ${smtp.fromName} <${smtp.fromEmail}> through ${smtp.host}:${smtp.port}.`,
      ].join("\n"),
      to,
    });

    return {
      from: `${smtp.fromName} <${smtp.fromEmail}>`,
      sent: true,
      to,
    };
  } catch (error) {
    return { problem: explainFailure(error, smtp), sent: false };
  } finally {
    transport.close();
  }
}
