import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users, type User } from "../db/schema";
import { hashPassword, verifyPassword, getDummyHash } from "./password";
import { createSession, deleteUserSessions, type NewSession } from "./sessions";
import { createEmailToken, consumeEmailToken } from "./email-tokens";
import { sendEmail } from "../email/send";
import { resetPasswordMessage, verifyEmailMessage } from "../email/templates";
import { rateLimit, LIMITS } from "../rate-limit";
import { audit } from "../audit";
import { sha256Hex } from "../crypto";
import { log } from "../log";

export interface ReqMeta {
  ip: string;
  userAgent?: string | null;
}

export type AuthResult =
  | { ok: true; user: User; session: NewSession }
  | { ok: false; code: "rate_limited" | "email_taken" | "invalid_credentials"; message: string };

function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === "23505") return true;
    e = typeof e === "object" && e !== null && "cause" in e ? (e as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return u ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

export async function sendVerificationEmail(user: Pick<User, "id" | "email">): Promise<void> {
  const token = await createEmailToken(user.id, "verify");
  await sendEmail(verifyEmailMessage(user.email, token));
}

export async function signup(email: string, password: string, meta: ReqMeta): Promise<AuthResult> {
  const rl = await rateLimit(`signup:${meta.ip}`, LIMITS.signup.limit, LIMITS.signup.windowSec);
  if (!rl.ok) return { ok: false, code: "rate_limited", message: "Too many sign-ups from this network. Try again later." };

  const db = await getDb();
  const passwordHash = await hashPassword(password);
  let user: User;
  try {
    [user] = (await db.insert(users).values({ email: email.toLowerCase(), passwordHash }).returning()) as [User];
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, code: "email_taken", message: "An account with this email already exists. Try signing in." };
    }
    throw err;
  }
  const session = await createSession(user.id, meta);
  await audit("auth.signup", user.id, {}, meta.ip);
  try {
    await sendVerificationEmail(user);
  } catch (err) {
    log.error("verification email failed", { userId: user.id, err });
  }
  return { ok: true, user, session };
}

export async function login(email: string, password: string, meta: ReqMeta): Promise<AuthResult> {
  const key = `login:${meta.ip}:${sha256Hex(email.toLowerCase()).slice(0, 32)}`;
  const rl = await rateLimit(key, LIMITS.login.limit, LIMITS.login.windowSec);
  if (!rl.ok) return { ok: false, code: "rate_limited", message: "Too many attempts. Wait a few minutes and try again." };

  const user = await findUserByEmail(email);
  if (!user) {
    await verifyPassword(password, await getDummyHash());
    return { ok: false, code: "invalid_credentials", message: "Incorrect email or password." };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await audit("auth.login_failed", user.id, {}, meta.ip);
    return { ok: false, code: "invalid_credentials", message: "Incorrect email or password." };
  }
  const session = await createSession(user.id, meta);
  await audit("auth.login", user.id, {}, meta.ip);
  return { ok: true, user, session };
}

/** Always resolves without revealing whether the email exists. */
export async function requestPasswordReset(email: string, meta: ReqMeta): Promise<{ ok: boolean; rateLimited?: boolean }> {
  const rl = await rateLimit(`forgot:${meta.ip}`, LIMITS.forgotPassword.limit, LIMITS.forgotPassword.windowSec);
  if (!rl.ok) return { ok: false, rateLimited: true };
  const user = await findUserByEmail(email);
  if (user) {
    const token = await createEmailToken(user.id, "reset");
    await sendEmail(resetPasswordMessage(user.email, token));
  }
  return { ok: true };
}

export async function resetPassword(token: string, newPassword: string, meta: ReqMeta): Promise<boolean> {
  const userId = await consumeEmailToken(token, "reset");
  if (!userId) return false;
  const db = await getDb();
  // Completing a reset proves control of the inbox, so also verify the email.
  const [u] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, userId))
    .returning();
  if (u && !u.emailVerifiedAt) await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  await deleteUserSessions(userId);
  await audit("auth.password_reset", userId, {}, meta.ip);
  return true;
}

export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await consumeEmailToken(token, "verify");
  if (!userId) return false;
  const db = await getDb();
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  await audit("auth.email_verified", userId);
  return true;
}

export type ChangePasswordResult = { ok: true } | { ok: false; message: string };

export async function changePassword(
  user: User,
  currentSessionId: string,
  current: string,
  next: string,
  meta: ReqMeta,
): Promise<ChangePasswordResult> {
  if (!(await verifyPassword(current, user.passwordHash))) {
    return { ok: false, message: "Your current password is incorrect." };
  }
  const db = await getDb();
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
  await deleteUserSessions(user.id, currentSessionId);
  await audit("auth.password_change", user.id, {}, meta.ip);
  return { ok: true };
}
