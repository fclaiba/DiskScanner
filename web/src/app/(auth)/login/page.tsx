import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui/alert";
import { link } from "@/components/ui/styles";
import { getCurrentSession } from "@/server/auth/current";
import { safeNextPath } from "@/server/http";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Sign in", robots: { index: false }, alternates: { canonical: "/login" } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const nextRaw = typeof sp.next === "string" ? sp.next : undefined;
  const next = safeNextPath(nextRaw);
  if (await getCurrentSession()) redirect(next);
  const signupHref = nextRaw ? `/signup?next=${encodeURIComponent(next)}` : "/signup";
  return (
    <div className="grid gap-4">
      {sp.signed_out && <Alert tone="info">You&apos;re signed out.</Alert>}
      {sp.reset && <Alert tone="success">Password updated. Sign in with your new password.</Alert>}
      {next.startsWith("/activate") && (
        <Alert tone="info">Sign in to link your PC. You&apos;ll be taken back to approve it.</Alert>
      )}
      <AuthCard
        title="Sign in"
        subtitle={
          <>
            New here?{" "}
            <Link href={signupHref} className={link}>
              Create an account
            </Link>
          </>
        }
      >
        <LoginForm next={nextRaw ? next : undefined} />
      </AuthCard>
    </div>
  );
}
