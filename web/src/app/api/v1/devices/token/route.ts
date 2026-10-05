import { withApi } from "@/server/api";
import { apiError, json, PayloadTooLargeError, readJson } from "@/server/http";
import { deviceTokenSchema } from "@/lib/schemas/device";
import { pollDeviceToken } from "@/server/devices/flow";

export const POST = withApi("devices.token", async (req) => {
  let body: unknown;
  try {
    body = await readJson(req, 4 * 1024);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) return apiError(400, "invalid_request", "Request body too large.");
    throw err;
  }
  const parsed = deviceTokenSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "invalid_request", "device_code is required.");
  const result = await pollDeviceToken(parsed.data.device_code);
  if (!result.ok) return apiError(400, result.code, result.message);
  return json(result.body);
});
