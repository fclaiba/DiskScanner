import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ChangePasswordForm, DeleteAccountForm, ResendVerificationForm } from "@/components/forms/account-forms";
import { card } from "@/components/ui/styles";
import { requireSession } from "@/server/auth/current";
import { getAccountPlan } from "@/server/billing/subscriptions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Settings" };

function Section({ id, title, children, danger }: { id: string; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section aria-labelledby={id} className={cn(card, "p-6", danger && "border-danger/30")}>
      <h2 id={id} className={cn("mb-4 text-lg font-semibold", danger && "text-danger-400")}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const { user } = await requireSession("/dashboard/settings");
  const plan = await getAccountPlan(user.id);
  return (
    <>
      <PageHeader title="Settings" description="Account, security and data." />
      <div className="grid gap-6">
        <Section id="account-h" title="Account">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-muted">Email</dt>
              <dd className="mt-0.5 break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Member since</dt>
              <dd className="mt-0.5">{formatDate(user.createdAt)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-fg-muted">Email status</dt>
              <dd className="mt-1.5">
                {user.emailVerifiedAt ? (
                  <span className="text-success-400">Verified on {formatDate(user.emailVerifiedAt)}</span>
                ) : (
                  <div className="grid gap-3">
                    <span className="text-warning-400">Not verified yet</span>
                    <ResendVerificationForm />
                  </div>
                )}
              </dd>
            </div>
          </dl>
        </Section>
        <Section id="password-h" title="Change password">
          <ChangePasswordForm />
        </Section>
        <Section id="delete-h" title="Delete account" danger>
          <DeleteAccountForm hasSubscription={plan.pro} />
        </Section>
      </div>
    </>
  );
}
