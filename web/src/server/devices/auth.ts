import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { devices, type Device } from "../db/schema";
import { safeEqualStr, sha256Hex } from "../crypto";
import { ACCESS_TOKEN_PREFIX } from "./flow";

export type DeviceAuthResult =
  | { ok: true; device: Device }
  | { ok: false; status: 401 | 403; code: "invalid_token" | "fingerprint_mismatch"; message: string };

/** Validates `Authorization: Bearer dst_…` + `X-Device-Fingerprint`. */
export async function authenticateDevice(headers: Headers): Promise<DeviceAuthResult> {
  const auth = headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  const token = m?.[1];
  if (!token || !token.startsWith(ACCESS_TOKEN_PREFIX) || token.length > 128) {
    return { ok: false, status: 401, code: "invalid_token", message: "Missing or invalid access token." };
  }
  const db = await getDb();
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.tokenHash, sha256Hex(token)), isNull(devices.revokedAt)))
    .limit(1);
  if (!device) {
    return { ok: false, status: 401, code: "invalid_token", message: "This device is not linked or was revoked." };
  }
  const fp = (headers.get("x-device-fingerprint") ?? "").trim().toLowerCase();
  if (!safeEqualStr(fp, device.fingerprint)) {
    return { ok: false, status: 403, code: "fingerprint_mismatch", message: "This token belongs to a different machine." };
  }
  return { ok: true, device };
}
