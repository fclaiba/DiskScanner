import { createPublicKey, verify } from "node:crypto";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users, subscriptions, type User } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import type { SubscriptionStatus } from "@/config/plans";

export const BASE = "http://localhost:3000";

export async function resetDb(): Promise<void> {
  const db = await getDb();
  await db.execute(
    sql`truncate table audit_log, reports, device_authorizations, devices, subscriptions, email_tokens, sessions, users, stripe_events, rate_limits cascade`,
  );
}

let counter = 0;
export async function createUser(opts: { email?: string; password?: string; status?: SubscriptionStatus } = {}): Promise<User> {
  const db = await getDb();
  const email = opts.email ?? `user${++counter}-${Date.now()}@example.com`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(opts.password ?? "correct horse battery") })
    .returning();
  if (opts.status && opts.status !== "none") {
    await db.insert(subscriptions).values({
      userId: u!.id,
      stripeSubscriptionId: `sub_${u!.id.slice(0, 8)}`,
      status: opts.status,
      priceId: "price_m",
      interval: "month",
      currentPeriodEnd: new Date("2030-01-01T00:00:00Z"),
    });
  }
  return u!;
}

export function jsonReq(path: string, body: unknown, init: { method?: string; headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function getReq(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${BASE}${path}`, { method: "GET", headers });
}

export function fp(n = 1): string {
  return n.toString(16).padStart(2, "0").repeat(32);
}

export function verifyEntitlement(ent: { payload: string; signature: string; kid: string }) {
  const raw = Buffer.from(process.env.TEST_ENTITLEMENT_PUBLIC_RAW!, "base64");
  // Rebuild an SPKI DER from the raw 32 bytes, exactly like the desktop does with from_public_bytes.
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const key = createPublicKey({ key: Buffer.concat([spkiPrefix, raw]), format: "der", type: "spki" });
  const bytes = Buffer.from(ent.payload, "base64url");
  const ok = verify(null, bytes, key, Buffer.from(ent.signature, "base64url"));
  return { ok, payload: JSON.parse(bytes.toString("utf8")) as Record<string, unknown> };
}

export const noCtx = undefined as unknown as never;
