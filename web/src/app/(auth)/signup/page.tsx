import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/forms/auth-forms";
import { link } from "@/components/ui/styles";
import { getCurrentSession } from "@/server/auth/current";
import { safeNextPath } from "@/server/http";
import { PRICING } from "@/config/plans";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a DiskScanner Turbo account to link your PCs and start a free Pro trial.",
  alternates: { canonical: "/signup" },
};

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const nextRaw = typeof sp.next === "string" ? sp.next : undefined;
  const next = safeNextPath(nextRaw);
  if (await getCurrentSession()) redirect(next);
  return (
    <AuthCard
      title="Create your account"
      subtitle={
        <>
          Free to scan. Start a {PRICING.trialDays}-day Pro trial anytime. Already have an account?{" "}
          <Link href={nextRaw ? `/login?next=${encodeURIComponent(next)}` : "/login"} className={link}>
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm next={nextRaw ? next : undefined} />
    </AuthCard>
  );
}
