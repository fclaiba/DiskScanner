// Plan definitions shared by the server (entitlements, device limits) and the
// marketing/billing UI (display prices). Display prices are NOT used to charge
// anyone: Stripe prices come from STRIPE_PRICE_PRO_* env vars on the server.

export type Plan = "free" | "pro";
export type Feature = "scan" | "cleanup" | "sync";
export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid";
export type BillingInterval = "month" | "year";

/** Statuses that grant Pro (contract: pro = status in trialing/active/past_due). */
export const PRO_STATUSES: readonly SubscriptionStatus[] = ["trialing", "active", "past_due"];

export const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
  free: ["scan"],
  pro: ["scan", "cleanup", "sync"],
};

export const DEVICE_LIMITS: Record<Plan, number> = {
  free: 1,
  pro: 3,
};

/** Offline window of a signed entitlement. */
export const ENTITLEMENT_TTL_SECONDS = 7 * 24 * 60 * 60;

export function isProStatus(status: SubscriptionStatus): boolean {
  return PRO_STATUSES.includes(status);
}

export function planForStatus(status: SubscriptionStatus): Plan {
  return isProStatus(status) ? "pro" : "free";
}

// ---------------------------------------------------------------------------
// Display constants — (propuesta a validar)
// ---------------------------------------------------------------------------

export const PRICING = {
  currency: "USD",
  // (propuesta a validar)
  proMonthly: 5.99,
  // (propuesta a validar)
  proYearly: 47.99,
  // (propuesta a validar)
  yearlySavingsLabel: "Save 33%",
  // (propuesta a validar)
  trialDays: 7,
} as const;

export const FREE_PLAN_POINTS = [
  "Full-disk scan with live progress",
  "Interactive treemap and file explorer",
  "Duplicate, zombie-file and game-install analysis",
  "Export a detailed report",
  "1 PC",
] as const;

export const PRO_PLAN_POINTS = [
  "Everything in Free",
  "All one-click cleanups",
  "Up to 3 PCs on one account",
  "Web dashboard with scan history and GB-freed stats",
  "Priority email support",
] as const;
