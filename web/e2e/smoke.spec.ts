import { expect, test } from "@playwright/test";

const password = "e2e-password-123";

test("landing page renders with primary CTA and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("See what fills your drive");
  await expect(page.getByRole("link", { name: "Download free" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /Smart Cleanup screen/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { name: "Simple pricing" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("signup → dashboard empty state → logout → login", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No reports yet" })).toBeVisible();
  await expect(page.getByText("Confirm your email.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Free plan" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?signed_out=1/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password" })).toBeVisible();

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("desktop device linking via /activate", async ({ page, request }) => {
  const email = `link-${Date.now()}@example.com`;
  const fingerprint = "ab".repeat(32);
  const auth = await request.post("/api/v1/devices/authorize", {
    data: { fingerprint, name: "DESKTOP-E2E", platform: "windows", app_version: "2.0.0" },
  });
  expect(auth.status()).toBe(200);
  const flow = await auth.json();

  const pending = await request.post("/api/v1/devices/token", { data: { device_code: flow.device_code } });
  expect((await pending.json()).error.code).toBe("authorization_pending");

  // Not signed in → login (with next back to /activate) → create an account from there.
  const verify = new URL(flow.verification_uri_complete);
  await page.goto(verify.pathname + verify.search);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Link this PC to your account?" })).toBeVisible();
  await expect(page.getByText("DESKTOP-E2E")).toBeVisible();
  await page.getByRole("button", { name: "Authorize" }).click();
  await expect(page.getByText(/PC linked|is linked to/).first()).toBeVisible();

  await page.waitForTimeout(5_000); // respect the polling interval
  const tok = await request.post("/api/v1/devices/token", { data: { device_code: flow.device_code } });
  expect(tok.status()).toBe(200);
  const body = await tok.json();
  expect(body.account.email).toBe(email);

  const ent = await request.get("/api/v1/entitlement", {
    headers: { Authorization: `Bearer ${body.access_token}`, "X-Device-Fingerprint": fingerprint },
  });
  expect(ent.status()).toBe(200);
  const payload = JSON.parse(Buffer.from((await ent.json()).payload, "base64url").toString());
  expect(payload).toMatchObject({ plan: "free", pro: false, features: ["scan"], fingerprint });

  await page.goto("/dashboard/devices");
  await expect(page.getByText("DESKTOP-E2E")).toBeVisible();
  await page.getByRole("button", { name: "Remove DESKTOP-E2E" }).click();
  await expect(page.getByRole("heading", { name: "No PCs linked" })).toBeVisible();
  const revoked = await request.get("/api/v1/entitlement", {
    headers: { Authorization: `Bearer ${body.access_token}`, "X-Device-Fingerprint": fingerprint },
  });
  expect(revoked.status()).toBe(401);
});

test("billing shows a clear error when Stripe is not configured", async ({ page }) => {
  await page.goto("/signup?next=%2Fdashboard%2Fbilling");
  await page.getByLabel("Email").fill(`bill-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard\/billing/);
  await page.getByRole("button", { name: "Start trial — monthly" }).click();
  await expect(page).toHaveURL(/error=billing_not_configured/);
  await expect(page.getByRole("alert").filter({ hasText: "Billing isn't configured" })).toBeVisible();
});
