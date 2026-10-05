import Link from "next/link";
import type { Metadata } from "next";
import { DownloadSimpleIcon, InfoIcon, WindowsLogoIcon } from "@phosphor-icons/react/ssr";
import { button, card, link } from "@/components/ui/styles";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Download",
  description: "Download DiskScanner Turbo for Windows 10 and 11 (64-bit). Free to scan and analyze.",
  alternates: { canonical: "/download" },
  openGraph: { title: "Download · DiskScanner Turbo", url: "/download" },
};

const requirements = [
  ["Operating system", "Windows 10 or Windows 11, 64-bit (x64)"],
  ["Install", "None — a single portable .exe you can run from anywhere"],
  ["Display", "Uses the Microsoft Edge WebView2 runtime, included with Windows 10/11"],
  ["Network", "Only needed to link an account and refresh your license"],
] as const;

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6 md:pt-20">
      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Download DiskScanner Turbo</h1>
          <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-fg-secondary">
            A single portable .exe. No installer, no bundled extras. Scanning and analysis are free; link your account
            inside the app to unlock Pro.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href={site.downloadUrl} className={button({ size: "lg" })} rel="noopener">
              <DownloadSimpleIcon className="size-5" aria-hidden />
              Download for Windows
            </a>
            <span className="inline-flex items-center gap-2 text-sm text-fg-muted">
              <WindowsLogoIcon className="size-4" aria-hidden /> Windows 10/11 · x64
            </span>
          </div>

          <ol className="mt-12 space-y-5">
            {[
              ["Run DiskScannerTurbo.exe", "It opens as a normal desktop window. Pick a drive or folder and start a scan."],
              [
                "Link your account (optional)",
                "Start linking from the app. It shows a short code and opens this site — sign in and approve the PC.",
              ],
              ["Clean up", "With Pro active, Smart Cleanup and every one-click tool are unlocked on that PC."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-sm font-semibold text-fg-secondary">
                  {i + 1}
                </span>
                <div>
                  <h2 className="font-semibold">{t}</h2>
                  <p className="mt-1 text-fg-secondary">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-5">
          <section aria-labelledby="req-heading" className={cn(card, "p-6")}>
            <h2 id="req-heading" className="font-semibold">
              System requirements
            </h2>
            <dl className="mt-4 divide-y divide-line-subtle text-sm">
              {requirements.map(([k, v]) => (
                <div key={k} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className="text-fg-secondary">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="smartscreen-heading" className="rounded-lg border border-warning/30 bg-warning/5 p-6">
            <h2 id="smartscreen-heading" className="flex items-center gap-2 font-semibold">
              <InfoIcon className="size-5 text-warning-400" aria-hidden />
              Seeing “Windows protected your PC”?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
              Microsoft Defender SmartScreen warns about apps that haven&apos;t built up download reputation yet. If you
              downloaded the file from this page, click <strong className="text-fg">More info</strong>, then{" "}
              <strong className="text-fg">Run anyway</strong>. The warning goes away as more people install the app.
            </p>
          </section>

          <p className="text-sm text-fg-muted">
            Already have the app? <Link href="/activate" className={link}>Enter a link code</Link> or{" "}
            <Link href="/pricing" className={link}>compare plans</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
