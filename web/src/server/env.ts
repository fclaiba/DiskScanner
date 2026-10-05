// Lazy, typed access to environment variables. Nothing here throws at import
// time so `next build` works without production secrets; callers that need a
// value fail at request time with a clear error instead.

export const DEFAULT_DOWNLOAD_URL =
  "https://github.com/fclaiba/DiskScanner/releases/latest/download/DiskScannerTurbo.exe";

function str(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? undefined : v.trim();
}

export const env = {
  get nodeEnv() {
    return process.env.NODE_ENV ?? "development";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get databaseUrl() {
    return str("DATABASE_URL") ?? "pglite:./.data/dev";
  },
  get siteUrl() {
    return (str("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get downloadUrl() {
    return str("NEXT_PUBLIC_DOWNLOAD_URL") ?? DEFAULT_DOWNLOAD_URL;
  },
  get stripeSecretKey() {
    return str("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return str("STRIPE_WEBHOOK_SECRET");
  },
  get stripePriceMonthly() {
    return str("STRIPE_PRICE_PRO_MONTHLY");
  },
  get stripePriceYearly() {
    return str("STRIPE_PRICE_PRO_YEARLY");
  },
  get stripeTrialDays() {
    const raw = str("STRIPE_TRIAL_DAYS");
    const n = raw === undefined ? 7 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 7;
  },
  get stripeAutomaticTax() {
    return str("STRIPE_AUTOMATIC_TAX") === "true";
  },
  get entitlementSigningKey() {
    return str("ENTITLEMENT_SIGNING_KEY");
  },
  get entitlementKeyId() {
    return str("ENTITLEMENT_KEY_ID") ?? "k1";
  },
  get resendApiKey() {
    return str("RESEND_API_KEY");
  },
  get emailFrom() {
    return str("EMAIL_FROM") ?? "DiskScanner Turbo <no-reply@diskscanner.app>";
  },
  get logLevel() {
    return str("LOG_LEVEL") ?? (process.env.NODE_ENV === "test" ? "silent" : "info");
  },
  get cronSecret() {
    return str("CRON_SECRET");
  },
};
