import { generateKeyPairSync } from "node:crypto";
import { afterAll } from "vitest";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
process.env.DATABASE_URL = "pglite://memory";
process.env.LOG_LEVEL = "silent";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.ENTITLEMENT_SIGNING_KEY = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
process.env.ENTITLEMENT_KEY_ID = "k1";
const spki = publicKey.export({ format: "der", type: "spki" });
process.env.TEST_ENTITLEMENT_PUBLIC_RAW = spki.subarray(spki.length - 32).toString("base64");
delete process.env.RESEND_API_KEY;
delete process.env.STRIPE_SECRET_KEY;

afterAll(async () => {
  const { closeDb } = await import("@/server/db/client");
  await closeDb();
});
