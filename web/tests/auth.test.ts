import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { hashPassword, verifyPassword, getDummyHash } from "@/server/auth/password";
import { createSession, getSessionUser, deleteSessionByToken, deleteUserSessions, SESSION_COOKIE } from "@/server/auth/sessions";
import { createEmailToken, consumeEmailToken } from "@/server/auth/email-tokens";
import {
  signup,
  login,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  changePassword,
  sendVerificationEmail,
  getUserById,
} from "@/server/auth/accounts";
import { deleteAccount } from "@/server/account/delete";
import { POST as logout } from "@/app/api/auth/logout/route";
import { getDb } from "@/server/db/client";
import { auditLog, emailTokens, sessions, subscriptions, users } from "@/server/db/schema";
import { generateUserCode, normalizeUserCode, sha256Hex } from "@/server/crypto";
import { isSameOrigin, readTextLimited, safeNextPath, clientIp, PayloadTooLargeError } from "@/server/http";
import { signupSchema, deleteAccountSchema } from "@/lib/schemas/auth";
import type Stripe from "stripe";
import { BASE, createUser, resetDb } from "./helpers";

const meta = { ip: "1.1.1.1", userAgent: "vitest" };

describe("password hashing", () => {
  it("uses scrypt$N$r$p$salt$hash and verifies", async () => {
    const h = await hashPassword("correct horse battery");
    const parts = h.split("$");
    expect(parts.slice(0, 4)).toEqual(["scrypt", "16384", "8", "1"]);
    expect(Buffer.from(parts[4]!, "base64")).toHaveLength(16);
    expect(Buffer.from(parts[5]!, "base64")).toHaveLength(64);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong horse battery", h)).toBe(false);
    expect(await hashPassword("correct horse battery")).not.toBe(h); // random salt
  });

  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
    expect(await verifyPassword("x", "scrypt$a$b$c$d$e")).toBe(false);
    expect(await verifyPassword("x", "scrypt$16384$8$1$AAAA$")).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await getDummyHash()).toMatch(/^scrypt\$/);
  });
});

describe("helpers", () => {
  it("user codes use the contract alphabet", () => {
    for (let i = 0; i < 200; i++) expect(generateUserCode()).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(normalizeUserCode("bcdf ghjk")).toBe("BCDF-GHJK");
    expect(normalizeUserCode("ABCD-EFGH")).toBeNull(); // vowels not in alphabet
    expect(normalizeUserCode("BCD")).toBeNull();
  });

  it("safeNextPath blocks open redirects", () => {
    expect(safeNextPath("/activate?code=BCDF-GHJK")).toBe("/activate?code=BCDF-GHJK");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });

  it("isSameOrigin checks Origin then Referer", () => {
    const mk = (h: Record<string, string>) => new Request(`${BASE}/api/x`, { method: "POST", headers: h });
    expect(isSameOrigin(mk({ origin: BASE }))).toBe(true);
    expect(isSameOrigin(mk({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(mk({ referer: `${BASE}/dashboard` }))).toBe(true);
    expect(isSameOrigin(mk({ referer: "https://evil.example/x" }))).toBe(false);
    expect(isSameOrigin(mk({ referer: "::::" }))).toBe(false);
    expect(isSameOrigin(mk({}))).toBe(false);
  });

  it("clientIp and readTextLimited", async () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "5.5.5.5, 10.0.0.1" }))).toBe("5.5.5.5");
    expect(clientIp(new Headers({ "x-real-ip": "6.6.6.6" }))).toBe("6.6.6.6");
    expect(clientIp(new Headers())).toBe("unknown");
    const small = new Request(BASE, { method: "POST", body: "hello" });
    expect(await readTextLimited(small, 10)).toBe("hello");
    const big = new Request(BASE, { method: "POST", body: "x".repeat(20) });
    await expect(readTextLimited(big, 10)).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(await readTextLimited(new Request(BASE, { method: "GET" }), 10)).toBe("");
  });

  it("schemas normalize email and enforce password length", () => {
    const ok = signupSchema.safeParse({ email: "  Foo@Example.COM ", password: "0123456789" });
    expect(ok.success && ok.data.email).toBe("foo@example.com");
    expect(signupSchema.safeParse({ email: "foo@example.com", password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ email: "nope", password: "0123456789" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: "delete" }).success).toBe(false);
  });
});

describe("accounts and sessions", () => {
  beforeEach(resetDb);

  it("signup creates user + session + verification token; duplicate email rejected", async () => {
    const r = await signup("New@Example.com", "0123456789abc", meta);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.user.email).toBe("new@example.com");
    expect(r.user.passwordHash).toMatch(/^scrypt\$/);
    expect((await getSessionUser(r.session.token))?.user.id).toBe(r.user.id);
    const db = await getDb();
    const toks = await db.select().from(emailTokens).where(eq(emailTokens.userId, r.user.id));
    expect(toks).toHaveLength(1);
    expect(toks[0]!.kind).toBe("verify");
    const dup = await signup("new@example.com", "0123456789abc", { ip: "2.2.2.2" });
    expect(!dup.ok && dup.code).toBe("email_taken");
  });

  it("signup is rate limited to 5/hour per IP", async () => {
    for (let i = 0; i < 5; i++) expect((await signup(`s${i}@example.com`, "0123456789abc", { ip: "3.3.3.3" })).ok).toBe(true);
    const r = await signup("s6@example.com", "0123456789abc", { ip: "3.3.3.3" });
    expect(!r.ok && r.code).toBe("rate_limited");
  });

  it("login verifies credentials, rotates sessions, and is rate limited per IP+email", async () => {
    const user = await createUser({ email: "a@example.com", password: "0123456789abc" });
    const first = await login("A@example.com", "0123456789abc", meta);
    expect(first.ok).toBe(true);
    const second = await login("a@example.com", "0123456789abc", meta);
    expect(second.ok && first.ok && second.session.token !== first.session.token).toBe(true);
    expect((await login("a@example.com", "wrong-password", meta)).ok).toBe(false);
    const unknown = await login("nobody@example.com", "whatever12345", meta);
    expect(!unknown.ok && unknown.code).toBe("invalid_credentials");

    for (let i = 0; i < 10; i++) await login("a@example.com", "bad", { ip: "4.4.4.4" });
    const limited = await login("a@example.com", "0123456789abc", { ip: "4.4.4.4" });
    expect(!limited.ok && limited.code).toBe("rate_limited");
    // other IP still fine
    expect((await login("a@example.com", "0123456789abc", { ip: "4.4.4.5" })).ok).toBe(true);

    const db = await getDb();
    const failed = await db.select().from(auditLog).where(eq(auditLog.action, "auth.login_failed"));
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0]!.userId).toBe(user.id);
  });

  it("session lifecycle: hash-only storage, expiry, deletion", async () => {
    const user = await createUser();
    const s = await createSession(user.id, meta);
    expect(s.token).toHaveLength(43);
    const db = await getDb();
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(row!.tokenHash).toBe(sha256Hex(s.token));
    expect(row!.tokenHash).not.toContain(s.token);
    expect(Math.round((s.expiresAt.getTime() - Date.now()) / 86400_000)).toBe(30);
    expect(await getSessionUser(undefined)).toBeNull();
    expect(await getSessionUser("x".repeat(500))).toBeNull();

    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, row!.id));
    expect(await getSessionUser(s.token)).toBeNull();

    const s2 = await createSession(user.id);
    const s3 = await createSession(user.id);
    await deleteSessionByToken(s2.token);
    expect(await getSessionUser(s2.token)).toBeNull();
    const keep = await getSessionUser(s3.token);
    const s4 = await createSession(user.id);
    await deleteUserSessions(user.id, keep!.sessionId);
    expect(await getSessionUser(s3.token)).not.toBeNull();
    expect(await getSessionUser(s4.token)).toBeNull();
    await deleteUserSessions(user.id);
    expect(await getSessionUser(s3.token)).toBeNull();
  });

  it("password reset: one-time token, 1h expiry, kills sessions, never reveals emails", async () => {
    const user = await createUser({ email: "r@example.com" });
    const s = await createSession(user.id);
    expect((await requestPasswordReset("nobody@example.com", meta)).ok).toBe(true);
    const tok = await createEmailToken(user.id, "reset");
    expect(await resetPassword(tok, "brand-new-password", meta)).toBe(true);
    expect(await resetPassword(tok, "another-password", meta)).toBe(false);
    expect(await getSessionUser(s.token)).toBeNull();
    expect((await login("r@example.com", "brand-new-password", meta)).ok).toBe(true);
    expect((await getUserById(user.id))!.emailVerifiedAt).not.toBeNull();

    const tok2 = await createEmailToken(user.id, "reset");
    const db = await getDb();
    await db.update(emailTokens).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(emailTokens.tokenHash, sha256Hex(tok2)));
    expect(await resetPassword(tok2, "whatever-password", meta)).toBe(false);
    // verify tokens can't be used for reset
    const v = await createEmailToken(user.id, "verify");
    expect(await consumeEmailToken(v, "reset")).toBeNull();
    expect(await consumeEmailToken("", "reset")).toBeNull();
  });

  it("forgot-password is rate limited to 5/hour per IP", async () => {
    for (let i = 0; i < 5; i++) expect((await requestPasswordReset("x@example.com", { ip: "7.7.7.7" })).ok).toBe(true);
    expect((await requestPasswordReset("x@example.com", { ip: "7.7.7.7" })).rateLimited).toBe(true);
  });

  it("email verification and re-sending invalidates the previous link", async () => {
    const user = await createUser();
    const first = await createEmailToken(user.id, "verify");
    await sendVerificationEmail(user);
    expect(await verifyEmail(first)).toBe(false);
    const fresh = await createEmailToken(user.id, "verify");
    expect(await verifyEmail(fresh)).toBe(true);
    expect((await getUserById(user.id))!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await verifyEmail(fresh)).toBe(false);
  });

  it("change password keeps the current session and drops the others", async () => {
    const user = await createUser({ password: "old-password-123" });
    const current = await createSession(user.id);
    const other = await createSession(user.id);
    const cs = await getSessionUser(current.token);
    expect((await changePassword(user, cs!.sessionId, "nope", "new-password-123", meta)).ok).toBe(false);
    expect((await changePassword(user, cs!.sessionId, "old-password-123", "new-password-123", meta)).ok).toBe(true);
    expect(await getSessionUser(current.token)).not.toBeNull();
    expect(await getSessionUser(other.token)).toBeNull();
    const u = await getUserById(user.id);
    expect(await verifyPassword("new-password-123", u!.passwordHash)).toBe(true);
  });
});

describe("account deletion", () => {
  beforeEach(resetDb);

  it("requires the password, cancels Stripe immediately, then deletes everything", async () => {
    const user = await createUser({ password: "my-password-123", status: "active" });
    await createSession(user.id);
    const cancel = vi.fn().mockResolvedValue({ id: "sub", status: "canceled" });
    const stripe = { subscriptions: { cancel } } as unknown as Stripe;

    expect((await deleteAccount(user, "wrong", undefined, () => stripe)).ok).toBe(false);
    expect(cancel).not.toHaveBeenCalled();

    expect((await deleteAccount(user, "my-password-123", "1.1.1.1", () => stripe)).ok).toBe(true);
    expect(cancel).toHaveBeenCalledWith(`sub_${user.id.slice(0, 8)}`, { prorate: false });
    const db = await getDb();
    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(subscriptions)).toHaveLength(0);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "account.delete"));
    expect(entry!.meta).toMatchObject({ deleted_user_id: user.id });
  });

  it("aborts if Stripe cancellation fails; tolerates already-deleted subscriptions", async () => {
    const user = await createUser({ password: "my-password-123", status: "trialing" });
    const failing = { subscriptions: { cancel: vi.fn().mockRejectedValue(new Error("network")) } } as unknown as Stripe;
    expect((await deleteAccount(user, "my-password-123", undefined, () => failing)).ok).toBe(false);
    expect(await getUserById(user.id)).not.toBeNull();
    const missing = {
      subscriptions: { cancel: vi.fn().mockRejectedValue(Object.assign(new Error("gone"), { code: "resource_missing" })) },
    } as unknown as Stripe;
    expect((await deleteAccount(user, "my-password-123", undefined, () => missing)).ok).toBe(true);
    expect(await getUserById(user.id)).toBeNull();
  });

  it("free users are deleted without touching Stripe", async () => {
    const user = await createUser({ password: "my-password-123" });
    const factory = vi.fn();
    expect((await deleteAccount(user, "my-password-123", undefined, factory)).ok).toBe(true);
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("logout route", () => {
  beforeEach(resetDb);

  it("rejects cross-origin posts and deletes the session", async () => {
    const user = await createUser();
    const s = await createSession(user.id);
    const evil = new NextRequest(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: { origin: "https://evil.example", cookie: `${SESSION_COOKIE}=${s.token}` },
    });
    expect((await logout(evil)).status).toBe(403);
    expect(await getSessionUser(s.token)).not.toBeNull();

    const ok = new NextRequest(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: { origin: BASE, cookie: `${SESSION_COOKIE}=${s.token}` },
    });
    const res = await logout(ok);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${BASE}/login?signed_out=1`);
    expect(res.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=;`);
    expect(await getSessionUser(s.token)).toBeNull();
  });
});

describe("cookie helpers (next/headers)", () => {
  beforeEach(resetDb);

  it("requireSession redirects when signed out and returns the user when signed in", async () => {
    const jar = new Map<string, string>();
    vi.doMock("next/headers", () => ({
      cookies: async () => ({
        get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
        set: (n: string, v: string) => void jar.set(n, v),
        delete: (n: string) => void jar.delete(n),
      }),
      headers: async () => new Headers({ "x-forwarded-for": "8.8.8.8", "user-agent": "ua" }),
    }));
    vi.doMock("next/navigation", () => ({
      redirect: (url: string) => {
        throw new Error(`REDIRECT:${url}`);
      },
    }));
    const mod = await import("@/server/auth/current");
    await expect(mod.requireSession("/dashboard/devices")).rejects.toThrow("REDIRECT:/login?next=%2Fdashboard%2Fdevices");

    const user = await createUser();
    const s = await createSession(user.id);
    await mod.setSessionCookie(s);
    expect(await mod.currentSessionToken()).toBe(s.token);
    expect((await mod.getCurrentSession())?.user.id).toBe(user.id);
    expect(await mod.requestMeta()).toEqual({ ip: "8.8.8.8", userAgent: "ua" });
    await mod.clearSessionCookie();
    expect(jar.size).toBe(0);
    vi.doUnmock("next/headers");
    vi.doUnmock("next/navigation");
  });
});
