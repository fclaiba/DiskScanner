import { withApi } from "@/server/api";
import { apiError, clientIp, json, PayloadTooLargeError, readJson } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";
import { deviceAuthorizeSchema } from "@/lib/schemas/device";
import { startDeviceAuthorization } from "@/server/devices/flow";

export const POST = withApi("devices.authorize", async (req) => {
  const ip = clientIp(req.headers);
  const rl = await rateLimit(`dev-authorize:${ip}`, LIMITS.deviceAuthorize.limit, LIMITS.deviceAuthorize.windowSec);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Too many link attempts from this network. Try again later.", {
      "Retry-After": String(rl.retryAfter),
    });
  }
  let body: unknown;
  try {
    body = await readJson(req, 4 * 1024);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) return apiError(400, "invalid_request", "Request body too large.");
    throw err;
  }
  const parsed = deviceAuthorizeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid request body.");
  }
  return json(await startDeviceAuthorization(parsed.data));
});
