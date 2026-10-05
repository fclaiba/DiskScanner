"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { changePasswordSchema, deleteAccountSchema } from "@/lib/schemas/auth";
import { fieldErrorsFrom, type FormState } from "@/lib/form-state";
import { changePassword } from "@/server/auth/accounts";
import { clearSessionCookie, getCurrentSession, requestMeta } from "@/server/auth/current";
import { deleteAccount } from "@/server/account/delete";
import { revokeDevice } from "@/server/devices/service";
import { approveDevice, denyDevice } from "@/server/devices/flow";

function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await getCurrentSession();
  if (!s) redirect("/login?next=/dashboard/settings");
  const parsed = changePasswordSchema.safeParse({
    current_password: str(fd, "current_password"),
    new_password: str(fd, "new_password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };
  const res = await changePassword(s.user, s.sessionId, parsed.data.current_password, parsed.data.new_password, await requestMeta());
  if (!res.ok) return { fieldErrors: { current_password: res.message } };
  return { ok: true, message: "Password updated. Other browsers were signed out." };
}

export async function deleteAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await getCurrentSession();
  if (!s) redirect("/login");
  const parsed = deleteAccountSchema.safeParse({ password: str(fd, "password"), confirm: str(fd, "confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };
  const meta = await requestMeta();
  const res = await deleteAccount(s.user, parsed.data.password, meta.ip);
  if (!res.ok) return { error: res.message };
  await clearSessionCookie();
  redirect("/?account_deleted=1");
}

export async function revokeDeviceAction(fd: FormData): Promise<void> {
  const s = await getCurrentSession();
  if (!s) redirect("/login?next=/dashboard/devices");
  const id = str(fd, "device_id");
  if (/^[0-9a-f-]{36}$/i.test(id)) await revokeDevice(s.user.id, id, (await requestMeta()).ip);
  revalidatePath("/dashboard/devices");
}

export async function activateDeviceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const code = str(fd, "user_code");
  const s = await getCurrentSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(`/activate?code=${code}`)}`);
  const meta = await requestMeta();
  if (str(fd, "decision") === "deny") {
    const denied = await denyDevice(s.user, code, meta.ip);
    return denied
      ? { ok: true, message: "Request rejected. The app was told not to link." , values: { result: "denied" } }
      : { error: "This code is invalid or has expired." };
  }
  const res = await approveDevice(s.user, code, meta.ip);
  if (!res.ok) return { error: res.message, values: { reason: res.code } };
  return { ok: true, message: "PC linked. Return to the app — it will finish signing in within a few seconds.", values: { result: "approved" } };
}
