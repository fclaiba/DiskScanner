import { env } from "../env";
import { log } from "../log";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends through Resend's HTTP API when RESEND_API_KEY is set. Otherwise the
 * email (including its link) is printed to the server console — dev only.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  const apiKey = env.resendApiKey;
  if (!apiKey) {
    if (env.isProd) {
      log.error("email not sent: RESEND_API_KEY missing", { subject: msg.subject });
      return false;
    }
    if (process.env.NODE_ENV !== "test") {
      console.log(`\n[dev email] To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n`);
    }
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      log.error("resend rejected email", { status: res.status, subject: msg.subject });
      return false;
    }
    return true;
  } catch (err) {
    log.error("resend request failed", { err, subject: msg.subject });
    return false;
  }
}
