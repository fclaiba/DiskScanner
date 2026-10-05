import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// HSTS / upgrade-insecure-requests only make sense when served over HTTPS
// (keeps `next start` usable on http://localhost for e2e tests).
const httpsSite = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");

// Next.js injects inline bootstrap scripts, so script-src needs 'unsafe-inline'
// unless we move every page to nonce-based dynamic rendering (which would make
// the marketing pages non-static). Everything else is locked down.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  // Billing forms redirect (303) to Stripe Checkout / Customer Portal.
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  ...(httpsSite ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
  },
  ...(!httpsSite ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // PGlite ships WASM + data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
