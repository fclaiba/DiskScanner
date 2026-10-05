import { ImageResponse } from "next/og";

export const alt = "DiskScanner Turbo — See what fills your drive. Clear it in one click.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Colors mirror the theme tokens in globals.css (ImageResponse can't read CSS variables).
const T = { bg: "#0b0f17", elevated: "#131926", fg: "#f1f5f9", muted: "#8b95a7", accent: "#3b82f6", accent400: "#60a5fa", accent600: "#2563eb", violet: "#8b5cf6", success: "#10b981" };

export default function OpengraphImage() {
  const bars = [
    { label: "node_modules Folders", w: 0.92, c: T.accent },
    { label: "Developer Caches", w: 0.6, c: T.accent },
    { label: "Browser Caches", w: 0.44, c: T.accent },
    { label: "Old Large Files (Zombies)", w: 0.78, c: T.violet },
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: T.bg, color: T.fg, padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 700 }}>
            <div style={{ width: 44, height: 40, borderRadius: 10, background: T.accent600 }} />
            DiskScanner <span style={{ color: T.accent400 }}>Turbo</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>See what fills your drive.</div>
            <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.08, color: T.accent400, letterSpacing: -1.5 }}>Clear it in one click.</div>
          </div>
          <div style={{ fontSize: 24, color: T.muted }}>Disk analyzer and cleaner for Windows 10 & 11</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 22, flex: 1, marginLeft: 48, background: T.elevated, borderRadius: 20, padding: 36 }}>
          {bars.map((b) => (
            <div key={b.label} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 20, color: T.fg }}>{b.label}</div>
              <div style={{ display: "flex", height: 10, borderRadius: 5, background: "#1a2233" }}>
                <div style={{ width: `${b.w * 100}%`, height: 10, borderRadius: 5, background: b.c }} />
              </div>
            </div>
          ))}
          <div style={{ display: "flex", marginTop: 8, fontSize: 22, color: T.success }}>43.1 GB reclaimable</div>
        </div>
      </div>
    ),
    size,
  );
}
