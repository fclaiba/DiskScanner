import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** base64url without padding. */
export function b64url(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

export function randomToken(bytes = 32): string {
  return b64url(randomBytes(bytes));
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Contract §1: 8 chars of BCDFGHJKLMNPQRSTVWXZ, formatted XXXX-XXXX. */
export const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";

export function generateUserCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Normalizes user input (lowercase, spaces, missing dash) to XXXX-XXXX, or null. */
export function normalizeUserCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (raw.length !== 8) return null;
  for (const ch of raw) if (!USER_CODE_ALPHABET.includes(ch)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
