import { expect, test, type Page } from "@playwright/test";
import { validateStagingTarget } from "../scripts/lib/staging-target.mjs";

const enabled = process.env.E2E_STAGING_ENABLED === "true";
const stagingHost = process.env.E2E_EXPECTED_STAGING_HOST;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("Tax module — authenticated staging release smoke (read-only)", () => {
  test.skip(!enabled, "Requires explicit E2E_STAGING_ENABLED=true, staging URL and credentials.");

  test.beforeAll(() => {
    if (!email || !password || !stagingHost) {
      throw new Error("Dedicated staging account and expected staging hostname are mandatory");
    }
    validateStagingTarget({
      stagingUrl: process.env.E2E_BASE_URL,
      expectedHost: stagingHost,
      productionUrl: process.env.E2E_PRODUCTION_URL,
    });
  });

  async function authenticate(page: Page, destination: string) {
    await page.goto("/auth?redirect=" + encodeURIComponent(destination));
    expect(new URL(page.url()).hostname).toBe(stagingHost);
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(
      (url) => url.hostname === stagingHost && !url.pathname.startsWith("/auth"),
      { timeout: 30_000 },
    );
  }

  test("Tax overview and reporting disclaimer are available without mutations", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await authenticate(page, "/tax?tab=overview");
    await expect(page.getByRole("heading", { name: "Tax", exact: true })).toBeVisible();
    await expect(page.getByText("Calculation & reporting, not e-filing")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(errors).toEqual([]);
  });

  test("Tax navigation preserves selected subtab URL and return controls", async ({ page }) => {
    await authenticate(page, "/tax?tab=returns");
    const returns = page.getByRole("tab", { name: "Returns", exact: true });
    await expect(returns).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\/tax\?tab=returns/);
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Overview", exact: true }))
      .toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\/tax\?tab=overview/);
  });
});
