/**
 * Hybrid billing authenticated staging journeys (India→Razorpay, GB/US→Stripe).
 *
 * Credentials via environment only — never hardcode:
 *
 *   E2E_BILLING_ENABLED=true
 *   E2E_BASE_URL=http://localhost:8080   # or staging URL
 *
 * Per-market accounts (preferred):
 *   E2E_IN_EMAIL / E2E_IN_PASSWORD   # Indian company
 *   E2E_GB_EMAIL / E2E_GB_PASSWORD   # UK company
 *   E2E_US_EMAIL / E2E_US_PASSWORD   # US company
 *
 * Or single account + country:
 *   E2E_EMAIL / E2E_PASSWORD / E2E_BILLING_COUNTRY=IN|GB|US
 *
 * Mutations (opens provider Checkout — test mode only):
 *   E2E_BILLING_MUTATIONS=true
 *
 * Screenshots: playwright config retains artifacts under test-results/.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

type Market = "IN" | "GB" | "US";

const enabled = process.env.E2E_BILLING_ENABLED === "true";
const mutations = process.env.E2E_BILLING_MUTATIONS === "true";
const subscriptionPath = "/settings?section=subscription";
const evidenceDir = join(process.cwd(), "test-results", "hybrid-billing-evidence");

function accountFor(market: Market): { email?: string; password?: string } {
  if (market === "IN") {
    return {
      email: process.env.E2E_IN_EMAIL ?? (process.env.E2E_BILLING_COUNTRY === "IN" ? process.env.E2E_EMAIL : undefined),
      password:
        process.env.E2E_IN_PASSWORD ??
        (process.env.E2E_BILLING_COUNTRY === "IN" ? process.env.E2E_PASSWORD : undefined),
    };
  }
  if (market === "GB") {
    return {
      email: process.env.E2E_GB_EMAIL ?? (process.env.E2E_BILLING_COUNTRY === "GB" ? process.env.E2E_EMAIL : undefined),
      password:
        process.env.E2E_GB_PASSWORD ??
        (process.env.E2E_BILLING_COUNTRY === "GB" ? process.env.E2E_PASSWORD : undefined),
    };
  }
  return {
    email: process.env.E2E_US_EMAIL ?? (process.env.E2E_BILLING_COUNTRY === "US" ? process.env.E2E_EMAIL : undefined),
    password:
      process.env.E2E_US_PASSWORD ??
      (process.env.E2E_BILLING_COUNTRY === "US" ? process.env.E2E_PASSWORD : undefined),
  };
}

async function evidence(page: Page, name: string) {
  try {
    mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({
      path: join(evidenceDir, `${name}.png`),
      fullPage: true,
    });
  } catch {
    /* non-fatal */
  }
}

async function signIn(page: Page, email: string, password: string, destination = subscriptionPath) {
  await page.goto("/auth?redirect=" + encodeURIComponent(destination));
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 45_000 });
}

async function openSubscription(page: Page, email: string, password: string) {
  await signIn(page, email, password);
  await expect(
    page.getByRole("heading", { name: /subscription|billing|plan/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

test.describe("Hybrid staging — gates", () => {
  test.skip(!enabled, "Set E2E_BILLING_ENABLED=true with market credentials.");

  test.beforeAll(() => {
    if (process.env.STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS === "true") {
      throw new Error("Refuse live payment keys for hybrid staging E2E. Use test-mode keys only.");
    }
  });
});

test.describe("Hybrid staging — India → Razorpay", () => {
  const market: Market = "IN";
  const account = accountFor(market);

  test.skip(!enabled || !account.email || !account.password, "Set E2E_IN_EMAIL / E2E_IN_PASSWORD.");

  test("IN — subscription shell loads with INR / Razorpay readiness", async ({ page }) => {
    await openSubscription(page, account.email!, account.password!);
    await evidence(page, "in-subscription-shell");
    await expect(page.getByRole("heading", { name: "Billing documents" })).toBeVisible();
    // Country is org-owned; UI should not offer Stripe card for India when routed.
    const subscribe = page.getByRole("button", { name: "Subscribe" }).first();
    if (await subscribe.isVisible().catch(() => false)) {
      await subscribe.click();
      await expect(page.getByText(/UPI AutoPay|e-mandate/i).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/Secure Stripe Checkout/i)).toHaveCount(0);
      await evidence(page, "in-checkout-methods");
    } else {
      // Already subscribed — assert locked provider messaging / manage billing surface.
      await expect(
        page.getByText(/Razorpay|Manage billing|Subscription|Active|Trial/i).first(),
      ).toBeVisible();
      test.info().annotations.push({
        type: "note",
        description: "Org already subscribed; CheckoutForm Razorpay-only path not exercised.",
      });
    }
  });

  test("IN — Razorpay sandbox checkout mutation", async ({ page }) => {
    test.skip(!mutations, "Set E2E_BILLING_MUTATIONS=true to open Razorpay checkout.");
    await openSubscription(page, account.email!, account.password!);
    const subscribe = page.getByRole("button", { name: "Subscribe" }).first();
    test.skip(!(await subscribe.isVisible().catch(() => false)), "Already subscribed.");
    await subscribe.click();
    const upi = page.getByLabel(/UPI AutoPay/i).or(page.getByText(/UPI AutoPay/i)).first();
    if (await upi.isVisible().catch(() => false)) await upi.click();
    await page.getByRole("button", { name: /Pay|Subscribe|Continue/i }).last().click();
    await page.waitForURL(/razorpay\.com|checkout\.razorpay|api\.razorpay|\/settings/, {
      timeout: 90_000,
    });
    await evidence(page, "in-razorpay-redirect");
    expect(page.url()).toMatch(/razorpay|section=subscription/);
  });

  test("IN — isolation: Manage billing must not open Stripe portal", async ({ page }) => {
    await openSubscription(page, account.email!, account.password!);
    const manage = page.getByRole("button", { name: /Manage billing/i }).first();
    test.skip(!(await manage.isVisible().catch(() => false)), "Manage billing not shown (no paid sub).");
    await manage.click();
    // Either toast/error about Razorpay, or stay on-site — never billing.stripe.com
    await page.waitForTimeout(2000);
    await evidence(page, "in-manage-billing");
    expect(page.url()).not.toMatch(/billing\.stripe\.com/);
  });
});

test.describe("Hybrid staging — UK → Stripe", () => {
  const account = accountFor("GB");
  test.skip(!enabled || !account.email || !account.password, "Set E2E_GB_EMAIL / E2E_GB_PASSWORD.");

  test("GB — Stripe-only checkout methods", async ({ page }) => {
    await openSubscription(page, account.email!, account.password!);
    await evidence(page, "gb-subscription-shell");
    const subscribe = page.getByRole("button", { name: "Subscribe" }).first();
    if (await subscribe.isVisible().catch(() => false)) {
      await subscribe.click();
      await expect(page.getByText(/Cards, wallets|Stripe Checkout/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(/UPI AutoPay/i)).toHaveCount(0);
      await evidence(page, "gb-checkout-methods");
    } else {
      await expect(page.getByText(/Subscription|Active|Trial|Manage billing/i).first()).toBeVisible();
    }
  });

  test("GB — Stripe Checkout mutation", async ({ page }) => {
    test.skip(!mutations, "Set E2E_BILLING_MUTATIONS=true to open Stripe Checkout.");
    await openSubscription(page, account.email!, account.password!);
    const subscribe = page.getByRole("button", { name: "Subscribe" }).first();
    test.skip(!(await subscribe.isVisible().catch(() => false)), "Already subscribed.");
    await page.getByRole("button", { name: "Monthly", exact: true }).click().catch(() => undefined);
    await subscribe.click();
    await page.getByRole("button", { name: /Pay|Subscribe|Continue/i }).last().click();
    await page.waitForURL(/checkout\.stripe\.com|billing\.stripe\.com|\/settings/, { timeout: 90_000 });
    await evidence(page, "gb-stripe-redirect");
    expect(page.url()).toMatch(/stripe\.com|section=subscription/);
  });

  test("GB — upgrade / interval UI when subscribed", async ({ page }) => {
    await openSubscription(page, account.email!, account.password!);
    const yearly = page.getByRole("button", { name: "Yearly", exact: true });
    if (await yearly.isVisible().catch(() => false)) {
      await yearly.click();
      await evidence(page, "gb-yearly-toggle");
    }
    const switchBtn = page.getByRole("button", { name: "Switch plan" }).first();
    if (mutations && (await switchBtn.isVisible().catch(() => false))) {
      await switchBtn.click();
      await expect(page.getByText(/Due now|prorat|no charge|period end/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await evidence(page, "gb-plan-change-preview");
    }
  });
});

test.describe("Hybrid staging — US → Stripe", () => {
  const account = accountFor("US");
  test.skip(!enabled || !account.email || !account.password, "Set E2E_US_EMAIL / E2E_US_PASSWORD.");

  test("US — Stripe-only checkout methods", async ({ page }) => {
    await openSubscription(page, account.email!, account.password!);
    await evidence(page, "us-subscription-shell");
    const subscribe = page.getByRole("button", { name: "Subscribe" }).first();
    if (await subscribe.isVisible().catch(() => false)) {
      await subscribe.click();
      await expect(page.getByText(/Cards, wallets|Stripe Checkout/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(/UPI AutoPay/i)).toHaveCount(0);
      await evidence(page, "us-checkout-methods");
    } else {
      await expect(page.getByText(/Subscription|Active|Trial|Manage billing/i).first()).toBeVisible();
    }
  });

  test("US — Stripe Checkout mutation", async ({ page }) => {
    test.skip(!mutations, "Set E2E_BILLING_MUTATIONS=true to open Stripe Checkout.");
    await openSubscription(page, account.email!, account.password!);
    const subscribe = page.getByRole("button", { name: "Subscribe" }).first();
    test.skip(!(await subscribe.isVisible().catch(() => false)), "Already subscribed.");
    await subscribe.click();
    await page.getByRole("button", { name: /Pay|Subscribe|Continue/i }).last().click();
    await page.waitForURL(/checkout\.stripe\.com|billing\.stripe\.com|\/settings/, { timeout: 90_000 });
    await evidence(page, "us-stripe-redirect");
    expect(page.url()).toMatch(/stripe\.com|section=subscription/);
  });
});

test.describe("Hybrid staging — webhook operational probes (no secrets)", () => {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:8080";

  test("webhook-retry without Bearer returns 401 or 500", async ({ request }) => {
    const res = await request.post(`${base}/api/billing/webhook-retry`);
    expect([401, 500]).toContain(res.status());
  });

  test("webhook-retry with wrong Bearer returns 401 or 500", async ({ request }) => {
    const res = await request.post(`${base}/api/billing/webhook-retry`, {
      headers: { Authorization: "Bearer definitely-not-the-cron-secret" },
    });
    // 500 if cron secret unset on host; 401 if set and token wrong.
    expect([401, 500]).toContain(res.status());
  });

  test("Stripe webhook without signature is rejected", async ({ request }) => {
    const res = await request.post(`${base}/api/billing/stripe`, {
      data: JSON.stringify({ id: "evt_test_unsigned", type: "ping" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("Razorpay webhook without signature is rejected", async ({ request }) => {
    const res = await request.post(`${base}/api/billing/razorpay`, {
      data: JSON.stringify({ event: "subscription.charged", payload: {} }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
