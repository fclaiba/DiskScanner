import { cn } from "@/lib/cn";

// Code-built illustration of the desktop app's Smart Cleanup screen. Group
// names, safety levels and delete modes mirror desktop/cleanup_engine.py.
const groups = [
  { label: "node_modules Folders", size: "7.8 GB", pct: 42, safety: "safe", checked: true },
  { label: "Developer Caches (Gradle/Cargo/NuGet)", size: "4.6 GB", pct: 25, safety: "safe", checked: true },
  { label: "Browser Caches", size: "3.2 GB", pct: 17, safety: "safe", checked: true },
  { label: "Recycle Bin", size: "2.3 GB", pct: 12, safety: "safe", checked: true },
  { label: "GPU Shader Caches", size: "1.1 GB", pct: 6, safety: "safe", checked: true },
  { label: "Old Large Files (Zombies)", size: "18.4 GB", pct: 100, safety: "review", checked: false },
  { label: "Duplicate Files", size: "5.7 GB", pct: 31, safety: "review", checked: false },
] as const;

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[4px] border",
        on ? "border-accent bg-accent-600" : "border-line-strong bg-bg",
      )}
    >
      {on && (
        <svg viewBox="0 0 12 12" className="size-3 fill-none stroke-white" strokeWidth="2">
          <path d="M2.5 6.2 5 8.5l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export function SmartCleanupMock({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Illustration of DiskScanner Turbo's Smart Cleanup screen listing reclaimable space by category, with 19 GB of safe items selected."
      className={cn("relative select-none", className)}
    >
      <div aria-hidden className="absolute -inset-x-8 -top-10 bottom-0 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_60%_30%,var(--color-accent-glow),transparent_70%)] opacity-60" />
      <div aria-hidden className="overflow-hidden rounded-xl border border-line bg-elevated shadow-xl">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-line-subtle bg-bg/60 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </div>
          <span className="text-[11px] font-medium text-fg-muted">DiskScanner Turbo — Smart Cleanup</span>
          <span className="w-10" />
        </div>

        <div className="grid gap-4 p-4 sm:p-5">
          {/* Scan progress */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-fg-muted">Reclaimable on C:</p>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">43.1 GB</p>
            </div>
            <div className="w-36 sm:w-44">
              <div className="mb-1 flex justify-between text-[10px] text-fg-muted">
                <span>Analyzing Downloads…</span>
                <span className="tabular-nums">87%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                <div className="h-full w-full origin-left animate-scan rounded-full bg-linear-to-r from-accent-600 to-accent-400 motion-reduce:animate-none" />
              </div>
            </div>
          </div>

          {/* Groups */}
          <ul className="divide-y divide-line-subtle overflow-hidden rounded-lg border border-line-subtle bg-bg/40">
            {groups.map((g) => (
              <li key={g.label} className="flex items-center gap-3 px-3 py-2.5">
                <Check on={g.checked} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-fg">{g.label}</span>
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-fg-secondary">{g.size}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface">
                      <div
                        className={cn("h-full rounded-full", g.safety === "safe" ? "bg-accent" : "bg-warning")}
                        style={{ width: `${g.pct}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[10px] font-medium",
                        g.safety === "safe" ? "bg-success/15 text-success-400" : "bg-warning/15 text-warning-400",
                      )}
                    >
                      {g.safety === "safe" ? "Safe" : "Review · Recycle Bin"}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2.5">
            <span className="text-[12px] text-fg-secondary">
              <span className="font-semibold tabular-nums text-fg">19.0 GB</span> selected · 5 groups
            </span>
            <span className="rounded-md bg-accent-600 px-3 py-1.5 text-[12px] font-semibold text-white">Clean selected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Miniature treemap: proportional blocks laid out with CSS grid.
const tiles = [
  { label: "Games", size: "212 GB", area: "col-span-6 row-span-4", tone: "bg-accent-600/80" },
  { label: "Users", size: "96 GB", area: "col-span-3 row-span-4", tone: "bg-violet/70" },
  { label: "Windows", size: "41 GB", area: "col-span-3 row-span-2", tone: "bg-accent/45" },
  { label: "Dev", size: "38 GB", area: "col-span-3 row-span-2", tone: "bg-violet/40" },
  { label: "Program Files", size: "34 GB", area: "col-span-4 row-span-2", tone: "bg-accent/30" },
  { label: "Downloads", size: "22 GB", area: "col-span-3 row-span-2", tone: "bg-success/35" },
  { label: "Other", size: "9 GB", area: "col-span-5 row-span-2", tone: "bg-surface" },
] as const;

export function TreemapMock({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Illustration of the interactive treemap showing which folders take the most space."
      className={cn("grid aspect-[16/9] grid-cols-12 grid-rows-6 gap-1 rounded-lg border border-line-subtle bg-bg/50 p-1", className)}
    >
      {tiles.map((t) => (
        <div key={t.label} aria-hidden className={cn("flex flex-col justify-end rounded-[4px] p-2", t.area, t.tone)}>
          <span className="truncate text-[11px] font-medium text-white">{t.label}</span>
          <span className="text-[10px] tabular-nums text-white/75">{t.size}</span>
        </div>
      ))}
    </div>
  );
}
