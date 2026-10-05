import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users, type User } from "../db/schema";
import { env } from "../env";
import { BillingNotConfiguredError, getStripe, type Stripe } from "./stripe";
import { getSubscription } from "./subscriptions";
import { isProStatus, type BillingInterval } from "@/config/plans";

/** Returns the user's Stripe customer id, creating (and storing) one if needed. */
export async function ensureStripeCustomer(user: User, stripe: Stripe = getStripe()): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create(
    { email: user.email, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-create-${user.id}` },
  );
  const db = await getDb();
  await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, user.id));
  return customer.id;
}

export function priceForInterval(interval: BillingInterval): string {
  const price = interval === "year" ? env.stripePriceYearly : env.stripePriceMonthly;
  if (!price) throw new BillingNotConfiguredError(interval === "year" ? "STRIPE_PRICE_PRO_YEARLY" : "STRIPE_PRICE_PRO_MONTHLY");
  return price;
}

export type CheckoutResult = { kind: "checkout"; url: string } | { kind: "portal"; url: string };

/**
 * Creates a subscription Checkout Session. Prices always come from the server
 * env. Users who already have an active Pro subscription get the portal instead.
 */
export async function createCheckout(
  user: User,
  interval: BillingInterval,
  stripe: Stripe = getStripe(),
): Promise<CheckoutResult> {
  const price = priceForInterval(interval);
  const existing = await getSubscription(user.id);
  if (existing && isProStatus(existing.status)) {
    return { kind: "portal", url: await createPortal(user, stripe) };
  }
  const customer = await ensureStripeCustomer(user, stripe);
  const trialDays = env.stripeTrialDays;
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${env.siteUrl}/dashboard/billing?checkout=success`,
    cancel_url: `${env.siteUrl}/dashboard/billing?checkout=cancelled`,
    subscription_data: {
      metadata: { user_id: user.id },
      // Trial only for users who never had a subscription.
      ...(existing === null && trialDays > 0 ? { trial_period_days: trialDays } : {}),
    },
    metadata: { user_id: user.id },
  };
  if (env.stripeAutomaticTax) {
    params.automatic_tax = { enabled: true };
    params.customer_update = { address: "auto", name: "auto" };
    params.billing_address_collection = "required";
  }
  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) throw new Error("Stripe returned a checkout session without url");
  return { kind: "checkout", url: session.url };
}

export async function createPortal(user: User, stripe: Stripe = getStripe()): Promise<string> {
  const customer = await ensureStripeCustomer(user, stripe);
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: `${env.siteUrl}/dashboard/billing`,
  });
  return session.url;
}
