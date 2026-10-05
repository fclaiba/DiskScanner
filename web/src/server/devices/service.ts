import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { devices, users, type Device, type User } from "../db/schema";
import { getAccountPlan } from "../billing/subscriptions";
import { buildEntitlementPayload, signEntitlement, type SignedEntitlement } from "../entitlement/sign";
import { audit } from "../audit";
import { DEVICE_LIMITS } from "@/config/plans";

export async function listDevices(userId: string): Promise<Device[]> {
  const db = await getDb();
  return db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)))
    .orderBy(desc(sql`coalesce(${devices.lastSeenAt}, ${devices.createdAt})`));
}

export async function countActiveDevices(userId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(devices)
    .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));
  return row?.n ?? 0;
}

export async function deviceLimitFor(userId: string): Promise<number> {
  const { plan } = await getAccountPlan(userId);
  return DEVICE_LIMITS[plan];
}

/** Revoke from the web dashboard. Returns false if not found / not owned. */
export async function revokeDevice(userId: string, deviceId: string, ip?: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(devices)
    .set({ revokedAt: new Date(), tokenHash: null })
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId), isNull(devices.revokedAt)))
    .returning({ id: devices.id });
  if (rows.length === 0) return false;
  await audit("device.revoke", userId, { device_id: deviceId }, ip);
  return true;
}

export async function entitlementFor(device: Device, user: User): Promise<SignedEntitlement> {
  const { status, subscription } = await getAccountPlan(user.id);
  return signEntitlement(
    buildEntitlementPayload({
      deviceId: device.id,
      fingerprint: device.fingerprint,
      email: user.email,
      status,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    }),
  );
}

export async function getUserForDevice(device: Device): Promise<User> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, device.userId)).limit(1);
  if (!u) throw new Error("device owner missing");
  return u;
}
