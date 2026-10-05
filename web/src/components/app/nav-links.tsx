"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const items = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/devices", label: "Devices" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((it) => {
        const active = it.href === "/dashboard" ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "block whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-surface font-medium text-fg" : "text-fg-secondary hover:bg-surface/60 hover:text-fg",
              )}
            >
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
