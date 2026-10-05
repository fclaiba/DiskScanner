import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";
import { button } from "@/components/ui/styles";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <Link href="/" className="inline-block rounded-sm" aria-label="DiskScanner Turbo home">
          <Logo />
        </Link>
        <p className="mt-10 font-mono text-sm text-accent-400">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">This page isn&apos;t on the disk</h1>
        <p className="mt-3 text-fg-secondary">The link may be old, or the page moved. Try one of these instead.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className={button()}>
            Home
          </Link>
          <Link href="/dashboard" className={button({ variant: "secondary" })}>
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
