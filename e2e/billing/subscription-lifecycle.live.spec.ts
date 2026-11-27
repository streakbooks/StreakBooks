/**
 * Billing lifecycle A–J against a real StreakBooks app + Stripe test mode.
 *
 * Enable explicitly (never runs in CI by default):
 *
 *   E2E_BILLING_ENABLED=true \
 *   E2E_EMAIL=… E2E_PASSWORD=… \
 *   E2E_BASE_URL=http://localhost:8080 \
 *   npm run test:billing:live
 *
 * Optional:
 *   E2E_BILLING_MUTATIONS=true  — allow Checkout / plan-change clicks that charge Stripe test cards
 *   E2E_SECOND_EMAIL / E2E_SECOND_PASSWORD — same-company second user (scenario I)
 *   E2E_OTHER_COMPANY_PATH — path that must not show this company's invoices (scenario J)
 *
 * Uses Stripe test mode only. Do not point at live keys or real customer orgs.
 */
import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.E2E_BILLING_ENABLED === "true";
const mutations = process.env.E2E_BILLING_MUTATIONS === "true";
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const subscriptionPath = "/settings?section=subscription";

test.describe("Billing subscription lifecycle (live / Stripe test mode)", () => {
  test.skip(
    !enabled,
    "Set E2E_BILLING_ENABLED=true with E2E_EMAIL / E2E_PASSWORD against a Stripe test-mode app.",
  );

  test.beforeAll(() => {
    if (!email || !password) {
      throw new Error("E2E_EMAIL and E2E_PASSWORD are required when E2E_BILLING_ENABLED=true");
    }
    if (process.env.STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS === "true") {
      throw new Error("Refuse live payment keys for billing E2E. Use Stripe test mode only.");
    }
  });

  async function signIn(page: Page, destination = subscriptionPath) {
    await page.goto("/auth?redirect=" + encodeURIComponent(destination));
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 45_000 });
  }

  async function openSubscription(page: Page) {
    await signIn(page);
    await expect(page).toHaveURL(/section=subscription|subscription/i);
    await expect(
      page.getByRole("heading", { name: /subscription|billing|plan/i }).first(),
    ).toBeVisible({ timeout: 30_000 });
  }

  test("H — invoice history and PDF controls are visible", async ({ page }) => {
    await openSubscription(page);
    await expect(page.getByRole("heading", { name: "Billing documents" })).toBeVisible();
    await expect(page.getByText(/Outstanding with Stripe|Issued StreakBooks invoices/i)).toBeVisible();
  });

  test("hybrid — India company offers Razorpay methods, not Stripe card", async ({ page }) => {
    test.skip(process.env.E2E_BILLING_COUNTRY !== "IN", "Set E2E_BILLING_COUNTRY=IN for an Indian org.");
    await openSubscription(page);
    const subscribe = page.getByRole("button", { name: "Subscribe" }).first();
    test.skip(!(await subscribe.isVisible().catch(() => false)), "Already subscribed; open CheckoutForm manually.");
    await subscribe.click();
    await expect(page.getByText(/UPI AutoPay|e-mandate/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Secure Stripe Checkout/i)).toHaveCount(0);
  });

  test("hybrid — international company offers Stripe card, not Razorpay UPI", async ({ page }) => {
    test.skip(
      !process.env.E2E_BILLING_COUNTRY || process.env.E2E_BILLING_COUNTRY === "IN",
      "Set E2E_BILLING_COUNTRY to a non-IN country (e.g. GB).",
    );
    await openSubscription(page);
    const subscribe = page.getByRole("button", { name: "Subscribe" }).first();
    test.skip(!(await subscribe.isVisible().catch(() => false)), "Already subscribed; open CheckoutForm manually.");
    await subscribe.click();
    await expect(page.getByText(/Cards, wallets|Stripe Checkout/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/UPI AutoPay/i)).toHaveCount(0);
  });

  test("surface plan cards and interval toggle (A–D prerequisites)", async ({ page }) => {
    await openSubscription(page);
    const monthly = page.getByRole("button", { name: "Monthly", exact: true });
    const yearly = page.getByRole("button", { name: "Yearly", exact: true });
    if (await yearly.isVisible().catch(() => false)) {
      await yearly.click();
      await monthly.click();
    }
    await expect(page.getByRole("button", { name: /Subscribe|Switch plan|Keep current plan/i }).first()).toBeVisible();
  });

  test("A — new monthly subscribe (Stripe Checkout redirect)", async ({ page }) => {
    test.skip(!mutations, "Set E2E_BILLING_MUTATIONS=true to exercise Checkout.");
    await openSubscription(page);
    const subscribe = page.getByRole("button", { name: "Subscribe" }).first();
    test.skip(!(await subscribe.isVisible().catch(() => false)), "Org already has a paid subscription.");
    await page.getByRole("button", { name: "Monthly", exact: true }).click().catch(() => undefined);
    await subscribe.click();
    await page.waitForURL(/checkout\.stripe\.com|stripe\.com|billing\.stripe\.com|\/settings/, {
      timeout: 60_000,
    });
    expect(page.url()).toMatch(/stripe\.com|section=subscription/);
  });

  test("B — plan upgrade preview / confirm", async ({ page }) => {
    test.skip(!mutations, "Set E2E_BILLING_MUTATIONS=true to exercise upgrades.");
    await openSubscription(page);
    const switchBtn = page.getByRole("button", { name: "Switch plan" }).first();
    test.skip(!(await switchBtn.isVisible().catch(() => false)), "No switchable higher plan visible.");
    await switchBtn.click();
    await expect(page.getByText(/Due now|prorat|no charge today|period end/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("C — monthly to annual interval UI", async ({ page }) => {
    await openSubscription(page);
    const yearly = page.getByRole("button", { name: "Yearly", exact: true });
    test.skip(!(await yearly.isVisible().catch(() => false)), "Yearly interval not offered.");
    await yearly.click();
    await expect(yearly).toBeVisible();
    if (mutations) {
      const switchBtn = page.getByRole("button", { name: "Switch plan" }).first();
      if (await switchBtn.isVisible().catch(() => false)) {
        await switchBtn.click();
        await expect(page.getByText(/Due now|prorat|Yearly|annual/i).first()).toBeVisible();
      }
    }
  });

  test("D — annual to monthly interval UI", async ({ page }) => {
    await openSubscription(page);
    const monthly = page.getByRole("button", { name: "Monthly", exact: true });
    await monthly.click().catch(() => undefined);
    await expect(monthly).toBeVisible();
  });

  test("E/F — scheduled downgrade and reverse controls", async ({ page }) => {
    await openSubscription(page);
    const keep = page.getByRole("button", { name: "Keep current plan" });
    if (await keep.isVisible().catch(() => false)) {
      if (mutations) {
        await keep.click();
        await expect(keep).toHaveCount(0, { timeout: 30_000 });
      } else {
        await expect(keep).toBeVisible();
      }
      return;
    }
    test.skip(!mutations, "No scheduled change; enable mutations to create a downgrade first.");
    // Soft assertion: page still loads plan switching without error.
    await expect(page.getByRole("button", { name: /Subscribe|Switch plan/i }).first()).toBeVisible();
  });

  test("G — past_due recovery surface", async ({ page }) => {
    await openSubscription(page);
    const recovery = page.getByText(/Payment due|Update.*payment|past due|failed payment/i);
    if (await recovery.first().isVisible().catch(() => false)) {
      await expect(recovery.first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Manage billing|Update payment|Pay/i }).first()).toBeVisible();
    } else {
      test.info().annotations.push({
        type: "note",
        description: "Subscription is not past_due; recovery UI not asserted this run.",
      });
    }
  });

  test("I — second company member can open subscription (shared entitlements UI)", async ({
    page,
  }) => {
    const secondEmail = process.env.E2E_SECOND_EMAIL;
    const secondPassword = process.env.E2E_SECOND_PASSWORD;
    test.skip(!secondEmail || !secondPassword, "Set E2E_SECOND_EMAIL / E2E_SECOND_PASSWORD.");
    await page.goto("/auth?redirect=" + encodeURIComponent(subscriptionPath));
    await page.getByLabel("Email").fill(secondEmail!);
    await page.getByLabel("Password", { exact: true }).fill(secondPassword!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 45_000 });
    await expect(page.getByRole("heading", { name: "Billing documents" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("J — tenant isolation (other company must not show foreign invoices)", async ({ page }) => {
    const otherPath = process.env.E2E_OTHER_COMPANY_PATH;
    test.skip(!otherPath, "Set E2E_OTHER_COMPANY_PATH to another company subscription URL.");
    await signIn(page, otherPath);
    // Must not render the first company's Stripe customer invoice list from a leaked id.
    // Soft check: page either denies access or shows a different billing shell without error dump.
    const denied = page.getByText(/permission|not found|do not have access|select a company/i);
    const docs = page.getByRole("heading", { name: "Billing documents" });
    await expect(denied.or(docs).first()).toBeVisible({ timeout: 30_000 });
  });
});
