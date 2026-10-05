import type { Metadata } from "next";
import { DesktopIcon } from "@phosphor-icons/react/ssr";
import { ActivateForm } from "@/components/forms/activate-form";
import { Alert } from "@/components/ui/alert";
import { button, input, label } from "@/components/ui/styles";
import { requireSession } from "@/server/auth/current";
import { findByUserCode } from "@/server/devices/flow";
import Link from "next/link";
import { countActiveDevices, deviceLimitFor } from "@/server/devices/service";
import { formatDateTime } from "@/lib/format";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = {
  title: "Link a PC",
  description: "Approve a DiskScanner Turbo installation for your account.",
  robots: { index: false },
};

const PLATFORM: Record<string, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };

function CodeEntry({ code, error }: { code?: string; error?: string }) {
  return (
    <form method="get" action="/activate" className="grid gap-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-2">
        <label htmlFor="code" className={label}>
          Code shown in the app
        </label>
        <input
          id="code"
          name="code"
          defaultValue={code}
          placeholder="XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          maxLength={9}
          className={`${input} text-center font-mono text-lg uppercase tracking-[0.3em]`}
        />
      </div>
      <button type="submit" className={button({ size: "lg" })}>
        Continue
      </button>
    </form>
  );
}

export default async function ActivatePage({ searchParams }: PageProps<"/activate">) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code.trim().slice(0, 16) : "";
  const { user } = await requireSession(code ? `/activate?code=${encodeURIComponent(code)}` : "/activate");

  if (!code) {
    return (
      <AuthCard title="Link a PC" subtitle="Enter the 8-letter code shown in DiskScanner Turbo.">
        <CodeEntry />
      </AuthCard>
    );
  }

  const found = await findByUserCode(code);
  // Already decided by this user (e.g. after submitting): show the outcome.
  if (found && found.status !== "pending" && found.userId === user.id) {
    const approved = found.status !== "denied";
    return (
      <AuthCard title={approved ? "PC linked" : "Request rejected"}>
        <Alert tone={approved ? "success" : "info"} live>
          {approved
            ? `${found.name} is linked to ${user.email}. Return to the app — it finishes signing in within a few seconds.`
            : "The app was told not to link. You can close this page."}
        </Alert>
        <Link href="/dashboard/devices" className={button({ variant: "secondary", className: "mt-6 w-full" })}>
          View your devices
        </Link>
      </AuthCard>
    );
  }
  const auth = found?.status === "pending" ? found : null;
  if (!auth) {
    return (
      <AuthCard title="Link a PC" subtitle="Enter the 8-letter code shown in DiskScanner Turbo.">
        <CodeEntry code={code} error="That code is invalid or expired. Codes last 15 minutes — start linking again from the app." />
      </AuthCard>
    );
  }

  const [used, limit] = await Promise.all([countActiveDevices(user.id), deviceLimitFor(user.id)]);
  return (
    <AuthCard title="Link this PC to your account?" subtitle={<>Signed in as <strong className="text-fg">{user.email}</strong></>}>
      <div className="mb-6 flex items-center gap-4 rounded-lg border border-line-subtle bg-bg p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface">
          <DesktopIcon className="size-6 text-accent-400" aria-hidden />
        </span>
        <dl className="min-w-0 text-sm">
          <dt className="sr-only">Name</dt>
          <dd className="truncate font-semibold text-fg">{auth.name}</dd>
          <dt className="sr-only">Details</dt>
          <dd className="text-fg-muted">
            {PLATFORM[auth.platform] ?? auth.platform} · v{auth.appVersion} · requested {formatDateTime(auth.createdAt)}
          </dd>
        </dl>
      </div>
      <p className="mb-2 font-mono text-sm tracking-widest text-fg-secondary">Code: {auth.userCode}</p>
      <p className="mb-6 text-sm text-fg-muted">
        Only approve if this code matches the one in your app. {used} of {limit} {limit === 1 ? "PC" : "PCs"} linked on your
        plan.
      </p>
      <ActivateForm userCode={auth.userCode} />
    </AuthCard>
  );
}
