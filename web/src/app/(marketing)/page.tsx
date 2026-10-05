import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRightIcon,
  BroadcastIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  GameControllerIcon,
  GhostIcon,
  HeartbeatIcon,
  LockKeyIcon,
  SquaresFourIcon,
  WindowsLogoIcon,
} from "@phosphor-icons/react/ssr";
import { SmartCleanupMock, TreemapMock } from "@/components/marketing/product-mock";
import { button, card } from "@/components/ui/styles";
import { PRICING } from "@/config/plans";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const finds = [
  "Browser caches",
  "GPU shader caches",
  "Discord & Telegram caches",
  "Gradle, Cargo & NuGet caches",
  "Xcode DerivedData",
  "node_modules folders",
  "Old Python venvs",
  "Temporary files",
  "Recycle Bin",
  "Empty folders",
  "Duplicate files",
  "Zombie files",
] as const;

const tools = [
  { title: "node_modules & venv destroyer", body: "Purge every dependency folder below a path in one pass." },
  { title: "Windows Update cleanup", body: "Runs the built-in deep clean (cleanmgr) without the clicking." },
  { title: "Downloads organizer", body: "Sorts Downloads into Images, Installers, Documents and more." },
  { title: "Docker prune", body: "Removes unused containers, networks, images and volumes." },
  { title: "Game save backup", body: "Zips Documents/My Games and LocalLow saves to your Desktop." },
  { title: "OneDrive free-up", body: "Makes synced files online-only to release local space." },
] as const;

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.25fr_1fr] lg:gap-14 lg:pb-28">
          <div className="animate-rise">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-elevated px-3 py-1 text-xs text-fg-secondary">
              <WindowsLogoIcon className="size-3.5 text-accent-400" aria-hidden />
              For Windows 10 and 11
            </p>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[44px] xl:text-[46px]">
              See what fills your drive. <span className="text-accent-400 lg:block">Clear it in one click.</span>
            </h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-fg-secondary">
              DiskScanner Turbo maps every folder on your PC and finds caches, duplicates and forgotten files you can safely
              remove.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/download" className={button({ size: "lg" })}>
                Download free
              </Link>
              <Link href="/pricing" className={button({ variant: "secondary", size: "lg" })}>
                See pricing <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
          <SmartCleanupMock className="animate-rise [animation-delay:120ms]" />
        </div>
      </section>

      {/* What it finds */}
      <section aria-labelledby="finds-heading" className="border-y border-line-subtle bg-elevated/40">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h2 id="finds-heading" className="text-sm font-medium text-fg-muted">
            Smart Cleanup checks these in a single pass
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {finds.map((f) => (
              <li key={f} className="rounded-full border border-line-subtle bg-bg px-3 py-1.5 text-sm text-fg-secondary">
                {f}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Features */}
      <section id="features" aria-labelledby="features-heading" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-2xl">
            <h2 id="features-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Built to answer one question: where did my space go?
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-fg-secondary">
              A scanning engine built on the OS directory cache, a visual map of your disk, and cleanups that know which
              files are safe to delete and which deserve a second look.
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-6">
            <article className={`${card} p-6 lg:col-span-4`}>
              <SquaresFourIcon className="size-6 text-accent-400" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold">Interactive treemap</h3>
              <p className="mt-2 max-w-[52ch] text-fg-secondary">
                Every folder drawn to scale. Click into the biggest block until you find the culprit.
              </p>
              <TreemapMock className="mt-6" />
            </article>

            <article className={`${card} flex flex-col p-6 lg:col-span-2`}>
              <BroadcastIcon className="size-6 text-accent-400" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold">Live scan feedback</h3>
              <p className="mt-2 text-fg-secondary">
                Results stream in as the scan runs, so you see which folder is being read instead of a frozen progress bar.
                Black holes like <code className="rounded-sm bg-surface px-1 text-sm">.git</code> are skipped automatically.
              </p>
              <div aria-hidden className="mt-auto space-y-2 pt-6 font-mono text-xs text-fg-muted">
                <p className="truncate">C:\Users\…\AppData\Local · 18.2 GB</p>
                <p className="truncate">C:\Program Files (x86)\Steam · 212 GB</p>
                <p className="truncate text-accent-400">C:\Users\…\Downloads · scanning</p>
              </div>
            </article>

            <article className={`${card} p-6 lg:col-span-2`}>
              <GameControllerIcon className="size-6 text-violet-400" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold">Game store radar</h3>
              <p className="mt-2 text-fg-secondary">
                Groups installs from Steam, Epic Games, Xbox / Microsoft Store, Riot and Ubisoft, so the 150 GB you forgot
                about has a name.
              </p>
            </article>

            <article className={`${card} p-6 lg:col-span-2`}>
              <CopyIcon className="size-6 text-violet-400" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold">Duplicate finder</h3>
              <p className="mt-2 text-fg-secondary">
                Matches files by size, then confirms with a content hash. Only exact copies are flagged.
              </p>
            </article>

            <article className={`${card} p-6 lg:col-span-2`}>
              <GhostIcon className="size-6 text-violet-400" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold">Zombie files</h3>
              <p className="mt-2 text-fg-secondary">
                Files over 50 MB that nobody has opened or changed in a year. You decide; they go to the Recycle Bin.
              </p>
            </article>

            <article className={`${card} p-6 lg:col-span-3`}>
              <HeartbeatIcon className="size-6 text-success-400" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold">Disk health at a glance</h3>
              <p className="mt-2 text-fg-secondary">
                Reads each drive&apos;s SMART status from Windows, so a failing disk shows up before you lose files on it.
              </p>
            </article>

            <article className={`${card} p-6 lg:col-span-3`}>
              <FileTextIcon className="size-6 text-success-400" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold">Export a report</h3>
              <p className="mt-2 text-fg-secondary">
                Save a detailed text report of any scan to share with IT or keep for later. Free, no account needed.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* How cleanup works */}
      <section aria-labelledby="how-heading" className="border-t border-line-subtle bg-elevated/40">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.3fr] lg:py-24">
          <div>
            <h2 id="how-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
              One click, with a safety net
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-fg-secondary">
              Smart Cleanup sorts what it finds by risk. Caches the system rebuilds on its own are pre-selected. Your own
              files never are.
            </p>
          </div>
          <ol className="grid gap-4">
            {[
              {
                t: "Analyze",
                b: "Known cache locations plus the folder you choose, with a hard time limit so it never hangs on a huge tree.",
              },
              {
                t: "Review",
                b: "Results are grouped and sized. “Safe” groups are ticked; “Review” groups — duplicates, zombies, empty folders — wait for you.",
              },
              {
                t: "Clean",
                b: "Caches are removed permanently. Anything that was yours goes to the Recycle Bin, so you can undo it.",
              },
            ].map((s, i) => (
              <li key={s.t} className="flex gap-4 rounded-lg border border-line-subtle bg-bg p-5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-600/20 text-sm font-semibold text-accent-400">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{s.t}</h3>
                  <p className="mt-1 text-fg-secondary">{s.b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Toolbox */}
      <section aria-labelledby="tools-heading">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <h2 id="tools-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            And a toolbox for the rest
          </h2>
          <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => (
              <li key={t.title} className="border-t border-line pt-5">
                <h3 className="font-semibold">{t.title}</h3>
                <p className="mt-1.5 text-fg-secondary">{t.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Privacy */}
      <section aria-labelledby="privacy-heading" className="border-t border-line-subtle bg-elevated/40">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <LockKeyIcon className="size-7 text-accent-400" aria-hidden />
            <h2 id="privacy-heading" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Your files never leave your PC
            </h2>
          </div>
          <div className="space-y-4 text-lg leading-relaxed text-fg-secondary">
            <p>
              Scanning and cleaning happen locally. With Pro, the app can send a summary to your dashboard — totals and
              category sizes like “browser cache: 3.2 GB”. Never file names, folder names or paths.
            </p>
            <p>
              The app works offline. A Pro license stays valid for up to 7 days without a connection.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section aria-labelledby="cta-heading">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid gap-8 rounded-xl border border-line bg-elevated p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <h2 id="cta-heading" className="text-3xl font-semibold tracking-tight">
                Scan for free. Upgrade when you want the cleanups.
              </h2>
              <ul className="mt-5 grid gap-2 text-fg-secondary sm:grid-cols-2">
                {["Free: scan, map, analyze, export", `Pro: $${PRICING.proMonthly}/mo or $${PRICING.proYearly}/yr`, `${PRICING.trialDays}-day free trial`, "Cancel anytime"].map((x) => (
                  <li key={x} className="flex items-center gap-2">
                    <CheckIcon className="size-4 shrink-0 text-success-400" aria-hidden />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link href="/download" className={button({ size: "lg" })}>
                Download free
              </Link>
              <Link href="/pricing" className={button({ variant: "secondary", size: "lg" })}>
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
