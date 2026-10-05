"use client";

import { useActionState } from "react";
import Link from "next/link";
import { activateDeviceAction } from "@/app/actions/account";
import { initialFormState } from "@/lib/form-state";
import { Alert } from "@/components/ui/alert";
import { button, link } from "@/components/ui/styles";
import { SubmitButton } from "./submit-button";

export function ActivateForm({ userCode }: { userCode: string }) {
  const [state, action] = useActionState(activateDeviceAction, initialFormState);
  if (state.ok) {
    const approved = state.values?.result === "approved";
    return (
      <div className="grid gap-4">
        <Alert tone={approved ? "success" : "info"} live title={approved ? "Linked" : "Rejected"}>
          {state.message}
        </Alert>
        <Link href="/dashboard/devices" className={button({ variant: "secondary" })}>
          View your devices
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      {state.error && (
        <Alert tone="danger" live>
          {state.error}
          {state.values?.reason === "device_limit" && (
            <>
              {" "}
              <Link href="/dashboard/devices" className={link}>
                Manage devices
              </Link>{" "}
              or{" "}
              <Link href="/dashboard/billing" className={link}>
                upgrade
              </Link>
              .
            </>
          )}
        </Alert>
      )}
      <input type="hidden" name="user_code" value={userCode} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SubmitButton name="decision" value="approve" pendingLabel="Working…" className="w-full">
          Authorize
        </SubmitButton>
        <SubmitButton name="decision" value="deny" variant="secondary" pendingLabel="Working…" className="w-full">
          Reject
        </SubmitButton>
      </div>
    </form>
  );
}
