import Link from "next/link";
import type { Metadata } from "next";
import { DesktopIcon, DownloadSimpleIcon, LinkSimpleIcon } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/app/page-header";
import { PlanCard } from "@/components/app/plan-card";
import { Alert } from "@/components/ui/alert";
import { button, card } from "@/components/ui/styles";
import { requireSession } from "@/server/auth/current";
import { getAccountPlan } from "@/server/billing/subscriptions";
import { getStats, recentReports, type RecentReport } from "@/server/reports/service";
import { listDevices } from "@/server/devices/service";
import { categoryLabel, formatBytes, formatDateTime, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={cn(card, "p-5")}>
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</dd>
      {sub && <dd className="mt-1 text-xs text-fg-muted">{sub}</dd>}
    </div>
  );
}

function ReportRow({ r }: { r: RecentReport }) {
  const cats = [...r.categories].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  const total = cats.reduce((s, c) => s + c.bytes, 0) || 1;
  const headline = r.kind === "cleanup" ? `Freed ${formatBytes(r.freedBytes)}` : `Scanned ${formatBytes(r.totalBytes)}`;
  return (
    <li className="grid gap-3 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium">
          <span className={cn("mr-2 rounded-sm px-1.5 py-0.5 text-xs font-medium", r.kind === "cleanup" ? "bg-success/15 text-success-400" : "bg-accent/15 text-accent-400")}>
            {r.kind === "cleanup" ? "Cleanup" : "Scan"}
          </span>
          {headline}
        </p>
        <p className="text-sm text-fg-muted">
          {r.deviceName ?? "Removed PC"} · {formatDateTime(r.createdAt)}
        </p>
      </div>
      <p className="text-sm text-fg-secondary">
        {r.fileCount.toLocaleString("en-US")} files · {formatBytes(r.reclaimableBytes)} reclaimable · {formatDuration(r.durationMs)}
      </p>
      {cats.length > 0 && (
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
            {cats.map((c, i) => (
              <span key={c.key} className={cn("h-full", ["bg-accent", "bg-violet", "bg-success", "bg-warning", "bg-accent-400"][i])} style={{ width: `${(c.bytes / total) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
            {cats.map((c, i) => (
              <li key={c.key} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", ["bg-accent", "bg-violet", "bg-success", "bg-warning", "bg-accent-400"][i])} aria-hidden />
                {categoryLabel(c.key)} <span className="tabular-nums text-fg-secondary">{formatBytes(c.bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function EmptyState({ hasDevices, pro }: { hasDevices: boolean; pro: boolean }) {
  const steps = [
    { icon: DownloadSimpleIcon, title: "Download the app", body: "Get DiskScanner Turbo for Windows 10/11.", done: hasDevices },
    { icon: LinkSimpleIcon, title: "Link it to this account", body: "In the app, start linking and approve the code here.", done: hasDevices },
    {
      icon: DesktopIcon,
      title: "Run a scan or cleanup",
      body: pro ? "Summaries appear here automatically after each run." : "With Pro, each run's summary is synced here.",
      done: false,
    },
  ];
  return (
    <div className={cn(card, "p-6 sm:p-8")}>
      <h2 className="text-lg font-semibold">No reports yet</h2>
      <p className="mt-1.5 max-w-[60ch] text-fg-secondary">
        Your history and GB-freed totals show up once the desktop app is linked. Only sizes and counts are sent — never file
        names or paths.
      </p>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-lg border border-line-subtle bg-bg p-4">
            <s.icon className={cn("size-6", s.done ? "text-success-400" : "text-accent-400")} aria-hidden />
            <p className="mt-3 text-sm font-semibold">
              {i + 1}. {s.title} {s.done && <span className="sr-only">(done)</span>}
            </p>
            <p className="mt-1 text-sm text-fg-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/download" className={button()}>
          Download the app
        </Link>
        <Link href="/activate" className={button({ variant: "secondary" })}>
          I have a code
        </Link>
      </div>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { user } = await requireSession("/dashboard");
  const sp = await searchParams;
  const [plan, stats, reports, devices] = await Promise.all([
    getAccountPlan(user.id),
    getStats(user.id),
    recentReports(user.id, 10),
    listDevices(user.id),
  ]);

  return (
    <>
      <PageHeader title="Overview" description="Your plan, linked PCs and what DiskScanner Turbo has reclaimed." />
      {sp.welcome && (
        <Alert tone="success" className="mb-6" title="Account created">
          Next: download the app and link it to this account.
        </Alert>
      )}
      <div className="grid gap-6">
        <PlanCard plan={plan} />

        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat label="Freed all-time" value={formatBytes(stats.freedAllTime)} sub={`${stats.cleanups} ${stats.cleanups === 1 ? "cleanup" : "cleanups"}`} />
          <Stat label="Freed last 30 days" value={formatBytes(stats.freed30d)} />
          <Stat label="Scans" value={stats.scans.toLocaleString("en-US")} sub={`${devices.length} linked ${devices.length === 1 ? "PC" : "PCs"}`} />
        </dl>

        {reports.length === 0 ? (
          <EmptyState hasDevices={devices.length > 0} pro={plan.pro} />
        ) : (
          <section aria-labelledby="recent-heading" className={card}>
            <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
              <h2 id="recent-heading" className="font-semibold">
                Recent activity
              </h2>
              <span className="text-sm text-fg-muted">Last {reports.length}</span>
            </div>
            <ul className="divide-y divide-line-subtle">
              {reports.map((r) => (
                <ReportRow key={r.id} r={r} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
