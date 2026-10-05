import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as authorize } from "@/app/api/v1/devices/authorize/route";
import { POST as token } from "@/app/api/v1/devices/token/route";
import { POST as selfRevoke } from "@/app/api/v1/devices/self/revoke/route";
import { GET as entitlement } from "@/app/api/v1/entitlement/route";
import { GET as health } from "@/app/api/v1/health/route";
import { approveDevice, denyDevice, findByUserCode, findPendingByUserCode, pollDeviceToken } from "@/server/devices/flow";
import { listDevices, revokeDevice } from "@/server/devices/service";
import { getDb } from "@/server/db/client";
import { deviceAuthorizations, subscriptions, auditLog } from "@/server/db/schema";
import { USER_CODE_ALPHABET } from "@/server/crypto";
import { createUser, fp, getReq, jsonReq, noCtx, resetDb, verifyEntitlement } from "./helpers";
import type { User } from "@/server/db/schema";

const device = (n = 1, ip = "10.0.0.1") =>
  jsonReq(
    "/api/v1/devices/authorize",
    { fingerprint: fp(n), name: `DESKTOP-${n}`, platform: "windows", app_version: "2.0.0" },
    { headers: { "x-forwarded-for": ip } },
  );

async function startFlow(n = 1, ip?: string) {
  const res = await authorize(device(n, ip), noCtx);
  expect(res.status).toBe(200);
  return (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };
}

/** Moves last_polled_at into the past so the next poll is not "too fast". */
async function rewindPoll(deviceCode: string) {
  const db = await getDb();
  const { sha256Hex } = await import("@/server/crypto");
  await db
    .update(deviceAuthorizations)
    .set({ lastPolledAt: new Date(Date.now() - 60_000) })
    .where(eq(deviceAuthorizations.deviceCodeHash, sha256Hex(deviceCode)));
}

async function poll(deviceCode: string) {
  const res = await token(jsonReq("/api/v1/devices/token", { device_code: deviceCode }), noCtx);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { error?: { code: string } } };
}

async function link(user: User, n = 1) {
  const flow = await startFlow(n);
  const approved = await approveDevice(user, flow.user_code);
  expect(approved.ok).toBe(true);
  const r = await poll(flow.device_code);
  expect(r.status).toBe(200);
  return r.body as {
    access_token: string;
    device_id: string;
    entitlement: { payload: string; signature: string; kid: string };
  };
}

describe("device authorization flow (contract §1–3)", () => {
  beforeEach(resetDb);

  it("authorize returns the contract shape", async () => {
    const body = await startFlow();
    expect(body.device_code.length).toBeGreaterThanOrEqual(32);
    expect(body.user_code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    for (const ch of body.user_code.replace("-", "")) expect(USER_CODE_ALPHABET).toContain(ch);
    expect(body.verification_uri).toBe("http://localhost:3000/activate");
    expect(body.verification_uri_complete).toBe(`http://localhost:3000/activate?code=${body.user_code}`);
    expect(body.expires_in).toBe(900);
    expect(body.interval).toBe(5);
    // device_code is stored hashed only
    const db = await getDb();
    const rows = await db.select().from(deviceAuthorizations);
    expect(rows[0]!.deviceCodeHash).not.toBe(body.device_code);
    expect(rows[0]!.deviceCodeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("authorize validates input", async () => {
    const bad = [
      { fingerprint: "xyz", name: "a", platform: "windows", app_version: "2.0.0" },
      { fingerprint: fp(), name: "", platform: "windows", app_version: "2.0.0" },
      { fingerprint: fp(), name: "x".repeat(101), platform: "windows", app_version: "2.0.0" },
      { fingerprint: fp(), name: "ok", platform: "beos", app_version: "2.0.0" },
      { fingerprint: fp(), name: "ok", platform: "windows" },
    ];
    for (const b of bad) {
      const res = await authorize(jsonReq("/api/v1/devices/authorize", b), noCtx);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_request");
    }
    const res = await authorize(jsonReq("/api/v1/devices/authorize", "{not json"), noCtx);
    expect(res.status).toBe(400);
  });

  it("rate limits authorize to 10/hour per IP", async () => {
    for (let i = 0; i < 10; i++) expect((await authorize(device(1, "9.9.9.9"), noCtx)).status).toBe(200);
    const res = await authorize(device(1, "9.9.9.9"), noCtx);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
    expect((await authorize(device(1, "9.9.9.8"), noCtx)).status).toBe(200);
  });

  it("pending → slow_down → approve → token → consumed", async () => {
    const user = await createUser();
    const flow = await startFlow();

    let r = await poll(flow.device_code);
    expect(r.status).toBe(400);
    expect(r.body.error!.code).toBe("authorization_pending");

    r = await poll(flow.device_code);
    expect(r.body.error!.code).toBe("slow_down");

    // lowercase / no dash is accepted on the web form
    expect(await findPendingByUserCode(flow.user_code.toLowerCase().replace("-", ""))).not.toBeNull();
    const approved = await approveDevice(user, flow.user_code, "1.2.3.4");
    expect(approved.ok).toBe(true);

    await rewindPoll(flow.device_code);
    r = await poll(flow.device_code);
    expect(r.status).toBe(200);
    const body = r.body as {
      access_token: string;
      token_type: string;
      device_id: string;
      account: { email: string };
      entitlement: { payload: string; signature: string; kid: string };
    };
    expect(body.access_token).toMatch(/^dst_[A-Za-z0-9_-]{43}$/);
    expect(body.token_type).toBe("Bearer");
    expect(body.account.email).toBe(user.email);
    expect(body.entitlement.kid).toBe("k1");
    const { ok, payload } = verifyEntitlement(body.entitlement);
    expect(ok).toBe(true);
    expect(payload.device_id).toBe(body.device_id);
    expect(payload.fingerprint).toBe(fp(1));

    await rewindPoll(flow.device_code);
    r = await poll(flow.device_code);
    expect(r.body.error!.code).toBe("expired_token");

    const db = await getDb();
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "device.approve"));
    expect(audits).toHaveLength(1);
  });

  it("denied → access_denied", async () => {
    const user = await createUser();
    const flow = await startFlow();
    expect(await denyDevice(user, flow.user_code)).toBe(true);
    expect(await denyDevice(user, flow.user_code)).toBe(false);
    const decided = await findByUserCode(flow.user_code);
    expect(decided?.status).toBe("denied");
    expect(decided?.userId).toBe(user.id);
    expect(await findByUserCode("nope")).toBeNull();
    const r = await poll(flow.device_code);
    expect(r.body.error!.code).toBe("access_denied");
    expect((await approveDevice(user, flow.user_code)).ok).toBe(false);
  });

  it("expired codes and unknown codes → expired_token", async () => {
    const flow = await startFlow();
    const later = new Date(Date.now() + 901_000);
    expect((await pollDeviceToken(flow.device_code, later)).ok).toBe(false);
    const res = await pollDeviceToken(flow.device_code, later);
    expect(res.ok === false && res.code).toBe("expired_token");
    const r = await poll("x".repeat(43));
    expect(r.body.error!.code).toBe("expired_token");
    const bad = await token(jsonReq("/api/v1/devices/token", {}), noCtx);
    expect(bad.status).toBe(400);
  });

  it("enforces device limits per plan and reuses the same fingerprint", async () => {
    const free = await createUser();
    await link(free, 1);
    // same machine again → reuse, not a new device
    await link(free, 1);
    expect(await listDevices(free.id)).toHaveLength(1);
    const flow2 = await startFlow(2);
    const denied = await approveDevice(free, flow2.user_code);
    expect(denied.ok).toBe(false);
    expect(!denied.ok && denied.code).toBe("device_limit");

    const pro = await createUser({ status: "active" });
    await link(pro, 1);
    await link(pro, 2);
    await link(pro, 3);
    const flow4 = await startFlow(4);
    const r4 = await approveDevice(pro, flow4.user_code);
    expect(!r4.ok && r4.code).toBe("device_limit");
    // revoking one frees a slot
    const [first] = await listDevices(pro.id);
    expect(await revokeDevice(pro.id, first!.id)).toBe(true);
    expect(await revokeDevice(pro.id, first!.id)).toBe(false);
    expect((await approveDevice(pro, flow4.user_code)).ok).toBe(true);
  });
});

describe("GET /api/v1/entitlement", () => {
  beforeEach(resetDb);

  const call = (tok: string, fingerprint = fp(1), extra: Record<string, string> = {}) =>
    entitlement(getReq("/api/v1/entitlement", { authorization: `Bearer ${tok}`, "x-device-fingerprint": fingerprint, ...extra }), noCtx);

  it("returns a signed entitlement matching subscription status", async () => {
    const cases: [import("@/config/plans").SubscriptionStatus, boolean][] = [
      ["none", false],
      ["trialing", true],
      ["active", true],
      ["past_due", true],
      ["canceled", false],
      ["incomplete", false],
      ["unpaid", false],
    ];
    for (const [status, pro] of cases) {
      const user = await createUser({ status });
      const linked = await link(user, 1);
      const res = await call(linked.access_token, fp(1), { "x-app-version": "2.1.0" });
      expect(res.status).toBe(200);
      const { ok, payload } = verifyEntitlement((await res.json()) as { payload: string; signature: string; kid: string });
      expect(ok).toBe(true);
      expect(payload.v).toBe(1);
      expect(payload.status).toBe(status);
      expect(payload.pro).toBe(pro);
      expect(payload.plan).toBe(pro ? "pro" : "free");
      expect(payload.features).toEqual(pro ? ["scan", "cleanup", "sync"] : ["scan"]);
      expect(payload.account_email).toBe(user.email);
      expect(payload.expires_at).toBe((payload.issued_at as number) + 7 * 24 * 3600);
      expect(payload.current_period_end).toBe(status === "none" ? null : "2030-01-01T00:00:00.000Z");
      const [d] = await listDevices(user.id);
      expect(d!.appVersion).toBe("2.1.0");
      expect(d!.lastSeenAt).not.toBeNull();
    }
  });

  it("tampered payload fails verification", async () => {
    const user = await createUser({ status: "active" });
    const linked = await link(user);
    const tampered = Buffer.from(
      Buffer.from(linked.entitlement.payload, "base64url").toString().replace('"pro":true', '"pro":false'),
    ).toString("base64url");
    expect(verifyEntitlement({ ...linked.entitlement, payload: tampered }).ok).toBe(false);
  });

  it("401 invalid_token for unknown/missing tokens, 403 fingerprint_mismatch", async () => {
    const user = await createUser();
    const linked = await link(user);
    expect((await call("dst_nope")).status).toBe(401);
    const noAuth = await entitlement(getReq("/api/v1/entitlement"), noCtx);
    expect(noAuth.status).toBe(401);
    const mismatch = await call(linked.access_token, fp(9));
    expect(mismatch.status).toBe(403);
    expect(((await mismatch.json()) as { error: { code: string } }).error.code).toBe("fingerprint_mismatch");
  });

  it("revoked device → 401; self revoke → 204 then 401", async () => {
    const user = await createUser({ status: "active" });
    const a = await link(user, 1);
    const b = await link(user, 2);
    expect(await revokeDevice(user.id, a.device_id)).toBe(true);
    const res = await call(a.access_token);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_token");

    const headers = { authorization: `Bearer ${b.access_token}`, "x-device-fingerprint": fp(2) };
    const r1 = await selfRevoke(jsonReq("/api/v1/devices/self/revoke", undefined, { headers }), noCtx);
    expect(r1.status).toBe(204);
    const r2 = await selfRevoke(jsonReq("/api/v1/devices/self/revoke", undefined, { headers }), noCtx);
    expect(r2.status).toBe(401);
  });

  it("subscription changes are reflected on refresh", async () => {
    const user = await createUser();
    const linked = await link(user);
    let p = verifyEntitlement((await (await call(linked.access_token)).json()) as never).payload;
    expect(p.pro).toBe(false);
    const db = await getDb();
    await db.insert(subscriptions).values({ userId: user.id, status: "trialing", stripeSubscriptionId: "sub_x" });
    p = verifyEntitlement((await (await call(linked.access_token)).json()) as never).payload;
    expect(p.pro).toBe(true);
    expect(p.status).toBe("trialing");
  });

  it("rate limits to 120/hour per device", async () => {
    const user = await createUser();
    const linked = await link(user);
    const { rateLimit } = await import("@/server/rate-limit");
    for (let i = 0; i < 119; i++) await rateLimit(`entitlement:${linked.device_id}`, 120, 3600);
    expect((await call(linked.access_token)).status).toBe(200);
    const res = await call(linked.access_token);
    expect(res.status).toBe(429);
  });
});

describe("health", () => {
  it("returns ok + version", async () => {
    const res = health();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
