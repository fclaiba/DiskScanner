import { and, eq, gt, ne } from "drizzle-orm";
import { getDb } from "../db/client";
import { sessions, users, type User } from "../db/schema";
import { randomToken, sha256Hex } from "../crypto";

export const SESSION_COOKIE = "ds_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface NewSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<NewSession> {
  const db = await getDb();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256Hex(token),
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

export interface SessionUser {
  sessionId: string;
  user: User;
}

export async function getSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const db = await getDb();
  const rows = await db
    .select({ sessionId: sessions.id, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256Hex(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256Hex(token)));
}

/** Deletes every session of a user, optionally keeping one (e.g. the current). */
export async function deleteUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  const db = await getDb();
  await db
    .delete(sessions)
    .where(exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)) : eq(sessions.userId, userId));
}
