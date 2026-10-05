import { sql } from "drizzle-orm";
import { getDb } from "./db/client";
import { rateLimits } from "./db/schema";

export interface RateLimitResult {
  ok: boolean;
  count: number;
  limit: number;
  /** Seconds until the current window resets. */
  retryAfter: number;
}

/**
 * Postgres-backed fixed-window counter. One atomic upsert per call.
 * `key` should be namespaced, e.g. `login:<ip>:<email-hash>`.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const db = await getDb();
  const nowMs = now.getTime();
  const windowMs = windowSec * 1000;
  const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  const count = row?.count ?? 1;
  const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - nowMs) / 1000));
  return { ok: count <= limit, count, limit, retryAfter };
}

export const LIMITS = {
  deviceAuthorize: { limit: 10, windowSec: 3600 },
  entitlement: { limit: 120, windowSec: 3600 },
  reports: { limit: 60, windowSec: 3600 },
  login: { limit: 10, windowSec: 15 * 60 },
  signup: { limit: 5, windowSec: 3600 },
  forgotPassword: { limit: 5, windowSec: 3600 },
} as const;
