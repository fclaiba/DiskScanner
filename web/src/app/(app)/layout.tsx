import Link from "next/link";
import type { Metadata } from "next";
import { SignOutIcon } from "@phosphor-icons/react/ssr";
import { Logo } from "@/components/ui/logo";
import { NavLinks } from "@/components/app/nav-links";
import { ResendVerificationForm } from "@/components/forms/account-forms";
import { button } from "@/components/ui/styles";
import { getCurrentSession } from "@/server/auth/current";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Pages call requireSession() themselves (with their own ?next=); the shell
  // only needs the user for the header.
  const session = await getCurrentSession();
  const user = session?.user;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line-subtle bg-elevated/50">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/dashboard" className="rounded-sm" aria-label="Dashboard home">
            <Logo />
          </Link>
          {user && (
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[24ch] truncate text-sm text-fg-muted sm:inline" title={user.email}>
                {user.email}
              </span>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className={button({ variant: "ghost", size: "sm" })}>
                  <SignOutIcon className="size-4" aria-hidden />
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </header>
      {user && !user.emailVerifiedAt && (
        <div className="border-b border-warning/30 bg-warning/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6">
            <p className="text-fg-secondary">
              <strong className="font-medium text-fg">Confirm your email.</strong> We sent a link to {user.email}.
            </p>
            <ResendVerificationForm compact />
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-[200px_1fr] md:py-10">
        <nav aria-label="Dashboard" className="md:sticky md:top-8 md:self-start">
          <NavLinks />
        </nav>
        <main id="main" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
