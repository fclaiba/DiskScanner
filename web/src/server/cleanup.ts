import { lt, or, isNotNull } from "drizzle-orm";
import { getDb } from "./db/client";
import { deviceAuthorizations, emailTokens, rateLimits, reports, sessions } from "./db/schema";

const DAY = 24 * 60 * 60 * 1000;

export interface CleanupCounts {
  sessions: number;
  emailTokens: number;
  deviceAuthorizations: number;
  rateLimits: number;
  reports: number;
}

/** Retention job (Vercel cron, daily). */
export async function runCleanup(now = new Date()): Promise<CleanupCounts> {
  const db = await getDb();
  const dayAgo = new Date(now.getTime() - DAY);
  const thirteenMonthsAgo = new Date(now);
  thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

  const s = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  const e = await db
    .delete(emailTokens)
    .where(or(lt(emailTokens.expiresAt, now), isNotNull(emailTokens.usedAt)))
    .returning({ id: emailTokens.id });
  const d = await db
    .delete(deviceAuthorizations)
    .where(lt(deviceAuthorizations.createdAt, dayAgo))
    .returning({ id: deviceAuthorizations.id });
  const r = await db.delete(rateLimits).where(lt(rateLimits.windowStart, dayAgo)).returning({ key: rateLimits.key });
  const rep = await db.delete(reports).where(lt(reports.createdAt, thirteenMonthsAgo)).returning({ id: reports.id });
  return {
    sessions: s.length,
    emailTokens: e.length,
    deviceAuthorizations: d.length,
    rateLimits: r.length,
    reports: rep.length,
  };
}
