import { NextResponse, type NextRequest } from "next/server";
import { checkoutSchema } from "@/lib/schemas/billing";
import { isSameOrigin } from "@/server/http";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/sessions";
import { createCheckout } from "@/server/billing/checkout";
import { BillingNotConfiguredError } from "@/server/billing/stripe";
import { env } from "@/server/env";
import { log } from "@/server/log";

/** Form POST from /dashboard/billing → 303 to Stripe Checkout (or the portal). */
export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${env.siteUrl}/dashboard/billing?${q}`, 303);
  if (!isSameOrigin(req)) return NextResponse.json({ error: { code: "forbidden", message: "Cross-site request blocked." } }, { status: 403 });
  const session = await getSessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(`${env.siteUrl}/login?next=${encodeURIComponent("/dashboard/billing")}`, 303);
  const form = await req.formData().catch(() => null);
  const parsed = checkoutSchema.safeParse({ interval: form?.get("interval") });
  if (!parsed.success) return back("error=invalid_plan");
  try {
    const result = await createCheckout(session.user, parsed.data.interval);
    return NextResponse.redirect(result.url, 303);
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) {
      log.warn("checkout attempted without billing config", { userId: session.user.id });
      return back("error=billing_not_configured");
    }
    log.error("checkout failed", { userId: session.user.id, err });
    return back("error=checkout_failed");
  }
}
