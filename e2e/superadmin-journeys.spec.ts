import { expect, test } from "@playwright/test";

// An operator supplies an MFA session. This file does not create a user or bypass sign-in.
const state = process.env.E2E_PLATFORM_STORAGE_STATE;
// A disposable business id. Do not point this at a customer ledger.
const businessId = process.env.E2E_PLATFORM_TEST_BUSINESS_ID;

test.describe("Public plan quote", () => {
  test("builds a custom plan quote and does not charge a card", async ({ page }) => {
    await page.goto("/pricing/builder");
    await page.getByRole("button", { name: "Calculate quote" }).click();
    await expect(page.getByRole("heading", { name: /Quote in / })).toBeVisible();
    await expect(page.getByText(/does not charge a card/i)).toBeVisible();
    await expect(page.getByLabel(/feature price/i)).toHaveCount(0);
  });

  test("does not invent a mid-cycle proration on the quote", async ({ page }) => {
    await page.goto("/pricing/builder");
    await page.getByRole("button", { name: "Calculate quote" }).click();
    await expect(
      page.getByText(
        /mid-cycle charge is not calculated here because no test-mode payment provider/i,
      ),
    ).toBeVisible();
  });
});

test.describe("Platform feature changes", () => {
  test.skip(
    !state || !businessId,
    "Set E2E_PLATFORM_STORAGE_STATE and E2E_PLATFORM_TEST_BUSINESS_ID. The business must be disposable test data.",
  );
  test.use({ storageState: state ?? { cookies: [], origins: [] } });

  test("grants a feature and shows that accounting records stay", async ({ page }) => {
    await page.goto("/platform?section=approvals");
    await page.getByLabel("Feature").selectOption("ai_queries");
    await page.getByLabel("Scope").selectOption("business");
    await page.getByLabel("Scope id").fill(businessId ?? "");
    await page.getByLabel("Change").selectOption("grant:allow");
    await page
      .getByLabel("Entitlement reason")
      .fill("Playwright grant on disposable test business");
    await page.getByRole("button", { name: "Save entitlement" }).click();
    await expect(page.getByRole("status")).toContainText(
      /Existing accounting records were not deleted/,
    );
  });

  test("revokes that feature and keeps the accounting-history notice", async ({ page }) => {
    await page.goto("/platform?section=approvals");
    await page.getByLabel("Feature").selectOption("ai_queries");
    await page.getByLabel("Scope").selectOption("business");
    await page.getByLabel("Scope id").fill(businessId ?? "");
    await page.getByLabel("Change").selectOption("revoke:deny");
    await page
      .getByLabel("Entitlement reason")
      .fill("Playwright revoke on disposable test business");
    await page.getByRole("button", { name: "Save entitlement" }).click();
    await expect(page.getByRole("status")).toContainText(
      /Existing accounting records were not deleted/,
    );
    await expect(page.getByText(/does not delete ledger history/i)).toBeVisible();
  });
});
