import { z } from "zod";

export const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/, "fingerprint must be 64 lowercase hex chars");

export const appVersionSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[0-9A-Za-z.+_-]+$/, "invalid app_version");

export const platformSchema = z.enum(["windows", "macos", "linux"]);

/** POST /api/v1/devices/authorize */
export const deviceAuthorizeSchema = z.object({
  fingerprint: fingerprintSchema,
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    // No control characters in a name that is rendered in the web UI.
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "invalid name"),
  platform: platformSchema,
  app_version: appVersionSchema,
});
export type DeviceAuthorizeInput = z.infer<typeof deviceAuthorizeSchema>;

/** POST /api/v1/devices/token */
export const deviceTokenSchema = z.object({
  device_code: z.string().min(32).max(128),
});

/** /activate form */
export const userCodeFormSchema = z.object({
  user_code: z.string().trim().min(8).max(16),
});
