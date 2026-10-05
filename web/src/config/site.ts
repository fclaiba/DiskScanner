// Public site configuration (safe for client and server).
export const site = {
  name: "DiskScanner Turbo",
  shortName: "DiskScanner",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  downloadUrl:
    process.env.NEXT_PUBLIC_DOWNLOAD_URL ??
    "https://github.com/fclaiba/DiskScanner/releases/latest/download/DiskScannerTurbo.exe",
  description:
    "A fast disk analyzer and cleaner for Windows. Map every folder, find caches, duplicates and forgotten files, and reclaim space in one click.",
  supportEmail: "support@diskscanner.app",
} as const;

export const marketingNav = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/download", label: "Download" },
] as const;
