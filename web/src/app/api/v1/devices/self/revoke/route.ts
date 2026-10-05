import { eq } from "drizzle-orm";
import { withApi } from "@/server/api";
import { apiError, clientIp } from "@/server/http";
import { authenticateDevice } from "@/server/devices/auth";
import { getDb } from "@/server/db/client";
import { devices } from "@/server/db/schema";
import { audit } from "@/server/audit";

export const POST = withApi("devices.self_revoke", async (req) => {
  const auth = await authenticateDevice(req.headers);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message);
  const db = await getDb();
  await db.update(devices).set({ revokedAt: new Date(), tokenHash: null }).where(eq(devices.id, auth.device.id));
  await audit("device.self_revoke", auth.device.userId, { device_id: auth.device.id }, clientIp(req.headers));
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
