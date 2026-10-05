import fs from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { defineConfig, devices, chromium } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3210);
const BASE_URL = `http://localhost:${PORT}`;

// Fresh signing key per run; in-memory PGlite so every run starts empty.
const signingKey =
  process.env.ENTITLEMENT_SIGNING_KEY ??
  generateKeyPairSync("ed25519").privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

// Use Playwright's bundled Chromium when present, otherwise the preinstalled one.
let executablePath: string | undefined;
try {
  if (!fs.existsSync(chromium.executablePath())) executablePath = "/opt/pw-browsers/chromium";
} catch {
  executablePath = "/opt/pw-browsers/chromium";
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build + start against an isolated in-memory database.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/v1/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      DATABASE_URL: "pglite://memory",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      ENTITLEMENT_SIGNING_KEY: signingKey,
      ENTITLEMENT_KEY_ID: "k1",
      LOG_LEVEL: "warn",
      STRIPE_SECRET_KEY: "",
      RESEND_API_KEY: "",
    },
  },
});
