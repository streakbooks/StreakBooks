import { expect, test } from "@playwright/test";

// An authorized, active AAL2 browser session is supplied by the operator.
// No test manufactures a JWT or bypasses the sign-in/MFA flow.
const state = process.env.E2E_PLATFORM_STORAGE_STATE;
test.describe("Superadmin control centre", () => {
  test.skip(
    !state,
    "Set E2E_PLATFORM_STORAGE_STATE to an authorized MFA test-session storage state.",
  );
  test.use({ storageState: state ?? { cookies: [], origins: [] } });
  test("opens independently of the company onboarding layout", async ({ page }) => {
    await page.goto("/platform");
    await expect(page.getByRole("navigation", { name: "Platform navigation" })).toBeVisible();
    await expect(page.getByText("MFA verified", { exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/onboarding/);
  });
  test("all sixteen navigation sections load without an error state", async ({ page }) => {
    await page.goto("/platform");
    const nav = page.getByRole("navigation", { name: "Platform navigation" });
    await expect(nav.getByRole("link")).toHaveCount(16);
    const names = await nav.getByRole("link").allTextContents();
    for (const name of names) {
      await nav.getByRole("link", { name, exact: true }).click();
      await expect(page.locator("#platform-main").getByRole("heading", { level: 1 })).toHaveText(
        name,
      );
      await expect(page.locator("#platform-main").getByRole("alert")).toHaveCount(0);
    }
  });
  test("business and user edit controls open accessible, validated forms", async ({ page }) => {
    await page.goto("/platform?section=businesses");
    await page.getByRole("button", { name: "Create business", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Business name")).toBeVisible();
    await expect(dialog.getByLabel("Owner user ID")).toBeVisible();
    await expect(dialog.getByLabel("Reason for this action")).toHaveAttribute("required", "");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
});
