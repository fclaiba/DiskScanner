import type { Metadata } from "next";
import { CheckIcon } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge, planDetail } from "@/components/app/plan-card";
import { Alert } from "@/components/ui/alert";
import { button, card } from "@/components/ui/styles";
import { requireSession } from "@/server/auth/current";
import { getAccountPlan } from "@/server/billing/subscriptions";
import { env } from "@/server/env";
import { PRICING, PRO_PLAN_POINTS } from "@/config/plans";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Billing" };

const ERRORS: Record<string, string> = {
  billing_not_configured:
    "Billing isn't configured on this server yet (missing Stripe keys or price IDs). In development, set the STRIPE_* variables in .env.local or use `npm run dev:grant-pro`.",
  checkout_failed: "We couldn't start checkout. Please try again in a moment.",
  portal_failed: "We couldn't open the billing portal. Please try again in a moment.",
  invalid_plan: "Choose a monthly or yearly plan.",
};

export default async function BillingPage({ searchParams }: PageProps<"/dashboard/billing">) {
  const { user } = await requireSession("/dashboard/billing");
  const sp = await searchParams;
  const plan = await getAccountPlan(user.id);
  const sub = plan.subscription;
  const configured = Boolean(env.stripeSecretKey && env.stripePriceMonthly && env.stripePriceYearly);
  const hasStripeSub = Boolean(sub?.stripeSubscriptionId && user.stripeCustomerId);
  const neverSubscribed = sub === null;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;

  return (
    <>
      <PageHeader title="Billing" description="Your plan, payment method and invoices." />
      <div className="grid gap-6">
        {sp.checkout === "success" && (
          <Alert tone="success" live title="You're on Pro">
            Thanks! It can take a few seconds for the subscription to show here. Linked PCs pick it up on their next check
            (or restart the app).
          </Alert>
        )}
        {sp.checkout === "cancelled" && <Alert tone="info">Checkout cancelled. You weren&apos;t charged.</Alert>}
        {error && <Alert tone="danger" live>{error}</Alert>}
        {!configured && !error && process.env.NODE_ENV !== "production" && (
          <Alert tone="warning" title="Billing not configured (dev)">
            Stripe keys are missing, so upgrade buttons will show an error. See README → Stripe setup.
          </Alert>
        )}

        <section aria-labelledby="current-heading" className={cn(card, "p-6")}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="current-heading" className="text-lg font-semibold">
              Current plan: {plan.pro ? "Pro" : "Free"}
            </h2>
            <StatusBadge status={plan.status} />
          </div>
          <p className="mt-1.5 text-fg-secondary">{planDetail(plan)}</p>
          {sub && (
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-fg-muted">Billing</dt>
                <dd className="mt-0.5">{sub.interval === "year" ? "Yearly" : sub.interval === "month" ? "Monthly" : "—"}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">{sub.cancelAtPeriodEnd ? "Ends" : plan.status === "trialing" ? "Trial ends" : "Renews"}</dt>
                <dd className="mt-0.5">{formatDate(sub.currentPeriodEnd)}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">PCs included</dt>
                <dd className="mt-0.5">{plan.pro ? 3 : 1}</dd>
              </div>
            </dl>
          )}
          {hasStripeSub && (
            <form action="/api/billing/portal" method="post" className="mt-6">
              <button type="submit" className={button({ variant: "secondary" })}>
                Manage billing, payment method or cancel
              </button>
            </form>
          )}
        </section>

        {!plan.pro && (
          <section aria-labelledby="upgrade-heading" className="rounded-lg border border-accent/50 bg-elevated p-6">
            <h2 id="upgrade-heading" className="text-lg font-semibold">
              Upgrade to Pro
            </h2>
            <p className="mt-1.5 text-fg-secondary">
              {neverSubscribed
                ? `Try it free for ${PRICING.trialDays} days. Cancel before the trial ends and you won't be charged.`
                : "Pick up where you left off."}
            </p>
            <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
              {PRO_PLAN_POINTS.map((p) => (
                <li key={p} className="flex gap-2 text-fg-secondary">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-success-400" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <form action="/api/billing/checkout" method="post" className="rounded-md border border-line-subtle bg-bg p-4">
                <input type="hidden" name="interval" value="month" />
                <p className="text-sm text-fg-muted">Monthly</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  ${PRICING.proMonthly}
                  <span className="text-sm font-normal text-fg-muted">/month</span>
                </p>
                <button type="submit" className={button({ variant: "secondary", className: "mt-4 w-full" })}>
                  {neverSubscribed ? "Start trial — monthly" : "Choose monthly"}
                </button>
              </form>
              <form action="/api/billing/checkout" method="post" className="rounded-md border border-accent/40 bg-bg p-4">
                <input type="hidden" name="interval" value="year" />
                <p className="flex items-center gap-2 text-sm text-fg-muted">
                  Yearly
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success-400">
                    {PRICING.yearlySavingsLabel}
                  </span>
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  ${PRICING.proYearly}
                  <span className="text-sm font-normal text-fg-muted">/year</span>
                </p>
                <button type="submit" className={button({ className: "mt-4 w-full" })}>
                  {neverSubscribed ? "Start trial — yearly" : "Choose yearly"}
                </button>
              </form>
            </div>
            <p className="mt-4 text-xs text-fg-muted">Secure checkout by Stripe. Promotion codes can be applied at checkout.</p>
          </section>
        )}
      </div>
    </>
  );
}
