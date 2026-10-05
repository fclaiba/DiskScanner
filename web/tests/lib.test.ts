import { describe, expect, it } from "vitest";
import { z } from "zod";
import { categoryLabel, formatBytes, formatDate, formatDateTime, formatDuration } from "@/lib/format";
import { fieldErrorsFrom } from "@/lib/form-state";
import { cn } from "@/lib/cn";
import { isProStatus, planForStatus, PLAN_FEATURES, DEVICE_LIMITS } from "@/config/plans";

describe("lib helpers", () => {
  it("formats bytes in binary units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(19e9)).toBe("17.7 GB");
    expect(formatBytes(812e9)).toBe("756 GB");
  });
  it("formats dates and durations", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("2030-01-01T12:00:00Z")).toMatch(/Jan 1, 2030/);
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime(new Date("2030-01-01T12:00:00Z"))).toMatch(/Jan 1/);
    expect(formatDuration(500)).toBe("500 ms");
    expect(formatDuration(21_000)).toBe("21s");
    expect(formatDuration(125_000)).toBe("2m 5s");
  });
  it("labels categories", () => {
    expect(categoryLabel("browser_cache")).toBe("Browser caches");
    expect(categoryLabel("some_new_key")).toBe("Some new key");
  });
  it("maps zod errors to fields and joins classes", () => {
    const r = z.object({ a: z.string().min(2), b: z.string() }).safeParse({ a: "x", b: 1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrorsFrom(r.error))).toEqual(["a", "b"]);
    expect(cn("a", false, null, "b")).toBe("a b");
  });
  it("plan rules match the contract", () => {
    expect(["trialing", "active", "past_due"].every((s) => isProStatus(s as never))).toBe(true);
    expect(["none", "canceled", "incomplete", "unpaid"].some((s) => isProStatus(s as never))).toBe(false);
    expect(planForStatus("past_due")).toBe("pro");
    expect(PLAN_FEATURES).toEqual({ free: ["scan"], pro: ["scan", "cleanup", "sync"] });
    expect(DEVICE_LIMITS).toEqual({ free: 1, pro: 3 });
  });
});
