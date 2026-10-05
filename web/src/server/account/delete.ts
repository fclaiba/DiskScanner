import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { subscriptions, users, type User } from "../db/schema";
import { verifyPassword } from "../auth/password";
import { audit } from "../audit";
import { log } from "../log";
import { getStripe, type Stripe } from "../billing/stripe";

export type DeleteAccountResult = { ok: true } | { ok: false; message: string };

const CANCELABLE = new Set(["trialing", "active", "past_due", "incomplete", "unpaid"]);

/**
 * Deletes the account after password confirmation. Any live Stripe
 * subscription is canceled immediately first; if that fails, nothing is
 * deleted (so the user is never left paying for a deleted account).
 */
export async function deleteAccount(
  user: User,
  password: string,
  ip?: string,
  stripeFactory: () => Stripe = getStripe,
): Promise<DeleteAccountResult> {
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, message: "That password is incorrect." };
  }
  const db = await getDb();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
  if (sub?.stripeSubscriptionId && CANCELABLE.has(sub.status)) {
    try {
      await stripeFactory().subscriptions.cancel(sub.stripeSubscriptionId, { prorate: false });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "resource_missing") {
        log.error("subscription cancel failed during account deletion", { userId: user.id, err });
        return { ok: false, message: "We couldn't cancel your subscription. Nothing was deleted — please try again or contact support." };
      }
    }
  }
  // Cascades remove sessions, devices, reports, tokens and the subscription row.
  await db.delete(users).where(eq(users.id, user.id));
  await audit("account.delete", null, { deleted_user_id: user.id, had_subscription: Boolean(sub?.stripeSubscriptionId) }, ip);
  return { ok: true };
}
