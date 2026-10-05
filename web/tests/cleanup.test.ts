import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cron } from "@/app/api/cron/cleanup/route";
import { runCleanup } from "@/server/cleanup";
import { rateLimit } from "@/server/rate-limit";
import { createSession } from "@/server/auth/sessions";
import { createEmailToken } from "@/server/auth/email-tokens";
import { startDeviceAuthorization, approveDevice, pollDeviceToken } from "@/server/devices/flow";
import { getDb, pgliteDataDir, isPglite } from "@/server/db/client";
import { deviceAuthorizations, emailTokens, rateLimits, reports, sessions } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { resetPasswordMessage, verifyEmailMessage } from "@/server/email/templates";
import { log } from "@/server/log";
import { audit } from "@/server/audit";
import { withApi } from "@/server/api";
import { eq } from "drizzle-orm";
import { sha256Hex } from "@/server/crypto";
import { createUser, fp, getReq, resetDb } from "./helpers";

describe("rate limiter", () => {
  beforeEach(resetDb);
  it("counts within a fixed window and resets in the next one", async () => {
    const t = new Date("2026-01-01T00:00:10Z");
    for (let i = 1; i <= 3; i++) expect((await rateLimit("k", 3, 60, t)).ok).toBe(true);
    const over = await rateLimit("k", 3, 60, t);
    expect(over.ok).toBe(false);
    expect(over.count).toBe(4);
    expect(over.retryAfter).toBe(50);
    expect((await rateLimit("k", 3, 60, new Date("2026-01-01T00:01:00Z"))).ok).toBe(true);
    expect((await rateLimit("other", 3, 60, t)).ok).toBe(true);
  });
});

describe("cron cleanup", () => {
  beforeEach(resetDb);

  it("requires the CRON_SECRET bearer", async () => {
    delete process.env.CRON_SECRET;
    expect((await cron(getReq("/api/cron/cleanup", { authorization: "Bearer x" }))).status).toBe(401);
    process.env.CRON_SECRET = "s3cret-value";
    expect((await cron(getReq("/api/cron/cleanup", { authorization: "Bearer wrong" }))).status).toBe(401);
    const ok = await cron(getReq("/api/cron/cleanup", { authorization: "Bearer s3cret-value" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true });
  });

  it("deletes expired/old rows and keeps fresh ones", async () => {
    const user = await createUser({ status: "active" });
    const db = await getDb();
    const now = new Date();
    const live = await createSession(user.id);
    const dead = await createSession(user.id);
    await db.update(sessions).set({ expiresAt: new Date(now.getTime() - 1) }).where(eq(sessions.tokenHash, sha256Hex(dead.token)));
    expect(live.token).toBeTruthy();

    await createEmailToken(user.id, "verify"); // fresh
    const used = await createEmailToken(user.id, "reset");
    await db.update(emailTokens).set({ usedAt: now }).where(eq(emailTokens.tokenHash, sha256Hex(used)));

    const a = await startDeviceAuthorization({ fingerprint: fp(1), name: "PC", platform: "windows", app_version: "2.0.0" });
    await approveDevice(user, a.user_code);
    const t = await pollDeviceToken(a.device_code);
    if (!t.ok) throw new Error("link failed");
    await startDeviceAuthorization({ fingerprint: fp(2), name: "PC2", platform: "windows", app_version: "2.0.0" });
    await db.update(deviceAuthorizations).set({ createdAt: new Date(now.getTime() - 2 * 86400_000) }).where(eq(deviceAuthorizations.fingerprint, fp(1)));

    await rateLimit("old", 1, 60, new Date(now.getTime() - 2 * 86400_000));
    await rateLimit("new", 1, 60, now);

    const base = { deviceId: t.body.device_id, userId: user.id, kind: "scan" as const, totalBytes: 1, fileCount: 1, reclaimableBytes: 0, freedBytes: 0, durationMs: 1, appVersion: "1" };
    await db.insert(reports).values({ ...base, createdAt: new Date(now.getTime() - 400 * 86400_000) });
    await db.insert(reports).values({ ...base });

    const counts = await runCleanup(now);
    expect(counts).toEqual({ sessions: 1, emailTokens: 1, deviceAuthorizations: 1, rateLimits: 1, reports: 1 });
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await db.select().from(emailTokens)).toHaveLength(1);
    expect(await db.select().from(reports)).toHaveLength(1);
    expect(await db.select().from(rateLimits)).toHaveLength(1);
  });
});

describe("misc server utilities", () => {
  it("pglite url parsing", () => {
    expect(isPglite("pglite://memory")).toBe(true);
    expect(isPglite("postgres://u@h/db")).toBe(false);
    expect(pgliteDataDir("pglite://memory")).toBeUndefined();
    expect(pgliteDataDir("pglite:./.data/dev")).toBe("./.data/dev");
  });

  it("emails are rendered with escaped links and sent via Resend when configured", async () => {
    const v = verifyEmailMessage("a@example.com", "tok");
    expect(v.text).toContain("http://localhost:3000/verify-email?token=tok");
    expect(resetPasswordMessage("a@example.com", "t<").html).toContain("t%3C");
    expect(await sendEmail(v)).toBe(true); // dev: logged
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("no", { status: 422 })).mockRejectedValueOnce(new Error("net"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(v)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer re_test" });
    expect(await sendEmail(v)).toBe(false);
    expect(await sendEmail(v)).toBe(false);
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("logger redacts sensitive keys and respects level", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const espy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "debug";
    log.info("hello", { userId: "u1", token: "secret", email: "x@y.z", err: new Error("e") });
    log.warn("w");
    log.debug("d");
    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ level: "info", msg: "hello", userId: "u1", token: "[redacted]", email: "[redacted]" });
    expect(line.err).toEqual({ name: "Error", message: "e" });
    expect(espy).toHaveBeenCalled();
    process.env.LOG_LEVEL = "silent";
    log.error("quiet");
    expect(espy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    espy.mockRestore();
  });

  it("audit never throws; withApi converts errors to the contract format", async () => {
    await expect(audit("auth.login", "not-a-uuid")).resolves.toBeUndefined();
    const h = withApi("boom", async () => {
      throw new Error("kaboom");
    });
    const res = await h(new Request("http://localhost/x"), undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal_error", message: expect.any(String) } });
  });
});
