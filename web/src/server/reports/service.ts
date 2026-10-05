import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { devices, reports, type Device, type Report } from "../db/schema";
import type { ReportInput } from "@/lib/schemas/report";

export async function createReport(device: Device, input: ReportInput): Promise<string> {
  const db = await getDb();
  const [row] = await db
    .insert(reports)
    .values({
      deviceId: device.id,
      userId: device.userId,
      kind: input.kind,
      totalBytes: input.total_bytes,
      fileCount: input.file_count,
      reclaimableBytes: input.reclaimable_bytes,
      freedBytes: input.freed_bytes,
      durationMs: input.duration_ms,
      appVersion: input.app_version,
      categories: input.categories,
    })
    .returning({ id: reports.id });
  return row!.id;
}

export interface DashboardStats {
  freedAllTime: number;
  freed30d: number;
  scans: number;
  cleanups: number;
}

export async function getStats(userId: string, now = new Date()): Promise<DashboardStats> {
  const db = await getDb();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      freedAllTime: sql<string>`coalesce(sum(${reports.freedBytes}), 0)`,
      freed30d: sql<string>`coalesce(sum(${reports.freedBytes}) filter (where ${reports.createdAt} >= ${since.toISOString()}::timestamptz), 0)`,
      scans: sql<number>`(count(*) filter (where ${reports.kind} = 'scan'))::int`,
      cleanups: sql<number>`(count(*) filter (where ${reports.kind} = 'cleanup'))::int`,
    })
    .from(reports)
    .where(eq(reports.userId, userId));
  return {
    freedAllTime: Number(row?.freedAllTime ?? 0),
    freed30d: Number(row?.freed30d ?? 0),
    scans: row?.scans ?? 0,
    cleanups: row?.cleanups ?? 0,
  };
}

export type RecentReport = Report & { deviceName: string | null };

export async function recentReports(userId: string, limit = 10): Promise<RecentReport[]> {
  const db = await getDb();
  const rows = await db
    .select({ report: reports, deviceName: devices.name })
    .from(reports)
    .leftJoin(devices, eq(devices.id, reports.deviceId))
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.report, deviceName: r.deviceName }));
}
