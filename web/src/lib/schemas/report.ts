import { z } from "zod";
import { appVersionSchema } from "./device";

const nonNegInt = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const REPORT_MAX_BYTES = 32 * 1024;

/**
 * POST /api/v1/reports — aggregate summaries only. `.strict()` everywhere so
 * any extra field (e.g. a path or file name) is rejected rather than ignored.
 */
export const reportCategorySchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]{1,40}$/),
    bytes: nonNegInt,
    count: nonNegInt,
  })
  .strict();

export const reportSchema = z
  .object({
    kind: z.enum(["scan", "cleanup"]),
    total_bytes: nonNegInt,
    file_count: nonNegInt,
    reclaimable_bytes: nonNegInt.default(0),
    freed_bytes: nonNegInt.default(0),
    duration_ms: nonNegInt,
    app_version: appVersionSchema,
    categories: z.array(reportCategorySchema).max(50).default([]),
  })
  .strict();

export type ReportInput = z.infer<typeof reportSchema>;
