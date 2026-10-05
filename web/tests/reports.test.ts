import { beforeEach, describe, expect, it } from "vitest";
import { POST as reportsPost } from "@/app/api/v1/reports/route";
import { approveDevice } from "@/server/devices/flow";
import { startDeviceAuthorization, pollDeviceToken } from "@/server/devices/flow";
import { getStats, recentReports } from "@/server/reports/service";
import { getDb } from "@/server/db/client";
import { reports } from "@/server/db/schema";
import { createUser, fp, jsonReq, noCtx, resetDb } from "./helpers";
import type { SubscriptionStatus } from "@/config/plans";

const valid = {
  kind: "cleanup",
  total_bytes: 500_000_000_000,
  file_count: 1_234_567,
  reclaimable_bytes: 12_000_000_000,
  freed_bytes: 9_000_000_000,
  duration_ms: 42_000,
  app_version: "2.0.0",
  categories: [
    { key: "browser_cache", bytes: 5_000_000_000, count: 100 },
    { key: "node_modules", bytes: 4_000_000_000, count: 12 },
  ],
};

async function linkedDevice(status: SubscriptionStatus = "active") {
  const user = await createUser({ status });
  const a = await startDeviceAuthorization({ fingerprint: fp(1), name: "PC", platform: "windows", app_version: "2.0.0" });
  await approveDevice(user, a.user_code);
  const t = await pollDeviceToken(a.device_code);
  if (!t.ok) throw new Error("link failed");
  return { user, token: t.body.access_token, deviceId: t.body.device_id };
}

const send = (token: string, body: unknown, extra: Record<string, string> = {}) =>
  reportsPost(
    jsonReq("/api/v1/reports", body, {
      headers: { authorization: `Bearer ${token}`, "x-device-fingerprint": fp(1), ...extra },
    }),
    noCtx,
  );

const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("POST /api/v1/reports", () => {
  beforeEach(resetDb);

  it("stores a valid report (201) and aggregates stats", async () => {
    const { token, user } = await linkedDevice();
    const res = await send(token, valid);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await send(token, { ...valid, kind: "scan", freed_bytes: 0 })).status).toBe(201);
    // minimal body: optional fields default to 0 / []
    const minimal = { kind: "scan", total_bytes: 1, file_count: 1, duration_ms: 1, app_version: "2.0.0" };
    expect((await send(token, minimal)).status).toBe(201);

    const stats = await getStats(user.id);
    expect(stats.freedAllTime).toBe(9_000_000_000);
    expect(stats.freed30d).toBe(9_000_000_000);
    expect(stats.scans).toBe(2);
    expect(stats.cleanups).toBe(1);
    const recent = await recentReports(user.id);
    expect(recent).toHaveLength(3);
    expect(recent.find((r) => r.kind === "cleanup")!.categories).toHaveLength(2);
    expect(recent[0]!.deviceName).toBe("PC");

    // bigint round-trip beyond 2^32
    const db = await getDb();
    const rows = await db.select().from(reports);
    expect(rows.some((r) => r.totalBytes === 500_000_000_000)).toBe(true);
  });

  it("old reports fall outside the 30-day window", async () => {
    const { user, deviceId } = await linkedDevice();
    const db = await getDb();
    await db.insert(reports).values({
      deviceId,
      userId: user.id,
      kind: "cleanup",
      totalBytes: 1,
      fileCount: 1,
      reclaimableBytes: 0,
      freedBytes: 1000,
      durationMs: 1,
      appVersion: "1.0.0",
      createdAt: new Date(Date.now() - 40 * 86400_000),
    });
    const stats = await getStats(user.id);
    expect(stats.freedAllTime).toBe(1000);
    expect(stats.freed30d).toBe(0);
  });

  it("rejects extra fields (paths, names) and invalid values with 400 invalid_request", async () => {
    const { token } = await linkedDevice();
    const bad: unknown[] = [
      { ...valid, path: "C:\\Users\\me\\secret" },
      { ...valid, categories: [{ key: "browser_cache", bytes: 1, count: 1, path: "C:\\x" }] },
      { ...valid, categories: [{ key: "Browser Cache", bytes: 1, count: 1 }] },
      { ...valid, categories: [{ key: "k".repeat(41), bytes: 1, count: 1 }] },
      { ...valid, categories: Array.from({ length: 51 }, (_, i) => ({ key: `c${i}`, bytes: 1, count: 1 })) },
      { ...valid, total_bytes: -1 },
      { ...valid, total_bytes: 1.5 },
      { ...valid, total_bytes: Number.MAX_SAFE_INTEGER + 2 },
      { ...valid, kind: "delete" },
      { ...valid, app_version: "" },
      "not json at all",
    ];
    for (const b of bad) {
      const res = await send(token, b);
      expect(res.status, JSON.stringify(b).slice(0, 80)).toBe(400);
      expect(await code(res)).toBe("invalid_request");
    }
  });

  it("413 payload_too_large above 32 KB", async () => {
    const { token } = await linkedDevice();
    const big = JSON.stringify({ ...valid, padding: "x".repeat(33 * 1024) });
    const res = await send(token, big);
    expect(res.status).toBe(413);
    expect(await code(res)).toBe("payload_too_large");
    // declared content-length is enough to reject
    const res2 = await send(token, valid, { "content-length": String(40 * 1024) });
    expect(res2.status).toBe(413);
  });

  it("403 feature_not_available for free accounts", async () => {
    const { token } = await linkedDevice("none");
    const res = await send(token, valid);
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("feature_not_available");
    const { token: t2 } = await (async () => {
      await resetDb();
      return linkedDevice("canceled");
    })();
    expect((await send(t2, valid)).status).toBe(403);
  });

  it("401 without a valid token, 403 on fingerprint mismatch", async () => {
    const { token } = await linkedDevice();
    expect((await send("dst_bad", valid)).status).toBe(401);
    expect((await send(token, valid, { "x-device-fingerprint": fp(7) })).status).toBe(403);
  });

  it("rate limits to 60/hour per device", async () => {
    const { token } = await linkedDevice();
    for (let i = 0; i < 60; i++) expect((await send(token, valid)).status).toBe(201);
    const res = await send(token, valid);
    expect(res.status).toBe(429);
    expect(await code(res)).toBe("rate_limited");
  });
});
