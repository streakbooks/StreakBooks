import { expect, test, type Page } from "@playwright/test";
import { validateStagingTarget } from "../scripts/lib/staging-target.mjs";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const stagingHost = process.env.E2E_EXPECTED_STAGING_HOST;

test.describe("authenticated LinkBooks staging smoke", () => {
  test.beforeAll(() => {
    if (process.env.E2E_STAGING_ENABLED !== "true" || !email || !password) {
      throw new Error("Dedicated staging E2E credentials and explicit activation are required.");
    }
    validateStagingTarget({
      stagingUrl: process.env.E2E_BASE_URL,
      expectedHost: stagingHost,
      productionUrl: process.env.E2E_PRODUCTION_URL,
    });
  });

  async function signIn(page: Page, destination: string) {
    await page.goto("/auth?redirect=" + encodeURIComponent(destination));
    // Verify the destination BEFORE submitting any credentials.
    expect(new URL(page.url()).hostname).toBe(stagingHost);
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(
      (url) => url.hostname === stagingHost && !url.pathname.startsWith("/auth"),
      { timeout: 30_000 },
    );
    await expect(page).not.toHaveURL(/\/auth/);
  }

  test("dedicated staging user authenticates and sees the workspace", async ({ page }) => {
    await signIn(page, "/");
    await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test("Sales and Purchases show existing permission-controlled filter views", async ({ page }) => {
    await signIn(page, "/sales/invoices");
    await expect(page.getByRole("button", { name: "Saved views" })).toBeVisible();
    await page.goto("/purchases/bills");
    await expect(page.getByRole("button", { name: "Saved views" })).toBeVisible();
    await expect(page).toHaveURL(/\/purchases\/bills/);
  });

  test("Banking search receives keyboard focus without changing financial records", async ({
    page,
  }) => {
    await signIn(page, "/banking/transactions");
    const search = page.getByRole("textbox", { name: "Search bank transactions" });
    await expect(search).toBeVisible();
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    await search.fill("test");
    await page.keyboard.press("/");
    await expect(search).toHaveValue("test/");
    await search.clear();
    await expect(page.getByRole("button", { name: "Saved views" })).toBeVisible();
  });

  test("mobile Banking switches between cards and ledger table", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "/banking/transactions");
    const table = page.getByRole("button", { name: "Switch to transaction table" });
    await expect(table).toBeVisible();
    const cards = page.getByRole("region", { name: "Mobile bank transactions" });
    const empty = page.getByText("No transactions", { exact: true });
    await expect(cards.or(empty).first()).toBeVisible();
    await table.click();
    await expect(page.getByRole("button", { name: "Switch to transaction cards" })).toBeVisible();
    await page.getByRole("button", { name: "Switch to transaction cards" }).click();
    await expect(page.getByRole("button", { name: "Switch to transaction table" })).toBeVisible();
  });

  test("mobile Sales invoices switch between cards and desktop table without posting", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "/sales/invoices");
    const table = page.getByRole("button", { name: "Switch invoices to table view" });
    await expect(table).toBeVisible();
    await table.click();
    await expect(page.getByRole("button", { name: "Switch invoices to cards view" })).toBeVisible();
    await page.getByRole("button", { name: "Switch invoices to cards view" }).click();
    await expect(table).toBeVisible();
    await expect(page.getByRole("button", { name: "Saved views" })).toBeVisible();
  });

  test("mobile Purchases bills switch views while preserving workflow filters", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "/purchases/bills");
    const table = page.getByRole("button", { name: "Switch bills to table view" });
    await expect(table).toBeVisible();
    await table.click();
    await expect(page.getByRole("button", { name: "Switch bills to cards view" })).toBeVisible();
    await page.getByRole("button", { name: "Switch bills to cards view" }).click();
    await expect(table).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Bill workflow" })).toBeVisible();
  });

  test("Dashboard attention and layout controls display real protected workspace", async ({
    page,
  }) => {
    await signIn(page, "/");
    const attention = page.getByRole("region", { name: "Bookkeeping attention centre" });
    await expect(attention).toBeVisible();
    await expect(attention.getByText("Priority work queue")).toBeVisible();
    await attention
      .getByRole("group", { name: "Filter bookkeeping tasks" })
      .getByRole("button", { name: /^Overdue/ })
      .click();
    await expect(
      attention
        .getByRole("group", { name: "Filter bookkeeping tasks" })
        .getByRole("button", { name: /^Overdue/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Dashboard widgets" })).toBeVisible();
    await page.getByRole("button", { name: "Customize dashboard" }).click();
    await expect(
      page.getByRole("button", { name: "Apply Banking dashboard layout" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
