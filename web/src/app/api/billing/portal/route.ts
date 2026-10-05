import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/server/http";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/sessions";
import { createPortal } from "@/server/billing/checkout";
import { BillingNotConfiguredError } from "@/server/billing/stripe";
import { env } from "@/server/env";
import { log } from "@/server/log";

/** Form POST → 303 to the Stripe Customer Portal (manage plan, payment method, cancel). */
export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${env.siteUrl}/dashboard/billing?${q}`, 303);
  if (!isSameOrigin(req)) return NextResponse.json({ error: { code: "forbidden", message: "Cross-site request blocked." } }, { status: 403 });
  const session = await getSessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(`${env.siteUrl}/login?next=${encodeURIComponent("/dashboard/billing")}`, 303);
  try {
    return NextResponse.redirect(await createPortal(session.user), 303);
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) return back("error=billing_not_configured");
    log.error("portal session failed", { userId: session.user.id, err });
    return back("error=portal_failed");
  }
}
