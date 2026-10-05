import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { stripeEvents, subscriptions, users } from "../db/schema";
import { audit } from "../audit";
import { log } from "../log";
import { getStripe, type Stripe } from "./stripe";
import { isProStatus, type BillingInterval, type SubscriptionStatus } from "@/config/plans";

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
] as const;

/** Maps Stripe's subscription status to the contract's SubscriptionStatus. */
export function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "incomplete":
    case "unpaid":
      return status;
    case "incomplete_expired":
      return "canceled";
    case "paused":
      // Trial ended without a payment method: no access until resumed.
      return "unpaid";
    default:
      return "incomplete";
  }
}

function idOf(x: string | { id: string } | null | undefined): string | null {
  if (!x) return null;
  return typeof x === "string" ? x : x.id;
}

/** current_period_end lives on items since API 2025-03-31; fall back to the legacy field. */
export function periodEndOf(sub: Stripe.Subscription): Date | null {
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const fromItems = sub.items?.data?.reduce<number | null>(
    (max, it) => (it.current_period_end && (max === null || it.current_period_end > max) ? it.current_period_end : max),
    null,
  );
  const ts = fromItems ?? legacy ?? null;
  return ts ? new Date(ts * 1000) : null;
}

async function resolveUserId(sub: Stripe.Subscription, hint?: string | null): Promise<string | null> {
  const db = await getDb();
  const candidates = [hint, sub.metadata?.user_id].filter((x): x is string => typeof x === "string" && x.length > 0);
  for (const id of candidates) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (u) return u.id;
  }
  const customerId = idOf(sub.customer);
  if (customerId) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
    if (u) return u.id;
  }
  return null;
}

/** Upserts the user's single subscription row from a Stripe subscription object. */
export async function syncSubscription(sub: Stripe.Subscription, userHint?: string | null): Promise<void> {
  const userId = await resolveUserId(sub, userHint);
  if (!userId) {
    log.warn("stripe subscription without matching user", { subscriptionId: sub.id });
    return;
  }
  const db = await getDb();
  const status = mapStripeStatus(sub.status);
  const item = sub.items?.data?.[0];
  const interval = (item?.price?.recurring?.interval ?? null) as BillingInterval | null;
  const values = {
    userId,
    stripeSubscriptionId: sub.id,
    status,
    priceId: item?.price?.id ?? null,
    interval: interval === "month" || interval === "year" ? interval : null,
    currentPeriodEnd: periodEndOf(sub),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    updatedAt: new Date(),
  };

  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (
    existing &&
    existing.stripeSubscriptionId &&
    existing.stripeSubscriptionId !== sub.id &&
    isProStatus(existing.status) &&
    !isProStatus(status)
  ) {
    // A stale/older subscription must not override the user's current Pro one.
    log.info("ignoring update for superseded subscription", { userId, subscriptionId: sub.id });
    return;
  }
  // The subscription id might be attached to another row only in pathological cases; clear it.
  await db
    .update(subscriptions)
    .set({ stripeSubscriptionId: null })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.userId, set: values });

  if (!existing || existing.status !== status) {
    await audit("subscription.change", userId, { from: existing?.status ?? "none", to: status, subscription_id: sub.id });
  }
  const customerId = idOf(sub.customer);
  if (customerId) {
    const [u] = await db.select({ c: users.stripeCustomerId }).from(users).where(eq(users.id, userId)).limit(1);
    if (u && !u.c) await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = invoice.parent?.subscription_details?.subscription;
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  return idOf(fromParent ?? legacy ?? null);
}

async function processEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;
      const subId = idOf(session.subscription as string | { id: string } | null);
      if (!subId) return;
      const userHint = session.client_reference_id ?? session.metadata?.user_id ?? null;
      const customerId = idOf(session.customer as string | { id: string } | null);
      if (userHint && customerId) {
        const db = await getDb();
        const [u] = await db.select().from(users).where(eq(users.id, userHint)).limit(1);
        if (u && !u.stripeCustomerId) await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, u.id));
      }
      await syncSubscription(await stripe.subscriptions.retrieve(subId), userHint);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(event.type === "customer.subscription.deleted" ? { ...sub, status: "canceled" } : sub);
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
      if (!subId) return;
      await syncSubscription(await stripe.subscriptions.retrieve(subId));
      return;
    }
    default:
      return;
  }
}

export type WebhookOutcome =
  | { status: 200; body: { received: true; duplicate?: boolean } }
  | { status: 400; body: { error: { code: string; message: string } } }
  | { status: 500; body: { error: { code: string; message: string } } };

/**
 * Verifies the signature on the raw body, de-duplicates by event id
 * (insert-first) and applies the event. On processing failure the event row
 * is removed so Stripe's retry gets processed.
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
  secret: string,
  stripe: Stripe = getStripe(),
): Promise<WebhookOutcome> {
  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("missing signature");
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return { status: 400, body: { error: { code: "invalid_signature", message: "Invalid Stripe signature." } } };
  }

  const db = await getDb();
  const inserted = await db
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  if (inserted.length === 0) return { status: 200, body: { received: true, duplicate: true } };

  try {
    await processEvent(event, stripe);
    return { status: 200, body: { received: true } };
  } catch (err) {
    await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
    log.error("stripe webhook processing failed", { eventId: event.id, type: event.type, err });
    return { status: 500, body: { error: { code: "processing_failed", message: "Webhook processing failed." } } };
  }
}
