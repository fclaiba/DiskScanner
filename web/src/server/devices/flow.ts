import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { deviceAuthorizations, devices, users, type DeviceAuthorization, type User } from "../db/schema";
import { generateUserCode, normalizeUserCode, randomToken, sha256Hex } from "../crypto";
import { audit } from "../audit";
import { env } from "../env";
import { entitlementFor, deviceLimitFor } from "./service";
import type { DeviceAuthorizeInput } from "@/lib/schemas/device";
import type { SignedEntitlement } from "../entitlement/sign";

export const DEVICE_CODE_TTL_SEC = 900;
export const POLL_INTERVAL_SEC = 5;
/** Network jitter allowance when enforcing `interval` between polls. */
export const POLL_TOLERANCE_MS = 500;
export const ACCESS_TOKEN_PREFIX = "dst_";

export interface AuthorizeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "23505") return true;
    e = typeof e === "object" && e !== null ? (e as { cause?: unknown }).cause : undefined;
  }
  return false;
}

/** §1 — start a device authorization. */
export async function startDeviceAuthorization(input: DeviceAuthorizeInput, now = new Date()): Promise<AuthorizeResponse> {
  const db = await getDb();
  const deviceCode = randomToken(32);
  for (let attempt = 0; ; attempt++) {
    const userCode = generateUserCode();
    try {
      await db.insert(deviceAuthorizations).values({
        deviceCodeHash: sha256Hex(deviceCode),
        userCode,
        fingerprint: input.fingerprint,
        name: input.name,
        platform: input.platform,
        appVersion: input.app_version,
        expiresAt: new Date(now.getTime() + DEVICE_CODE_TTL_SEC * 1000),
      });
      const base = `${env.siteUrl}/activate`;
      return {
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: base,
        verification_uri_complete: `${base}?code=${userCode}`,
        expires_in: DEVICE_CODE_TTL_SEC,
        interval: POLL_INTERVAL_SEC,
      };
    } catch (err) {
      // user_code collision (20^8 space) — retry with a new code.
      if (isUniqueViolation(err) && attempt < 5) continue;
      throw err;
    }
  }
}

export type TokenResult =
  | { ok: false; code: "authorization_pending" | "slow_down" | "access_denied" | "expired_token"; message: string }
  | {
      ok: true;
      body: {
        access_token: string;
        token_type: "Bearer";
        device_id: string;
        account: { email: string };
        entitlement: SignedEntitlement;
      };
    };

const MESSAGES = {
  authorization_pending: "Waiting for the user to approve this device.",
  slow_down: "Polling too fast. Increase the interval by 5 seconds.",
  access_denied: "The user denied this device.",
  expired_token: "The device code expired or was already used. Start again.",
} as const;

function fail(code: keyof typeof MESSAGES): TokenResult {
  return { ok: false, code, message: MESSAGES[code] };
}

/** §3 — poll for the token. */
export async function pollDeviceToken(deviceCode: string, now = new Date()): Promise<TokenResult> {
  const db = await getDb();
  const [auth] = await db
    .select()
    .from(deviceAuthorizations)
    .where(eq(deviceAuthorizations.deviceCodeHash, sha256Hex(deviceCode)))
    .limit(1);
  // Unknown codes are reported as expired: old rows are purged by the daily cron.
  if (!auth || auth.status === "consumed" || auth.expiresAt.getTime() <= now.getTime()) return fail("expired_token");

  const last = auth.lastPolledAt?.getTime();
  await db.update(deviceAuthorizations).set({ lastPolledAt: now }).where(eq(deviceAuthorizations.id, auth.id));
  if (last !== undefined && now.getTime() - last < POLL_INTERVAL_SEC * 1000 - POLL_TOLERANCE_MS) return fail("slow_down");

  if (auth.status === "denied") return fail("access_denied");
  if (auth.status === "pending") return fail("authorization_pending");

  // approved → consume exactly once (conditional update guards against races).
  const accessToken = ACCESS_TOKEN_PREFIX + randomToken(32);
  const consumed = await db
    .update(deviceAuthorizations)
    .set({ status: "consumed" })
    .where(and(eq(deviceAuthorizations.id, auth.id), eq(deviceAuthorizations.status, "approved")))
    .returning({ id: deviceAuthorizations.id });
  if (consumed.length === 0 || !auth.deviceId || !auth.userId) return fail("expired_token");

  const [device] = await db
    .update(devices)
    .set({ tokenHash: sha256Hex(accessToken), revokedAt: null, lastSeenAt: now })
    .where(eq(devices.id, auth.deviceId))
    .returning();
  const [user] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
  if (!device || !user) return fail("expired_token");

  return {
    ok: true,
    body: {
      access_token: accessToken,
      token_type: "Bearer",
      device_id: device.id,
      account: { email: user.email },
      entitlement: await entitlementFor(device, user),
    },
  };
}

/** Finds a pending, unexpired authorization by the code typed/linked on /activate. */
export async function findPendingByUserCode(input: string, now = new Date()): Promise<DeviceAuthorization | null> {
  const code = normalizeUserCode(input);
  if (!code) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(deviceAuthorizations)
    .where(
      and(
        eq(deviceAuthorizations.userCode, code),
        eq(deviceAuthorizations.status, "pending"),
        gt(deviceAuthorizations.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Any unexpired authorization for a user code (used to show the outcome on /activate). */
export async function findByUserCode(input: string, now = new Date()): Promise<DeviceAuthorization | null> {
  const code = normalizeUserCode(input);
  if (!code) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(deviceAuthorizations)
    .where(and(eq(deviceAuthorizations.userCode, code), gt(deviceAuthorizations.expiresAt, now)))
    .limit(1);
  return row ?? null;
}

export type ApproveResult =
  | { ok: true; deviceId: string }
  | { ok: false; code: "not_found" | "device_limit"; message: string; limit?: number };

/** §2 — the signed-in user approves. Creates or reuses the device within the plan limit. */
export async function approveDevice(user: User, userCode: string, ip?: string): Promise<ApproveResult> {
  const auth = await findPendingByUserCode(userCode);
  if (!auth) return { ok: false, code: "not_found", message: "This code is invalid or has expired. Start linking again from the app." };
  const db = await getDb();
  const limit = await deviceLimitFor(user.id);

  class LostRace extends Error {}
  let result: ApproveResult;
  try {
    result = await db.transaction(async (tx): Promise<ApproveResult> => {
    // Serialize approvals per user so two tabs can't exceed the limit.
    await tx.execute(sql`select id from users where id = ${user.id} for update`);
    const [existing] = await tx
      .select()
      .from(devices)
      .where(and(eq(devices.userId, user.id), eq(devices.fingerprint, auth.fingerprint)))
      .limit(1);
    const [others] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(devices)
      .where(
        and(
          eq(devices.userId, user.id),
          isNull(devices.revokedAt),
          existing ? ne(devices.id, existing.id) : sql`true`,
        ),
      );
    if ((others?.n ?? 0) >= limit) {
      return {
        ok: false as const,
        code: "device_limit" as const,
        limit,
        message: `Your plan allows ${limit} ${limit === 1 ? "PC" : "PCs"}. Remove one in Devices or upgrade to link this one.`,
      };
    }

    let deviceId: string;
    if (existing) {
      deviceId = existing.id;
      await tx
        .update(devices)
        .set({ name: auth.name, platform: auth.platform, appVersion: auth.appVersion, revokedAt: null })
        .where(eq(devices.id, existing.id));
    } else {
      const [created] = await tx
        .insert(devices)
        .values({
          userId: user.id,
          fingerprint: auth.fingerprint,
          name: auth.name,
          platform: auth.platform,
          appVersion: auth.appVersion,
        })
        .returning({ id: devices.id });
      deviceId = created!.id;
    }
    const updated = await tx
      .update(deviceAuthorizations)
      .set({ status: "approved", userId: user.id, deviceId })
      .where(and(eq(deviceAuthorizations.id, auth.id), eq(deviceAuthorizations.status, "pending")))
      .returning({ id: deviceAuthorizations.id });
    if (updated.length === 0) throw new LostRace();
    return { ok: true as const, deviceId };
    });
  } catch (err) {
    if (err instanceof LostRace) {
      return { ok: false, code: "not_found", message: "This code was already used. Start linking again from the app." };
    }
    throw err;
  }
  if (result.ok) await audit("device.approve", user.id, { device_id: result.deviceId, platform: auth.platform }, ip);
  return result;
}

export async function denyDevice(user: User, userCode: string, ip?: string): Promise<boolean> {
  const auth = await findPendingByUserCode(userCode);
  if (!auth) return false;
  const db = await getDb();
  const rows = await db
    .update(deviceAuthorizations)
    .set({ status: "denied", userId: user.id })
    .where(and(eq(deviceAuthorizations.id, auth.id), eq(deviceAuthorizations.status, "pending")))
    .returning({ id: deviceAuthorizations.id });
  if (rows.length > 0) await audit("device.deny", user.id, { platform: auth.platform }, ip);
  return rows.length > 0;
}
