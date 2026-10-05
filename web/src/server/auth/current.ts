import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE, getSessionUser, type NewSession, type SessionUser } from "./sessions";
import { clientIp } from "../http";
import { env } from "../env";
import type { ReqMeta } from "./accounts";

/** Current session (memoized per request). */
export const getCurrentSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return getSessionUser(store.get(SESSION_COOKIE)?.value);
});

/** For SSR pages: redirects to /login?next=<path> when signed out. */
export async function requireSession(nextPath: string): Promise<SessionUser> {
  const s = await getCurrentSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return s;
}

export async function setSessionCookie(session: NewSession): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function requestMeta(): Promise<ReqMeta> {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get("user-agent") };
}
