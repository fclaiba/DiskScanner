import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { subscriptions, type Subscription } from "../db/schema";
import { isProStatus, planForStatus, type Plan, type SubscriptionStatus } from "@/config/plans";

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const db = await getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return row ?? null;
}

export interface AccountPlan {
  plan: Plan;
  status: SubscriptionStatus;
  pro: boolean;
  subscription: Subscription | null;
}

export function accountPlanFrom(sub: Subscription | null): AccountPlan {
  const status: SubscriptionStatus = sub?.status ?? "none";
  return { plan: planForStatus(status), status, pro: isProStatus(status), subscription: sub };
}

export async function getAccountPlan(userId: string): Promise<AccountPlan> {
  return accountPlanFrom(await getSubscription(userId));
}
