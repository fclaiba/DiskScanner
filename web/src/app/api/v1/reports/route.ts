import { withApi } from "@/server/api";
import { apiError, json, PayloadTooLargeError, readTextLimited } from "@/server/http";
import { authenticateDevice } from "@/server/devices/auth";
import { getAccountPlan } from "@/server/billing/subscriptions";
import { LIMITS, rateLimit } from "@/server/rate-limit";
import { REPORT_MAX_BYTES, reportSchema } from "@/lib/schemas/report";
import { createReport } from "@/server/reports/service";
import { PLAN_FEATURES } from "@/config/plans";

export const POST = withApi("reports.create", async (req) => {
  const auth = await authenticateDevice(req.headers);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message);
  const { device } = auth;

  const { plan } = await getAccountPlan(device.userId);
  if (!PLAN_FEATURES[plan].includes("sync")) {
    return apiError(403, "feature_not_available", "Report sync is part of DiskScanner Turbo Pro.");
  }
  const rl = await rateLimit(`reports:${device.id}`, LIMITS.reports.limit, LIMITS.reports.windowSec);
  if (!rl.ok) return apiError(429, "rate_limited", "Too many reports.", { "Retry-After": String(rl.retryAfter) });

  let text: string;
  try {
    text = await readTextLimited(req, REPORT_MAX_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) return apiError(413, "payload_too_large", "Report body exceeds 32 KB.");
    throw err;
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return apiError(400, "invalid_request", "Body must be valid JSON.");
  }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    return apiError(400, "invalid_request", `${issue?.message ?? "Invalid report"}${where}`);
  }
  const id = await createReport(device, parsed.data);
  return json({ id }, 201);
});
