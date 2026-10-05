import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { env } from "../env";
import { b64url } from "../crypto";
import {
  ENTITLEMENT_TTL_SECONDS,
  PLAN_FEATURES,
  isProStatus,
  planForStatus,
  type Feature,
  type Plan,
  type SubscriptionStatus,
} from "@/config/plans";

/** Contract: EntitlementPayload (field order is the serialization order). */
export interface EntitlementPayload {
  v: 1;
  device_id: string;
  fingerprint: string;
  account_email: string;
  plan: Plan;
  status: SubscriptionStatus;
  pro: boolean;
  features: Feature[];
  current_period_end: string | null;
  issued_at: number;
  expires_at: number;
}

export interface SignedEntitlement {
  payload: string;
  signature: string;
  kid: string;
}

export class EntitlementKeyMissingError extends Error {
  constructor() {
    super("ENTITLEMENT_SIGNING_KEY is not configured");
  }
}

let cached: { raw: string; key: KeyObject } | undefined;

function signingKey(): KeyObject {
  const raw = env.entitlementSigningKey;
  if (!raw) throw new EntitlementKeyMissingError();
  if (cached?.raw === raw) return cached.key;
  const key = createPrivateKey({ key: Buffer.from(raw, "base64"), format: "der", type: "pkcs8" });
  if (key.asymmetricKeyType !== "ed25519") throw new Error("ENTITLEMENT_SIGNING_KEY must be an Ed25519 key");
  cached = { raw, key };
  return key;
}

export function buildEntitlementPayload(input: {
  deviceId: string;
  fingerprint: string;
  email: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  now?: Date;
}): EntitlementPayload {
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const plan = planForStatus(input.status);
  return {
    v: 1,
    device_id: input.deviceId,
    fingerprint: input.fingerprint,
    account_email: input.email,
    plan,
    status: input.status,
    pro: isProStatus(input.status),
    features: [...PLAN_FEATURES[plan]],
    current_period_end: input.currentPeriodEnd ? input.currentPeriodEnd.toISOString() : null,
    issued_at: issuedAt,
    expires_at: issuedAt + ENTITLEMENT_TTL_SECONDS,
  };
}

/** Signs the exact JSON bytes of the payload with Ed25519. */
export function signEntitlement(payload: EntitlementPayload): SignedEntitlement {
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = sign(null, bytes, signingKey());
  return { payload: b64url(bytes), signature: b64url(signature), kid: env.entitlementKeyId };
}
