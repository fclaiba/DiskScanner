import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { handleStripeWebhook, mapStripeStatus, periodEndOf, syncSubscription } from "@/server/billing/webhook";
import { createCheckout, createPortal, ensureStripeCustomer, priceForInterval } from "@/server/billing/checkout";
import { BillingNotConfiguredError, getStripe, setStripeForTests } from "@/server/billing/stripe";
import { getAccountPlan, getSubscription } from "@/server/billing/subscriptions";
import { POST as webhookRoute } from "@/app/api/stripe/webhook/route";
import { POST as checkoutRoute } from "@/app/api/billing/checkout/route";
import { POST as portalRoute } from "@/app/api/billing/portal/route";
import { createSession, SESSION_COOKIE } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { stripeEvents, subscriptions, users, auditLog } from "@/server/db/schema";
import { BASE, createUser, resetDb } from "./helpers";
import type { User } from "@/server/db/schema";

const SECRET = "whsec_test_secret";
const real = new Stripe("sk_test_dummy");

function subObj(over: Partial<Record<string, unknown>> = {}, user?: User) {
  return {
    id: "sub_123",
    object: "subscription",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: user ? { user_id: user.id } : {},
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          current_period_end: 1_900_000_000,
          price: { id: "price_year", recurring: { interval: "year" } },
        },
      ],
    },
    ...over,
  };
}

function signed(event: Record<string, unknown>) {
  const payload = JSON.stringify({ object: "event", api_version: "2026-09-30", created: 1, livemode: false, ...event });
  const header = real.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { payload, header };
}

function mockStripe(over: Record<string, unknown> = {}) {
  const m = {
    webhooks: real.webhooks,
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_new" }) },
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test" }) } },
    billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/p/session/x" }) } },
    subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
    ...over,
  };
  return m as typeof m & Stripe;
}

beforeEach(async () => {
  await resetDb();
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_month";
  process.env.STRIPE_PRICE_PRO_YEARLY = "price_year";
  delete process.env.STRIPE_TRIAL_DAYS;
  delete process.env.STRIPE_AUTOMATIC_TAX;
});
afterEach(() => {
  setStripeForTests(undefined);
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

describe("status mapping", () => {
  it("maps every Stripe status to the contract", () => {
    expect(mapStripeStatus("trialing")).toBe("trialing");
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("canceled")).toBe("canceled");
    expect(mapStripeStatus("unpaid")).toBe("unpaid");
    expect(mapStripeStatus("incomplete")).toBe("incomplete");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
    expect(mapStripeStatus("paused")).toBe("unpaid");
    expect(mapStripeStatus("something_new")).toBe("incomplete");
  });

  it("reads current_period_end from items or the legacy field", () => {
    expect(periodEndOf(subObj() as unknown as Stripe.Subscription)?.getTime()).toBe(1_900_000_000_000);
    const legacy = subObj({ items: { data: [] }, current_period_end: 1_800_000_000 });
    expect(periodEndOf(legacy as unknown as Stripe.Subscription)?.getTime()).toBe(1_800_000_000_000);
    expect(periodEndOf(subObj({ items: { data: [] } }) as unknown as Stripe.Subscription)).toBeNull();
  });
});

describe("webhook", () => {
  it("rejects bad or missing signatures", async () => {
    const stripe = mockStripe();
    const { payload } = signed({ id: "evt_1", type: "customer.subscription.updated", data: { object: subObj() } });
    expect((await handleStripeWebhook(payload, "t=1,v1=deadbeef", SECRET, stripe)).status).toBe(400);
    expect((await handleStripeWebhook(payload, null, SECRET, stripe)).status).toBe(400);
    const { header } = signed({ id: "evt_1", type: "x", data: { object: {} } });
    expect((await handleStripeWebhook(payload + " ", header, SECRET, stripe)).status).toBe(400);
  });

  it("subscription.created → upsert, idempotent by event id, audited", async () => {
    const user = await createUser();
    const stripe = mockStripe();
    const ev = signed({ id: "evt_sub_created", type: "customer.subscription.created", data: { object: subObj({ status: "trialing" }, user) } });
    const r1 = await handleStripeWebhook(ev.payload, ev.header, SECRET, stripe);
    expect(r1).toEqual({ status: 200, body: { received: true } });
    const sub = await getSubscription(user.id);
    expect(sub).toMatchObject({
      status: "trialing",
      stripeSubscriptionId: "sub_123",
      priceId: "price_year",
      interval: "year",
      cancelAtPeriodEnd: false,
    });
    expect(sub!.currentPeriodEnd?.getTime()).toBe(1_900_000_000_000);
    expect((await getAccountPlan(user.id)).pro).toBe(true);
    // stripe customer id learned from the subscription
    const db = await getDb();
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    expect(u!.stripeCustomerId).toBe("cus_123");

    const r2 = await handleStripeWebhook(ev.payload, ev.header, SECRET, stripe);
    expect(r2).toEqual({ status: 200, body: { received: true, duplicate: true } });
    expect(await db.select().from(stripeEvents)).toHaveLength(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "subscription.change"))).toHaveLength(1);
  });

  it("updated (cancel at period end) and deleted events", async () => {
    const user = await createUser();
    const stripe = mockStripe();
    for (const [i, [type, obj]] of (
      [
        ["customer.subscription.updated", subObj({ cancel_at_period_end: true }, user)],
        ["customer.subscription.deleted", subObj({ status: "active" }, user)],
      ] as const
    ).entries()) {
      const ev = signed({ id: `evt_${i}`, type, data: { object: obj } });
      expect((await handleStripeWebhook(ev.payload, ev.header, SECRET, stripe)).status).toBe(200);
      const sub = await getSubscription(user.id);
      if (i === 0) expect(sub).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
      else expect(sub!.status).toBe("canceled");
    }
    expect((await getAccountPlan(user.id)).pro).toBe(false);
  });

  it("checkout.session.completed retrieves the subscription and links the customer", async () => {
    const user = await createUser();
    const retrieve = vi.fn().mockResolvedValue(subObj({ customer: "cus_checkout" }));
    const stripe = mockStripe({ subscriptions: { retrieve, cancel: vi.fn() } });
    const ev = signed({
      id: "evt_cs",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", object: "checkout.session", mode: "subscription", subscription: "sub_123", customer: "cus_checkout", client_reference_id: user.id, metadata: {} } },
    });
    expect((await handleStripeWebhook(ev.payload, ev.header, SECRET, stripe)).status).toBe(200);
    expect(retrieve).toHaveBeenCalledWith("sub_123");
    expect((await getSubscription(user.id))!.status).toBe("active");
    const db = await getDb();
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    expect(u!.stripeCustomerId).toBe("cus_checkout");

    const pay = signed({ id: "evt_cs_pay", type: "checkout.session.completed", data: { object: { id: "cs_2", mode: "payment" } } });
    expect((await handleStripeWebhook(pay.payload, pay.header, SECRET, stripe)).status).toBe(200);
  });

  it("invoice.payment_failed / invoice.paid refresh status from Stripe", async () => {
    const user = await createUser();
    const db = await getDb();
    await db.update(users).set({ stripeCustomerId: "cus_123" }).where(eq(users.id, user.id));
    const retrieve = vi.fn().mockResolvedValueOnce(subObj({ status: "past_due" })).mockResolvedValueOnce(subObj({ status: "active" }));
    const stripe = mockStripe({ subscriptions: { retrieve, cancel: vi.fn() } });

    const failed = signed({
      id: "evt_inv_f",
      type: "invoice.payment_failed",
      data: { object: { id: "in_1", object: "invoice", parent: { subscription_details: { subscription: "sub_123" } } } },
    });
    await handleStripeWebhook(failed.payload, failed.header, SECRET, stripe);
    expect((await getSubscription(user.id))!.status).toBe("past_due");
    expect((await getAccountPlan(user.id)).pro).toBe(true); // past_due keeps Pro

    const paid = signed({ id: "evt_inv_p", type: "invoice.paid", data: { object: { id: "in_2", object: "invoice", subscription: "sub_123" } } });
    await handleStripeWebhook(paid.payload, paid.header, SECRET, stripe);
    expect((await getSubscription(user.id))!.status).toBe("active");

    const noSub = signed({ id: "evt_inv_n", type: "invoice.paid", data: { object: { id: "in_3", object: "invoice", parent: null } } });
    expect((await handleStripeWebhook(noSub.payload, noSub.header, SECRET, stripe)).status).toBe(200);
    const other = signed({ id: "evt_other", type: "customer.created", data: { object: {} } });
    expect((await handleStripeWebhook(other.payload, other.header, SECRET, stripe)).status).toBe(200);
  });

  it("processing failure removes the event row so Stripe can retry", async () => {
    await createUser();
    const stripe = mockStripe({ subscriptions: { retrieve: vi.fn().mockRejectedValue(new Error("boom")), cancel: vi.fn() } });
    const ev = signed({ id: "evt_fail", type: "invoice.paid", data: { object: { id: "in", subscription: "sub_1" } } });
    expect((await handleStripeWebhook(ev.payload, ev.header, SECRET, stripe)).status).toBe(500);
    const db = await getDb();
    expect(await db.select().from(stripeEvents)).toHaveLength(0);
  });

  it("stale subscription does not override a newer Pro one; unknown users are ignored", async () => {
    const user = await createUser({ status: "active" });
    await syncSubscription(subObj({ id: "sub_old", status: "canceled" }, user) as unknown as Stripe.Subscription);
    expect((await getSubscription(user.id))!.status).toBe("active");
    await syncSubscription(subObj({ id: "sub_ghost", customer: "cus_ghost" }) as unknown as Stripe.Subscription);
    const db = await getDb();
    expect(await db.select().from(subscriptions)).toHaveLength(1);
  });

  it("route: 503 when not configured, verifies signature with env secret when configured", async () => {
    const ev = signed({ id: "evt_route", type: "customer.created", data: { object: {} } });
    const mk = () =>
      new NextRequest(`${BASE}/api/stripe/webhook`, { method: "POST", body: ev.payload, headers: { "stripe-signature": ev.header } });
    expect((await webhookRoute(mk())).status).toBe(503);
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    setStripeForTests(mockStripe());
    const res = await webhookRoute(mk());
    expect(res.status).toBe(200);
  });
});

describe("checkout", () => {
  it("lazy client: throws BillingNotConfiguredError without a key; prices from env only", () => {
    expect(() => getStripe()).toThrow(BillingNotConfiguredError);
    process.env.STRIPE_SECRET_KEY = "sk_test_lazy";
    expect(getStripe()).toBeInstanceOf(Stripe);
    expect(priceForInterval("month")).toBe("price_month");
    expect(priceForInterval("year")).toBe("price_year");
    delete process.env.STRIPE_PRICE_PRO_YEARLY;
    expect(() => priceForInterval("year")).toThrow(BillingNotConfiguredError);
  });

  it("creates the customer once and a subscription session with trial for first-time users", async () => {
    const user = await createUser();
    const stripe = mockStripe();
    const res = await createCheckout(user, "month", stripe);
    expect(res).toEqual({ kind: "checkout", url: "https://checkout.stripe.com/c/pay/cs_test" });
    expect(stripe.customers.create).toHaveBeenCalledWith(
      { email: user.email, metadata: { user_id: user.id } },
      { idempotencyKey: `customer-create-${user.id}` },
    );
    const params = (stripe.checkout.sessions.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(params).toMatchObject({
      mode: "subscription",
      customer: "cus_new",
      client_reference_id: user.id,
      line_items: [{ price: "price_month", quantity: 1 }],
      allow_promotion_codes: true,
      success_url: "http://localhost:3000/dashboard/billing?checkout=success",
      subscription_data: { metadata: { user_id: user.id }, trial_period_days: 7 },
    });
    expect(params.automatic_tax).toBeUndefined();

    const db = await getDb();
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    expect(u!.stripeCustomerId).toBe("cus_new");
    expect(await ensureStripeCustomer(u!, stripe)).toBe("cus_new");
    expect(stripe.customers.create).toHaveBeenCalledTimes(1);
  });

  it("no trial for returning subscribers; automatic tax and custom trial via env", async () => {
    process.env.STRIPE_AUTOMATIC_TAX = "true";
    process.env.STRIPE_TRIAL_DAYS = "14";
    const fresh = await createUser();
    const s1 = mockStripe();
    await createCheckout(fresh, "year", s1);
    const p1 = (s1.checkout.sessions.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(p1.subscription_data.trial_period_days).toBe(14);
    expect(p1.automatic_tax).toEqual({ enabled: true });
    expect(p1.line_items[0].price).toBe("price_year");

    const returning = await createUser({ status: "canceled" });
    const s2 = mockStripe({ customers: { create: vi.fn().mockResolvedValue({ id: "cus_returning" }) } });
    await createCheckout(returning, "month", s2);
    const p2 = (s2.checkout.sessions.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(p2.subscription_data.trial_period_days).toBeUndefined();
  });

  it("active subscribers are sent to the portal instead of a second subscription", async () => {
    const user = await createUser({ status: "active" });
    const stripe = mockStripe();
    const res = await createCheckout(user, "month", stripe);
    expect(res.kind).toBe("portal");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(await createPortal(user, stripe)).toMatch(/^https:\/\/billing\.stripe\.com/);
  });

  it("checkout/portal routes: origin check, auth, not-configured banner, redirect", async () => {
    const user = await createUser();
    const s = await createSession(user.id);
    const mk = (path: string, origin: string, body?: string, cookie = true) =>
      new NextRequest(`${BASE}${path}`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/x-www-form-urlencoded",
          ...(cookie ? { cookie: `${SESSION_COOKIE}=${s.token}` } : {}),
        },
        body,
      });
    expect((await checkoutRoute(mk("/api/billing/checkout", "https://evil.example", "interval=month"))).status).toBe(403);
    const anon = await checkoutRoute(mk("/api/billing/checkout", BASE, "interval=month", false));
    expect(anon.headers.get("location")).toContain("/login?next=");
    const bad = await checkoutRoute(mk("/api/billing/checkout", BASE, "interval=weekly"));
    expect(bad.headers.get("location")).toContain("error=invalid_plan");
    const notConfigured = await checkoutRoute(mk("/api/billing/checkout", BASE, "interval=month"));
    expect(notConfigured.status).toBe(303);
    expect(notConfigured.headers.get("location")).toContain("error=billing_not_configured");
    expect((await portalRoute(mk("/api/billing/portal", BASE))).headers.get("location")).toContain("error=billing_not_configured");

    setStripeForTests(mockStripe());
    const ok = await checkoutRoute(mk("/api/billing/checkout", BASE, "interval=year"));
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("https://checkout.stripe.com/c/pay/cs_test");
    const portal = await portalRoute(mk("/api/billing/portal", BASE));
    expect(portal.headers.get("location")).toBe("https://billing.stripe.com/p/session/x");
    expect((await portalRoute(mk("/api/billing/portal", "https://evil.example"))).status).toBe(403);

    setStripeForTests(mockStripe({ checkout: { sessions: { create: vi.fn().mockRejectedValue(new Error("x")) } } }));
    const failed = await checkoutRoute(mk("/api/billing/checkout", BASE, "interval=year"));
    expect(failed.headers.get("location")).toContain("error=checkout_failed");
  });
});
