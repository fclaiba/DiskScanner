"use client";

import { useActionState } from "react";
import { changePasswordAction, deleteAccountAction } from "@/app/actions/account";
import { resendVerificationAction } from "@/app/actions/auth";
import { initialFormState } from "@/lib/form-state";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { PASSWORD_MIN } from "@/lib/auth-constants";
import { SubmitButton } from "./submit-button";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  return (
    <form action={action} className="grid max-w-md gap-5" noValidate>
      {state.ok && <Alert tone="success" live>{state.message}</Alert>}
      {state.error && <Alert tone="danger" live>{state.error}</Alert>}
      <Field
        name="current_password"
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.current_password}
      />
      <Field
        name="new_password"
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={state.fieldErrors?.new_password}
      />
      <div>
        <SubmitButton pendingLabel="Updating…" variant="secondary">
          Update password
        </SubmitButton>
      </div>
    </form>
  );
}

export function ResendVerificationForm({ compact = false }: { compact?: boolean }) {
  const [state, action] = useActionState(resendVerificationAction, initialFormState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <SubmitButton pendingLabel="Sending…" variant="secondary" size={compact ? "sm" : "md"}>
        Resend verification email
      </SubmitButton>
      <span role="status" className="text-sm text-fg-secondary">
        {state.message ?? state.error ?? ""}
      </span>
    </form>
  );
}

export function DeleteAccountForm({ hasSubscription }: { hasSubscription: boolean }) {
  const [state, action] = useActionState(deleteAccountAction, initialFormState);
  return (
    <form action={action} className="grid max-w-md gap-5" noValidate>
      {state.error && <Alert tone="danger" live>{state.error}</Alert>}
      <p className="text-sm leading-relaxed text-fg-secondary">
        This permanently deletes your account, linked PCs and report history.
        {hasSubscription && " Your subscription is cancelled immediately and won't renew."} This can&apos;t be undone.
      </p>
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Field
        name="confirm"
        label='Type "DELETE" to confirm'
        autoComplete="off"
        required
        error={state.fieldErrors?.confirm}
      />
      <div>
        <SubmitButton pendingLabel="Deleting…" variant="danger">
          Delete account
        </SubmitButton>
      </div>
    </form>
  );
}
