import Link from "next/link";
import type { Metadata } from "next";
import { DesktopIcon } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/app/page-header";
import { button, card } from "@/components/ui/styles";
import { requireSession } from "@/server/auth/current";
import { listDevices, deviceLimitFor } from "@/server/devices/service";
import { revokeDeviceAction } from "@/app/actions/account";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Devices" };

const PLATFORM: Record<string, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };

export default async function DevicesPage() {
  const { user } = await requireSession("/dashboard/devices");
  const [devices, limit] = await Promise.all([listDevices(user.id), deviceLimitFor(user.id)]);
  return (
    <>
      <PageHeader
        title="Devices"
        description={`${devices.length} of ${limit} ${limit === 1 ? "PC" : "PCs"} linked on your plan.`}
        actions={
          <Link href="/activate" className={button({ variant: "secondary" })}>
            Enter a link code
          </Link>
        }
      />
      {devices.length === 0 ? (
        <div className={cn(card, "p-8 text-center")}>
          <DesktopIcon className="mx-auto size-8 text-fg-muted" aria-hidden />
          <h2 className="mt-3 font-semibold">No PCs linked</h2>
          <p className="mx-auto mt-1.5 max-w-[48ch] text-sm text-fg-secondary">
            Open DiskScanner Turbo on your PC and start linking. You&apos;ll approve it on this site with a short code.
          </p>
          <Link href="/download" className={button({ className: "mt-5" })}>
            Download the app
          </Link>
        </div>
      ) : (
        <ul className={cn(card, "divide-y divide-line-subtle")}>
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface">
                <DesktopIcon className="size-5 text-accent-400" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.name}</p>
                <p className="text-sm text-fg-muted">
                  {PLATFORM[d.platform] ?? d.platform} · v{d.appVersion} · last seen{" "}
                  {d.lastSeenAt ? formatDateTime(d.lastSeenAt) : "never"} · linked {formatDate(d.createdAt)}
                </p>
              </div>
              <form action={revokeDeviceAction}>
                <input type="hidden" name="device_id" value={d.id} />
                <button type="submit" className={button({ variant: "danger", size: "sm" })} aria-label={`Remove ${d.name}`}>
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-fg-muted">
        Removing a PC signs it out immediately; it returns to the free plan the next time it checks in.
      </p>
    </>
  );
}
