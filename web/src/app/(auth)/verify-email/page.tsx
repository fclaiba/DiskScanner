import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { button } from "@/components/ui/styles";
import { verifyEmail } from "@/server/auth/accounts";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const ok = token ? await verifyEmail(token) : false;
  return (
    <AuthCard title={ok ? "Email confirmed" : "Link not valid"}>
      {ok ? (
        <Alert tone="success">Thanks — your email address is confirmed.</Alert>
      ) : (
        <Alert tone="danger">
          This verification link is invalid, expired or was already used. Sign in and request a new one from Settings.
        </Alert>
      )}
      <Link href="/dashboard" className={button({ className: "mt-6 w-full" })}>
        Go to dashboard
      </Link>
    </AuthCard>
  );
}
