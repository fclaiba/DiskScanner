"use client";

// Last-resort boundary (replaces the root layout); styled with the same theme tokens.
import "./globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">DiskScanner Turbo is having trouble</h1>
          <p className="mt-3 text-fg-secondary">Please try again in a moment.</p>
          <button type="button" onClick={reset} className="mt-6 rounded-md bg-accent-600 px-4 py-2 font-medium text-white">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
