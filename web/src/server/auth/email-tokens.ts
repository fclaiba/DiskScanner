import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { emailTokens } from "../db/schema";
import { randomToken, sha256Hex } from "../crypto";

export type EmailTokenKind = "verify" | "reset";

const TTL_MS: Record<EmailTokenKind, number> = {
  verify: 48 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

/** Creates a one-time token; any previous unused token of the same kind is invalidated. */
export async function createEmailToken(userId: string, kind: EmailTokenKind): Promise<string> {
  const db = await getDb();
  const token = randomToken(32);
  await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt)));
  await db.insert(emailTokens).values({
    userId,
    kind,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + TTL_MS[kind]),
  });
  return token;
}

/** Atomically marks the token used and returns its user id, or null if invalid/expired/used. */
export async function consumeEmailToken(token: string, kind: EmailTokenKind): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const db = await getDb();
  const [row] = await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailTokens.tokenHash, sha256Hex(token)),
        eq(emailTokens.kind, kind),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: emailTokens.userId });
  return row?.userId ?? null;
}
