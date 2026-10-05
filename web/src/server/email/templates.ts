import { env } from "../env";
import type { EmailMessage } from "./send";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, intro: string, cta: string, url: string, outro: string): string {
  const u = escapeHtml(url);
  return `<!doctype html><html><body style="margin:0;background:#0b0f17;font-family:Inter,Segoe UI,Arial,sans-serif;color:#f1f5f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#131926;border-radius:14px;padding:32px">
<tr><td><p style="margin:0 0 24px;font-weight:600;font-size:15px">DiskScanner Turbo</p>
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(title)}</h1>
<p style="margin:0 0 24px;color:#cbd5e1;line-height:1.6;font-size:15px">${escapeHtml(intro)}</p>
<a href="${u}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${escapeHtml(cta)}</a>
<p style="margin:24px 0 0;color:#8b95a7;font-size:13px;line-height:1.6">${escapeHtml(outro)}<br>If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all">${u}</span></p>
</td></tr></table></td></tr></table></body></html>`;
}

export function verifyEmailMessage(to: string, token: string): EmailMessage {
  const url = `${env.siteUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: "Confirm your email for DiskScanner Turbo",
    text: `Confirm your email address to finish setting up your account:\n\n${url}\n\nThis link expires in 48 hours. If you didn't create an account, ignore this email.`,
    html: layout(
      "Confirm your email",
      "Confirm your email address to finish setting up your DiskScanner Turbo account.",
      "Confirm email",
      url,
      "This link expires in 48 hours. If you didn't create an account, you can ignore this email.",
    ),
  };
}

export function resetPasswordMessage(to: string, token: string): EmailMessage {
  const url = `${env.siteUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: "Reset your DiskScanner Turbo password",
    text: `Someone asked to reset the password for this account. Use this link to choose a new one:\n\n${url}\n\nThe link expires in 1 hour. If it wasn't you, ignore this email — your password stays the same.`,
    html: layout(
      "Reset your password",
      "Someone asked to reset the password for this account. Use the button below to choose a new one.",
      "Choose a new password",
      url,
      "The link expires in 1 hour. If it wasn't you, ignore this email — your password stays the same.",
    ),
  };
}
