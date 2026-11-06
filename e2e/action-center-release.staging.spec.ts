import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { validateStagingTarget } from "../scripts/lib/staging-target.mjs";

/**
 * Release-gate fixtures deliberately run only against an explicitly approved
 * staging host. All three tests read existing alert data; no financial records
 * are mutated or notification states acknowledged.
 *
 * Provision two distinct staging users and a unique, private alert title/body
 * for the primary user before enabling the cross-user test.
 */
const host = process.env.E2E_EXPECTED_STAGING_HOST;
const primaryEmail = process.env.E2E_EMAIL;
const primaryPassword = process.env.E2E_PASSWORD;
const secondaryEmail = process.env.E2E_ACTION_SECONDARY_EMAIL;
const secondaryPassword = process.env.E2E_ACTION_SECONDARY_PASSWORD;
const privateCanary = process.env.E2E_ACTION_PRIVATE_CANARY;
const hasSecondaryFixture = Boolean(
  secondaryEmail && secondaryPassword && privateCanary && privateCanary.length >= 16 &&
  secondaryEmail !== primaryEmail,
);
const hasLargeHistory = process.env.E2E_ACTION_LARGE_HISTORY === "true";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth?redirect=" + encodeURIComponent("/notifications?view=all"));
  expect(new URL(page.url()).hostname).toBe(host);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(
    (url) => url.hostname === host && url.pathname === "/notifications",
    { timeout: 30_000 },
  );
  await expect(page.getByRole("heading", { name: "Smart Action Center" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search notifications" })).toBeVisible();
}

async function searchFor(page: Page, query: string) {
  const input = page.getByRole("textbox", { name: "Search notifications" });
  await input.fill(query);
  await input.press("Enter");
  await expect(page).toHaveURL(/q=/);
}

test.describe("Action Center production readiness gates — dedicated staging only", () => {
  test.beforeAll(() => {
    if (process.env.E2E_STAGING_ENABLED !== "true" ||
        !process.env.E2E_BASE_URL || !primaryEmail || !primaryPassword) {
      throw new Error("Explicit staging activation, URL and dedicated credentials required");
    }
    validateStagingTarget({
      stagingUrl: process.env.E2E_BASE_URL,
      expectedHost: host,
      productionUrl: process.env.E2E_PRODUCTION_URL,
    });
  });

  test("serious and critical accessibility violations are absent in the Action Center", async ({ page }) => {
    await signIn(page, primaryEmail!, primaryPassword!);
    // Scan the module only, so unrelated app navigation cannot mask module issues.
    const result = await new AxeBuilder({ page })
      .include("[data-action-center-root]")
      .analyze();
    // Avoid including customer-specific DOM snippets in test logs.
    const blocking = result.violations
      .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
      .map(({ id, impact }) => ({ id, impact }));
    expect(blocking).toEqual([]);
  });

  test("another user cannot search a private alert belonging to the primary user", async ({ browser }) => {
    test.skip(!hasSecondaryFixture,
      "Two dedicated staging accounts and a private alert canary are required");
    const one = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const two = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    try {
      const first = await one.newPage();
      await signIn(first, primaryEmail!, primaryPassword!);
      await searchFor(first, privateCanary!);
      // Require positive control: a misconfigured or missing canary MUST fail.
      await expect(first.getByText(privateCanary!, { exact: false }).first()).toBeVisible();

      const second = await two.newPage();
      await signIn(second, secondaryEmail!, secondaryPassword!);
      await searchFor(second, privateCanary!);
      await expect(
        second.getByText("No matching notifications across your accessible history."),
      ).toBeVisible();
      await expect(second.getByText(privateCanary!, { exact: false })).toHaveCount(0);
    } finally {
      await one.close();
      await two.close();
    }
  });

  test("more than 100 alerts paginate without duplicate record IDs", async ({ page }) => {
    test.skip(!hasLargeHistory,
      "Dedicated staging user needs over 100 accessible alerts for this read-only fixture");
    await signIn(page, primaryEmail!, primaryPassword!);
    const seen = new Set<string>();
    for (let currentPage = 1; currentPage <= 6; currentPage++) {
      await expect(page.getByText(new RegExp(`Page ${currentPage} of`))).toBeVisible();
      const ids = await page.locator("[data-action-notification-id]").evaluateAll(
        (elements) => elements.map((element) => element.getAttribute("data-action-notification-id")),
      );
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(id).toBeTruthy();
        expect(seen.has(id!)).toBe(false);
        seen.add(id!);
      }
      if (currentPage < 6) {
        await page.getByRole("button", { name: "Next", exact: true }).click();
      }
    }
    expect(seen.size).toBeGreaterThan(100);
  });
});
