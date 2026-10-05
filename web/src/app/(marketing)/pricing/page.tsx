import Link from "next/link";
import type { Metadata } from "next";
import { CheckIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import { button, card } from "@/components/ui/styles";
import { FREE_PLAN_POINTS, PRICING, PRO_PLAN_POINTS } from "@/config/plans";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Pricing",
  description: `DiskScanner Turbo is free to scan and analyze. Pro adds one-click cleanups for up to 3 PCs from $${PRICING.proMonthly}/month, with a ${PRICING.trialDays}-day free trial.`,
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Pricing · DiskScanner Turbo", url: "/pricing" },
};

const faqs = [
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from the billing page in your dashboard in two clicks. You keep Pro until the end of the period you already paid for, and you are not charged again. If you cancel during the free trial, you are never charged.",
  },
  {
    q: "What happens after the free trial?",
    a: `The trial lasts ${PRICING.trialDays} days and is available once per account. When it ends, the plan you picked (monthly or yearly) starts automatically unless you cancel before.`,
  },
  {
    q: "Does it work offline?",
    a: "Yes. Scanning and cleaning run entirely on your PC. The app checks your license when it starts and every few hours; if it can't reach us, Pro features keep working for up to 7 days since the last successful check.",
  },
  {
    q: "What data do you collect?",
    a: "Your email and billing details for the account. With Pro, the app can send scan and cleanup summaries to your dashboard: total sizes, file counts and per-category sizes. We never upload file names, folder names or paths.",
  },
  {
    q: "What does the free plan include?",
    a: "Full scans, the treemap, the explorer, duplicate, zombie-file and game analysis, and report export, on one PC. Cleanups that delete files are part of Pro.",
  },
  {
    q: "How do I move Pro to another PC?",
    a: "Remove the old PC under Devices in your dashboard, then link the new one from the app. Pro covers up to 3 PCs at the same time.",
  },
] as const;

function Price({ amount, per }: { amount: number; per: string }) {
  return (
    <p className="flex items-baseline gap-1">
      <span className="text-4xl font-semibold tracking-tight tabular-nums">${amount}</span>
      <span className="text-fg-muted">/{per}</span>
    </p>
  );
}

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 md:pt-20">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Simple pricing</h1>
          <p className="mt-4 text-lg leading-relaxed text-fg-secondary">
            Scanning and analysis are free forever. Pro unlocks every cleanup and your history across up to three PCs.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {/* Free */}
          <section aria-labelledby="plan-free" className={cn(card, "flex flex-col p-7")}>
            <h2 id="plan-free" className="text-lg font-semibold">
              Free
            </h2>
            <p className="mt-1 text-sm text-fg-muted">See exactly where your space went.</p>
            <div className="mt-6">
              <Price amount={0} per="forever" />
            </div>
            <ul className="mt-6 space-y-3 text-sm">
              {FREE_PLAN_POINTS.map((p) => (
                <li key={p} className="flex gap-2.5 text-fg-secondary">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
            <Link href="/download" className={button({ variant: "secondary", className: "mt-8 w-full" })}>
              Download free
            </Link>
          </section>

          {/* Pro */}
          <section
            aria-labelledby="plan-pro"
            className="relative flex flex-col rounded-lg border border-accent/60 bg-elevated p-7 shadow-[0_0_0_1px_var(--color-accent-glow),var(--shadow-lg)] lg:col-span-2"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="plan-pro" className="text-lg font-semibold">
                Pro
              </h2>
              <span className="rounded-full bg-accent-600/20 px-2.5 py-0.5 text-xs font-medium text-accent-400">
                {PRICING.trialDays}-day free trial
              </span>
            </div>
            <p className="mt-1 text-sm text-fg-muted">Reclaim the space in one click, on every PC you use.</p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div className="rounded-md border border-line-subtle bg-bg/50 p-4">
                <p className="text-sm text-fg-secondary">Monthly</p>
                <Price amount={PRICING.proMonthly} per="month" />
              </div>
              <div className="rounded-md border border-line-subtle bg-bg/50 p-4">
                <p className="flex items-center gap-2 text-sm text-fg-secondary">
                  Yearly
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success-400">
                    {PRICING.yearlySavingsLabel}
                  </span>
                </p>
                <Price amount={PRICING.proYearly} per="year" />
              </div>
            </div>
            <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
              {PRO_PLAN_POINTS.map((p) => (
                <li key={p} className="flex gap-2.5 text-fg-secondary">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-success-400" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href={`/signup?next=${encodeURIComponent("/dashboard/billing")}`} className={button({ size: "lg" })}>
                Start free trial
              </Link>
              <p className="text-sm text-fg-muted">Cancel anytime. No charge during the trial.</p>
            </div>
          </section>
        </div>
        <p className="mt-6 text-sm text-fg-muted">Prices in {PRICING.currency}. Taxes may apply depending on your location.</p>
      </section>

      <section aria-labelledby="faq-heading" className="border-t border-line-subtle bg-elevated/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr]">
          <h2 id="faq-heading" className="text-3xl font-semibold tracking-tight">
            Questions
          </h2>
          <div className="divide-y divide-line-subtle border-y border-line-subtle">
            {faqs.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-4 text-left font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <PlusIcon className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-45" aria-hidden />
                </summary>
                <p className="pb-5 leading-relaxed text-fg-secondary">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
