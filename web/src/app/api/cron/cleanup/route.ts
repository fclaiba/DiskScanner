import { env } from "@/server/env";
import { apiError, json } from "@/server/http";
import { safeEqualStr } from "@/server/crypto";
import { runCleanup } from "@/server/cleanup";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";

/** Daily retention job; Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  const given = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqualStr(given, `Bearer ${secret}`)) {
    return apiError(401, "unauthorized", "Missing or invalid cron secret.");
  }
  const counts = await runCleanup();
  log.info("cleanup finished", { ...counts });
  return json({ ok: true, deleted: counts });
}
