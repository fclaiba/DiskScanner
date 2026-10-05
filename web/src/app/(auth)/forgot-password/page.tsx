import Link from "next/link";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forms/auth-forms";
import { link } from "@/components/ui/styles";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a link to choose a new password."
    >
      <ForgotPasswordForm />
      <p className="mt-6 text-sm text-fg-muted">
        Remembered it?{" "}
        <Link href="/login" className={link}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
