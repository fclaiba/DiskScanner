#!/usr/bin/env node
// Generates an Ed25519 key pair for signing desktop entitlements.
//   ENTITLEMENT_SIGNING_KEY = base64 PKCS#8 DER private key (server env, secret)
//   <kid>:<base64 raw 32-byte public key> = line for the desktop app
//     (ENTITLEMENT_PUBLIC_KEYS in desktop/licensing.py, or DISKSCANNER_ENTITLEMENT_PUBKEY in dev)
// Usage: node scripts/generate-entitlement-keys.mjs [kid]   (default kid: k1)
import { generateKeyPairSync } from "node:crypto";

const kid = process.argv[2] ?? process.env.ENTITLEMENT_KEY_ID ?? "k1";
if (!/^[A-Za-z0-9_-]{1,32}$/.test(kid)) {
  console.error("kid must match [A-Za-z0-9_-]{1,32}");
  process.exit(1);
}
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" });
const spki = publicKey.export({ format: "der", type: "spki" });
const raw = spki.subarray(spki.length - 32);

console.log("# Server (.env / Vercel env) — keep secret:");
console.log(`ENTITLEMENT_SIGNING_KEY=${pkcs8.toString("base64")}`);
console.log(`ENTITLEMENT_KEY_ID=${kid}`);
console.log("");
console.log("# Desktop public key (kid:base64raw) — safe to embed:");
console.log(`${kid}:${raw.toString("base64")}`);
