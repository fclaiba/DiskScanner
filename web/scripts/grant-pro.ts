// DEV ONLY: give an existing account an active Pro subscription without Stripe.
//   npm run dev:grant-pro -- you@example.com [--status=trialing|active|past_due|canceled] [--days=30]
// With a file-backed PGlite DB (default), stop `npm run dev` first: PGlite
// allows a single process per data directory.
import "./load-env";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/server/db/client";
import { subscriptions, users } from "../src/server/db/schema";

const STATUSES = ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete"] as const;
type Status = (typeof STATUSES)[number];

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("grant-pro refuses to run in production.");
  }
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"))?.toLowerCase();
  if (!email) throw new Error("Usage: npm run dev:grant-pro -- <email> [--status=active] [--days=30]");
  const status = (args.find((a) => a.startsWith("--status="))?.split("=")[1] ?? "active") as Status;
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(", ")}`);
  const days = Number(args.find((a) => a.startsWith("--days="))?.split("=")[1] ?? "30");

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`No user with email ${email}. Sign up first.`);
  const values = {
    userId: user.id,
    stripeSubscriptionId: `dev_sub_${user.id.slice(0, 8)}`,
    status,
    priceId: "dev_price",
    interval: "month" as const,
    currentPeriodEnd: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    updatedAt: new Date(),
  };
  await db.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.userId, set: values });
  console.log(`${email} now has status "${status}" until ${values.currentPeriodEnd.toISOString()}.`);
}

main()
  .then(() => closeDb())
  .then(
    () => process.exit(0),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
