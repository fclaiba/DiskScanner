import Link from "next/link";
import { ListIcon, XIcon } from "@phosphor-icons/react/ssr";
import { Logo } from "@/components/ui/logo";
import { button } from "@/components/ui/styles";
import { marketingNav } from "@/config/site";

/** Static header (no session lookup) so marketing pages stay statically rendered. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line-subtle bg-bg/85 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-bg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="rounded-sm" aria-label="DiskScanner Turbo home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {marketingNav.map((item) => (
            <Link key={item.href} href={item.href} className={button({ variant: "ghost", size: "sm" })}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className={button({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link href="/download" className={button({ size: "sm" })}>
            Download free
          </Link>
        </div>
        {/* Mobile menu: native <details>, works without JavaScript. */}
        <details className="group relative md:hidden">
          <summary
            className={button({ variant: "ghost", size: "sm", className: "list-none [&::-webkit-details-marker]:hidden" })}
            aria-label="Menu"
          >
            <ListIcon className="size-5 group-open:hidden" aria-hidden />
            <XIcon className="hidden size-5 group-open:block" aria-hidden />
          </summary>
          <div className="absolute right-0 top-12 w-60 rounded-lg border border-line bg-elevated p-2 shadow-lg">
            <nav aria-label="Mobile" className="flex flex-col">
              {marketingNav.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-sm px-3 py-2.5 text-fg-secondary hover:bg-surface hover:text-fg">
                  {item.label}
                </Link>
              ))}
              <Link href="/login" className="rounded-sm px-3 py-2.5 text-fg-secondary hover:bg-surface hover:text-fg">
                Sign in
              </Link>
              <Link href="/download" className={button({ size: "md", className: "mt-2" })}>
                Download free
              </Link>
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
