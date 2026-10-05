"use server";

import { redirect } from "next/navigation";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from "@/lib/schemas/auth";
import { fieldErrorsFrom, type FormState } from "@/lib/form-state";
import { login, requestPasswordReset, resetPassword, signup, sendVerificationEmail } from "@/server/auth/accounts";
import {
  currentSessionToken,
  getCurrentSession,
  requestMeta,
  setSessionCookie,
} from "@/server/auth/current";
import { deleteSessionByToken } from "@/server/auth/sessions";
import { safeNextPath } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
}

export async function signupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  const parsed = signupSchema.safeParse({ email, password: str(fd, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values: { email } };
  const meta = await requestMeta();
  const res = await signup(parsed.data.email, parsed.data.password, meta);
  if (!res.ok) {
    return res.code === "email_taken"
      ? { fieldErrors: { email: res.message }, values: { email } }
      : { error: res.message, values: { email } };
  }
  await setSessionCookie(res.session);
  redirect(safeNextPath(str(fd, "next"), "/dashboard?welcome=1"));
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  const parsed = loginSchema.safeParse({ email, password: str(fd, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values: { email } };
  const meta = await requestMeta();
  const res = await login(parsed.data.email, parsed.data.password, meta);
  if (!res.ok) return { error: res.message, values: { email } };
  // Rotate: drop the session this browser had before signing in.
  const previous = await currentSessionToken();
  if (previous) await deleteSessionByToken(previous);
  await setSessionCookie(res.session);
  redirect(safeNextPath(str(fd, "next")));
}

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values: { email } };
  const res = await requestPasswordReset(parsed.data.email, await requestMeta());
  if (res.rateLimited) return { error: "Too many requests. Try again in an hour.", values: { email } };
  return {
    ok: true,
    message: "If an account exists for that email, a reset link is on its way. It expires in 1 hour.",
  };
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({ token: str(fd, "token"), password: str(fd, "password") });
  if (!parsed.success) {
    const fe = fieldErrorsFrom(parsed.error);
    if (fe.token) return { error: "This reset link is invalid. Request a new one." };
    return { fieldErrors: fe };
  }
  const ok = await resetPassword(parsed.data.token, parsed.data.password, await requestMeta());
  if (!ok) return { error: "This reset link is invalid, expired or already used. Request a new one." };
  redirect("/login?reset=1");
}

export async function resendVerificationAction(_prev: FormState): Promise<FormState> {
  const s = await getCurrentSession();
  if (!s) redirect("/login");
  if (s.user.emailVerifiedAt) return { ok: true, message: "Your email is already verified." };
  const rl = await rateLimit(`resend-verify:${s.user.id}`, 3, 3600);
  if (!rl.ok) return { error: "You've requested several emails already. Check your inbox or try again later." };
  await sendVerificationEmail(s.user);
  return { ok: true, message: `Verification email sent to ${s.user.email}.` };
}
