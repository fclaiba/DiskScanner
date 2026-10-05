"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction, loginAction, resetPasswordAction, signupAction } from "@/app/actions/auth";
import { initialFormState } from "@/lib/form-state";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { link } from "@/components/ui/styles";
import { PASSWORD_MIN } from "@/lib/auth-constants";
import { SubmitButton } from "./submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.error && <Alert tone="danger" live>{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <div className="grid gap-2">
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={state.fieldErrors?.password}
        />
        <Link href="/forgot-password" className={`${link} justify-self-end text-sm`}>
          Forgot password?
        </Link>
      </div>
      <SubmitButton pendingLabel="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signupAction, initialFormState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.error && <Alert tone="danger" live>{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        hint={`At least ${PASSWORD_MIN} characters. A short phrase works well.`}
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Creating account…" className="w-full">
        Create account
      </SubmitButton>
      <p className="text-xs leading-relaxed text-fg-muted">
        By creating an account you agree to the{" "}
        <Link href="/legal/terms" className={link}>
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" className={link}>
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);
  if (state.ok) return <Alert tone="success" live>{state.message}</Alert>;
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.error && <Alert tone="danger" live>{state.error}</Alert>}
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton pendingLabel="Sending…" className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.error && (
        <Alert tone="danger" live>
          {state.error}{" "}
          <Link href="/forgot-password" className={link}>
            Request a new link
          </Link>
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <Field
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Saving…" className="w-full">
        Set new password
      </SubmitButton>
    </form>
  );
}
