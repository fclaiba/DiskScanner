import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" className="rounded-sm" aria-label="DiskScanner Turbo home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:pt-16">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
      <footer className="px-4 py-6 text-center text-xs text-fg-muted">
        <Link href="/legal/terms" className="hover:text-fg">Terms</Link>
        <span className="mx-2" aria-hidden>·</span>
        <Link href="/legal/privacy" className="hover:text-fg">Privacy</Link>
      </footer>
    </div>
  );
}
