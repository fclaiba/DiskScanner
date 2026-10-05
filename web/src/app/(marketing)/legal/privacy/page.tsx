import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What DiskScanner Turbo collects, why, and the choices you have. File names and paths never leave your PC.",
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="[DATE]">
      <section>
        <h2>Summary</h2>
        <ul>
          <li>Scanning and cleaning run locally on your PC.</li>
          <li><strong>We never upload file names, folder names, paths or file contents.</strong></li>
          <li>With Pro, the app may send aggregate summaries (sizes, counts, category totals) to your dashboard.</li>
          <li>We don&apos;t sell personal data and don&apos;t use advertising trackers.</li>
        </ul>
      </section>
      <section>
        <h2>Controller</h2>
        <p>[COMPANY NAME], [REGISTERED ADDRESS]. Privacy contact: [PRIVACY EMAIL]. [DPO / EU REPRESENTATIVE, IF REQUIRED].</p>
      </section>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account:</strong> email address, a salted hash of your password, email-verification status.</li>
          <li><strong>Billing:</strong> handled by Stripe. We store your Stripe customer and subscription identifiers, plan, status and renewal date — not your card details.</li>
          <li><strong>Linked devices:</strong> a device name you can see (e.g. the Windows computer name), platform, app version, a one-way hardware fingerprint (SHA-256), and when the device was last seen.</li>
          <li><strong>Usage summaries (Pro, when sync is on):</strong> scan or cleanup type, total bytes, file count, reclaimable and freed bytes, duration, app version and per-category totals such as “browser_cache: 3.2 GB”.</li>
          <li><strong>Security logs:</strong> IP address and user agent for sign-ins and sensitive account actions, and rate-limit counters.</li>
        </ul>
      </section>
      <section>
        <h2>Why we use it (legal bases)</h2>
        <ul>
          <li>To provide the account, license and dashboard you asked for (contract).</li>
          <li>To bill subscriptions and keep accounting records (contract, legal obligation).</li>
          <li>To protect accounts and prevent abuse (legitimate interest).</li>
          <li>To send transactional emails such as verification and password resets (contract).</li>
        </ul>
      </section>
      <section>
        <h2>Processors</h2>
        <p>
          Hosting: [HOSTING PROVIDER, e.g. Vercel]. Database: [DATABASE PROVIDER, e.g. Neon]. Payments: Stripe. Email
          delivery: [EMAIL PROVIDER, e.g. Resend]. Some processors may handle data outside your country under appropriate
          safeguards ([TRANSFER MECHANISM]).
        </p>
      </section>
      <section>
        <h2>Retention</h2>
        <ul>
          <li>Usage summaries: 13 months, then deleted automatically.</li>
          <li>Sessions, sign-in links and rate-limit data: deleted after they expire (at most 30 days for sessions).</li>
          <li>Account data: until you delete your account. Billing records are kept as required by tax law ([PERIOD]).</li>
        </ul>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>
          You can access and export your data, correct it, or delete your account at any time from Settings, which removes
          your devices, summaries and sessions. Depending on where you live you may also object, restrict processing or
          complain to a supervisory authority ([AUTHORITY]). Contact [PRIVACY EMAIL].
        </p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>
          We use one strictly necessary cookie, <code>ds_session</code>, to keep you signed in. No analytics or advertising
          cookies.
        </p>
      </section>
    </LegalPage>
  );
}
