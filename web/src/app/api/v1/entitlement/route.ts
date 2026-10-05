import { eq } from "drizzle-orm";
import { withApi } from "@/server/api";
import { apiError, json } from "@/server/http";
import { authenticateDevice } from "@/server/devices/auth";
import { entitlementFor, getUserForDevice } from "@/server/devices/service";
import { LIMITS, rateLimit } from "@/server/rate-limit";
import { getDb } from "@/server/db/client";
import { devices } from "@/server/db/schema";
import { appVersionSchema } from "@/lib/schemas/device";

export const GET = withApi("entitlement", async (req) => {
  const auth = await authenticateDevice(req.headers);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message);
  const { device } = auth;
  const rl = await rateLimit(`entitlement:${device.id}`, LIMITS.entitlement.limit, LIMITS.entitlement.windowSec);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Too many entitlement requests.", { "Retry-After": String(rl.retryAfter) });
  }
  const version = appVersionSchema.safeParse(req.headers.get("x-app-version") ?? undefined);
  const db = await getDb();
  const [updated] = await db
    .update(devices)
    .set({ lastSeenAt: new Date(), ...(version.success ? { appVersion: version.data } : {}) })
    .where(eq(devices.id, device.id))
    .returning();
  const user = await getUserForDevice(device);
  return json(await entitlementFor(updated ?? device, user));
});
