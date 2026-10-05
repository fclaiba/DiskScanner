import Link from "next/link";
import type { AccountPlan } from "@/server/billing/subscriptions";
import { button, card } from "@/components/ui/styles";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PRICING } from "@/config/plans";

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  none: { text: "Free", tone: "bg-surface text-fg-secondary" },
  trialing: { text: "Trial", tone: "bg-accent/15 text-accent-400" },
  active: { text: "Active", tone: "bg-success/15 text-success-400" },
  past_due: { text: "Payment issue", tone: "bg-warning/15 text-warning-400" },
  canceled: { text: "Canceled", tone: "bg-surface text-fg-secondary" },
  incomplete: { text: "Incomplete", tone: "bg-warning/15 text-warning-400" },
  unpaid: { text: "Unpaid", tone: "bg-danger/15 text-danger-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? STATUS_LABEL.none!;
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", s.tone)}>{s.text}</span>;
}

export function planDetail(ap: AccountPlan): string {
  const sub = ap.subscription;
  const end = formatDate(sub?.currentPeriodEnd);
  switch (ap.status) {
    case "trialing":
      return sub?.cancelAtPeriodEnd ? `Trial ends ${end}. It won't convert to a paid plan.` : `Free trial until ${end}, then billed ${sub?.interval === "year" ? "yearly" : "monthly"}.`;
    case "active":
      return sub?.cancelAtPeriodEnd ? `Pro until ${end}. It won't renew.` : `Renews ${end} (${sub?.interval === "year" ? "yearly" : "monthly"}).`;
    case "past_due":
      return "Your last payment failed. Update your payment method to keep Pro.";
    case "unpaid":
    case "incomplete":
      return "Payment wasn't completed. Finish it in billing to unlock Pro.";
    case "canceled":
      return "Your Pro subscription ended. Scanning stays free.";
    default:
      return `Scan and analyze for free. Pro adds every cleanup on up to 3 PCs — try it free for ${PRICING.trialDays} days.`;
  }
}

/** Summary card used on the overview page. */
export function PlanCard({ plan, billingConfigured = true }: { plan: AccountPlan; billingConfigured?: boolean }) {
  return (
    <section aria-labelledby="plan-heading" className={cn(card, "flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between")}>
      <div>
        <div className="flex items-center gap-3">
          <h2 id="plan-heading" className="text-lg font-semibold">
            {plan.pro ? "DiskScanner Turbo Pro" : "Free plan"}
          </h2>
          <StatusBadge status={plan.status} />
        </div>
        <p className="mt-1.5 text-sm text-fg-secondary">{planDetail(plan)}</p>
      </div>
      {plan.subscription?.stripeSubscriptionId && plan.status !== "canceled" ? (
        <form action="/api/billing/portal" method="post">
          <button type="submit" className={button({ variant: "secondary" })} disabled={!billingConfigured}>
            Manage billing
          </button>
        </form>
      ) : (
        <Link href="/dashboard/billing" className={button()}>
          {plan.status === "none" ? "Start free trial" : "Upgrade to Pro"}
        </Link>
      )}
    </section>
  );
}
