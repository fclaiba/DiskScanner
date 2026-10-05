import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { apiError } from "@/server/http";
import { handleStripeWebhook } from "@/server/billing/webhook";
import { log } from "@/server/log";

export async function POST(req: Request) {
  const secret = env.stripeWebhookSecret;
  if (!secret || !env.stripeSecretKey) {
    log.error("stripe webhook received but billing is not configured");
    return apiError(503, "billing_not_configured", "Billing is not configured.");
  }
  const raw = await req.text();
  const outcome = await handleStripeWebhook(raw, req.headers.get("stripe-signature"), secret);
  return NextResponse.json(outcome.body, { status: outcome.status });
}
