/**
 * Email service for verification and password reset. Uses SMTP from config.
 */

import nodemailer from "nodemailer";
import { config } from "../../../config/index.js";

let warnedMissingSmtpAuth = false;

function getTransporter(): nodemailer.Transporter | null {
  const { host, port, secure, user, pass } = config.smtp;
  if (!host) return null;
  const hasAuth = Boolean(user && pass);
  if (!hasAuth && host !== "localhost" && !warnedMissingSmtpAuth) {
    warnedMissingSmtpAuth = true;
    console.warn(
      "[Email] SMTP_HOST is set but SMTP_USER and SMTP_PASS (or SMTP_PASSWORD) are not both set. " +
        "The server will often reject mail with 550 Authentication is required for relay."
    );
  }
  const options = {
    host,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
  };
  return nodemailer.createTransport(options);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Short OS / browser label for security notices (best-effort from User-Agent). */
function describeClientFromUserAgent(userAgent: string | undefined): string {
  if (!userAgent?.trim()) {
    return "unknown OS / unknown browser";
  }
  const ua = userAgent;

  let os = "unknown OS";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "unknown browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/CriOS\//i.test(ua)) browser = "Chrome";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  return `${os} / ${browser}`;
}

export async function sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
  const transporter = getTransporter();
  const baseUrl = config.auth.frontendBaseUrl.replace(/\/$/, "");
  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const from = config.smtp.from;

  const mailOptions: nodemailer.SendMailOptions = {
    from: from ? `EOS <${from}>` : undefined,
    to,
    subject: "Verify your email — EOS",
    text: `Hello ${name},\n\nPlease verify your email by opening this link:\n${verifyUrl}\n\nThe link expires in 24 hours.\n\n— EOS`,
    html: `
      <p>Hello ${name},</p>
      <p>Please verify your email by clicking the link below:</p>
      <p><a href="${verifyUrl}">Verify my email</a></p>
      <p>The link expires in 24 hours.</p>
      <p>— EOS</p>
    `,
  };

  if (!transporter) {
    console.warn("[Email] SMTP not configured; skipping verification email to", to, "Link:", verifyUrl);
    return;
  }
  await transporter.sendMail(mailOptions);
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
  userAgent?: string
): Promise<void> {
  const transporter = getTransporter();
  const baseUrl = config.auth.frontendBaseUrl.replace(/\/$/, "");
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const from = config.smtp.from;
  const appName = config.email.appName;
  const logoUrl =
    config.email.logoUrl?.trim() || `${baseUrl}/faveicon/android-chrome-192x192.png`;
  const clientDesc = describeClientFromUserAgent(userAgent);

  const safeName = escapeHtml(name == null ? "" : String(name));
  const safeApp = escapeHtml(appName);
  const safeLogo = escapeHtml(logoUrl);
  const safeClientDesc = escapeHtml(clientDesc);

  const subject = `Reset your password — ${appName}`;

  const textBody = [
    `Hi ${name},`,
    "",
    `We received a request to reset the password for your ${appName} account. Open this link to proceed:`,
    resetUrl,
    "",
    "This link expires in 1 hour.",
    "",
    `For your security, this request was received from a ${clientDesc} device. If you did not request this, please secure your account.`,
    "",
    `Best regards,`,
    `The ${appName} Team`,
  ].join("\n");

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:32px 24px 8px;">
              <img src="${safeLogo}" alt="${safeApp}" width="96" height="96" style="display:block;margin:0 auto;border:0;height:auto;max-width:96px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;color:#212121;font-size:15px;line-height:1.5;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:bold;color:#212121;font-family:Arial,Helvetica,sans-serif;">Reset your password</h1>
              <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">Hi ${safeName},</p>
              <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;">We received a request to reset the password for your ${safeApp} account. Click the button below to proceed.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" bgcolor="#D32F2F" style="border-radius:4px;background-color:#D32F2F;">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;border-radius:4px;">Reset password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;color:#616161;font-size:14px;font-family:Arial,Helvetica,sans-serif;">This link expires in 1 hour.</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;">Best regards,<br />The ${safeApp} Team</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#eeeeee;color:#757575;font-size:12px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0;">For your security, this request was received from a ${safeClientDesc} device. If you did not request this, please secure your account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const mailOptions: nodemailer.SendMailOptions = {
    from: from ? `${appName} <${from}>` : undefined,
    to,
    subject,
    text: textBody,
    html: htmlBody,
  };

  if (!transporter) {
    console.warn("[Email] SMTP not configured; skipping reset email to", to, "Link:", resetUrl);
    return;
  }
  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error(
      "[Email] Password reset send failed (check SMTP_*, From vs auth user, and server logs):",
      err
    );
    throw err;
  }
}
