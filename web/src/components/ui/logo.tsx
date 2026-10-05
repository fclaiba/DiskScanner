import { cn } from "@/lib/cn";

/** Hard drive with speed lines. Colors come from theme tokens via currentColor/classes. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect x="9" y="7" width="20" height="18" rx="5" className="fill-accent-600" />
      <rect x="12.5" y="18.5" width="9" height="2.5" rx="1.25" className="fill-white/85" />
      <circle cx="25" cy="19.75" r="1.6" className="fill-success-400" />
      <path d="M12.5 12h13" strokeWidth="2" strokeLinecap="round" className="stroke-white/35" />
      <path d="M2 11h5M4 16h3.5M2 21h5" strokeWidth="2" strokeLinecap="round" className="stroke-accent-400" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight text-fg", className)}>
      <LogoMark />
      <span>
        DiskScanner <span className="text-accent-400">Turbo</span>
      </span>
    </span>
  );
}
