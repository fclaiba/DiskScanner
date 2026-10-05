/** Binary units (1 KB = 1024 B), matching the desktop app. */
export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v.toFixed(i === 0 ? 0 : v >= 100 ? 0 : digits)} ${units[i]}`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const LABELS: Record<string, string> = {
  temp: "Temporary files",
  browser_cache: "Browser caches",
  gpu_shaders: "GPU shader caches",
  messaging_cache: "Messaging app caches",
  dev_caches: "Developer caches",
  xcode_derived: "Xcode DerivedData",
  recycle_bin: "Recycle Bin",
  node_modules: "node_modules",
  venvs: "Python virtual envs",
  empty_dirs: "Empty folders",
  zombies: "Zombie files",
  duplicates: "Duplicates",
};

export function categoryLabel(key: string): string {
  return LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
