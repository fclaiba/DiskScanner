import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of DiskScanner Turbo and the DiskScanner Turbo website.",
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="[DATE]">
      <section>
        <h2>1. Who we are</h2>
        <p>
          DiskScanner Turbo (the “Software”) and diskscanner.app (the “Service”) are provided by [COMPANY NAME], a
          [COMPANY TYPE] registered in [JURISDICTION] with address at [REGISTERED ADDRESS] (“we”, “us”). Contact:
          [CONTACT EMAIL].
        </p>
      </section>
      <section>
        <h2>2. Acceptance</h2>
        <p>
          By downloading the Software, creating an account or purchasing a subscription you agree to these Terms. If you
          use the Software on behalf of an organization, you confirm you are authorized to bind it.
        </p>
      </section>
      <section>
        <h2>3. Accounts</h2>
        <ul>
          <li>You must provide a valid email address and keep your password confidential.</li>
          <li>You are responsible for activity under your account and for the devices you link to it.</li>
          <li>You must be at least [MINIMUM AGE] years old to create an account.</li>
        </ul>
      </section>
      <section>
        <h2>4. License</h2>
        <p>
          We grant you a personal, non-exclusive, non-transferable license to use the Software on the number of devices
          allowed by your plan (Free: 1; Pro: 3). The source code of the Software is published under [LICENSE, e.g. the
          MIT License]; these Terms govern the Service, the account system and paid features.
        </p>
      </section>
      <section>
        <h2>5. Subscriptions and billing</h2>
        <ul>
          <li>Pro is billed in advance monthly or yearly through our payment processor, Stripe.</li>
          <li>
            New subscribers may receive a free trial of [TRIAL LENGTH, e.g. 7 days], once per customer. Unless you cancel
            before the trial ends, the subscription starts and you are charged.
          </li>
          <li>Subscriptions renew automatically until cancelled. You can cancel at any time from your dashboard; access continues until the end of the paid period.</li>
          <li>We may change prices with at least [NOTICE PERIOD] notice; changes apply from your next renewal.</li>
          <li>Refunds are described in our <a href="/legal/refunds" className="text-accent-400 underline">Refund Policy</a>.</li>
        </ul>
      </section>
      <section>
        <h2>6. Your responsibility for deletions</h2>
        <p>
          The Software can permanently delete files and folders you select or that it classifies as caches.{" "}
          <strong>You are responsible for reviewing what is selected before running a cleanup and for keeping backups of
          important data.</strong> Items in “review” categories are moved to the Recycle Bin where possible, but recovery
          cannot be guaranteed.
        </p>
      </section>
      <section>
        <h2>7. Acceptable use</h2>
        <p>
          You may not reverse engineer the license system to obtain paid features without paying, share account access
          beyond your device allowance, interfere with the Service, or use it in violation of applicable law.
        </p>
      </section>
      <section>
        <h2>8. Disclaimer and limitation of liability</h2>
        <p>
          The Software and Service are provided “as is” without warranties of any kind, to the maximum extent permitted by
          law. To the extent permitted by law, we are not liable for data loss, lost profits or indirect damages, and our
          total liability is limited to the amounts you paid us in the [12] months before the claim. [ADJUST FOR CONSUMER
          LAW IN YOUR JURISDICTION.]
        </p>
      </section>
      <section>
        <h2>9. Termination</h2>
        <p>
          You can delete your account at any time from Settings; this cancels any active subscription immediately. We may
          suspend accounts that breach these Terms.
        </p>
      </section>
      <section>
        <h2>10. Governing law</h2>
        <p>These Terms are governed by the laws of [GOVERNING LAW]. Disputes are subject to the courts of [VENUE], without prejudice to mandatory consumer protections.</p>
      </section>
      <section>
        <h2>11. Changes</h2>
        <p>We will notify you by email or in the dashboard of material changes at least [NOTICE PERIOD] before they take effect.</p>
      </section>
    </LegalPage>
  );
}
