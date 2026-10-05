import Link from "next/link";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui/alert";
import { link } from "@/components/ui/styles";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <AuthCard title="Choose a new password" subtitle="You'll be signed out everywhere else after the change.">
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="danger">
          This link is missing its token.{" "}
          <Link href="/forgot-password" className={link}>
            Request a new link
          </Link>
        </Alert>
      )}
    </AuthCard>
  );
}
