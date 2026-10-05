"use client";

import Link from "next/link";
import { button } from "@/components/ui/styles";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-[70dvh] place-items-center px-4">
      <div role="alert" className="max-w-md text-center">
        <p className="font-mono text-sm text-danger-400">Error</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-fg-secondary">
          The problem was logged. Try again, and if it keeps happening contact support
          {error.digest ? (
            <>
              {" "}
              with reference <code className="rounded-sm bg-surface px-1 text-sm">{error.digest}</code>
            </>
          ) : null}
          .
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className={button()}>
            Try again
          </button>
          <Link href="/" className={button({ variant: "secondary" })}>
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
