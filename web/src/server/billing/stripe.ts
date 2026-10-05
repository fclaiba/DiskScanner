import Stripe from "stripe";
import { env } from "../env";

export class BillingNotConfiguredError extends Error {
  constructor(what = "STRIPE_SECRET_KEY") {
    super(`Billing is not configured (${what} missing)`);
  }
}

let client: Stripe | undefined;
let override: Stripe | undefined;

/** Lazily constructed so builds and dev work without Stripe credentials. */
export function getStripe(): Stripe {
  if (override) return override;
  const key = env.stripeSecretKey;
  if (!key) throw new BillingNotConfiguredError();
  client ??= new Stripe(key, { appInfo: { name: "DiskScanner Turbo Web" }, maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

/** Test hook: inject a mock client (pass undefined to reset). */
export function setStripeForTests(mock: Stripe | undefined): void {
  override = mock;
}

export { Stripe };
