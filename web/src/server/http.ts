import { NextResponse } from "next/server";
import { env } from "./env";

/** Contract error format: { error: { code, message } }. */
export function apiError(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function json(body: unknown, status = 200, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export class PayloadTooLargeError extends Error {}

/** Reads the body as text enforcing a byte limit (Content-Length and actual size). */
export async function readTextLimited(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError();
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Parses a JSON body (≤ maxBytes). Returns undefined for malformed JSON. */
export async function readJson(req: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const text = await readTextLimited(req, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * CSRF defence for cookie-authenticated POST route handlers: the Origin (or,
 * failing that, Referer) must match the site's own origin.
 */
export function isSameOrigin(req: Request): boolean {
  const allowed = new Set<string>([new URL(env.siteUrl).origin]);
  try {
    allowed.add(new URL(req.url).origin);
  } catch {
    /* ignore */
  }
  const origin = req.headers.get("origin");
  if (origin) return allowed.has(origin);
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

/** Only allow local, non protocol-relative redirect targets. */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
