import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "How cancellations and refunds work for DiskScanner Turbo Pro.",
  alternates: { canonical: "/legal/refunds" },
};

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" updated="[DATE]">
      <section>
        <h2>Free trial</h2>
        <p>
          New Pro subscribers get a [TRIAL LENGTH]-day free trial. Cancel any time before it ends and you won&apos;t be
          charged.
        </p>
      </section>
      <section>
        <h2>Cancelling</h2>
        <p>
          You can cancel from Billing in your dashboard. Pro stays active until the end of the current billing period and
          won&apos;t renew. Deleting your account cancels the subscription immediately.
        </p>
      </section>
      <section>
        <h2>Refunds</h2>
        <ul>
          <li>
            <strong>Yearly plans:</strong> if you request it within [14] days of the first yearly charge, we refund it in full.
          </li>
          <li>
            <strong>Monthly plans:</strong> charges are generally non-refundable, but contact us within [7] days if something
            went wrong and we&apos;ll make it right.
          </li>
          <li>Duplicate charges or billing errors are always refunded.</li>
          <li>
            Where consumer law in your country gives you a right of withdrawal, it applies in addition to this policy.
            [CONFIRM EU/UK 14-DAY WITHDRAWAL WORDING FOR DIGITAL SERVICES.]
          </li>
        </ul>
      </section>
      <section>
        <h2>How to request one</h2>
        <p>
          Email [SUPPORT EMAIL] from your account email with the date of the charge. Refunds go back to the original
          payment method through Stripe and usually appear within 5–10 business days.
        </p>
      </section>
    </LegalPage>
  );
}
