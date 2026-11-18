import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

async function signIn(page: Page, destination: string) {
  await page.goto("/auth?redirect=" + encodeURIComponent(destination));
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password", { exact: true }).fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 20_000 });
}

test.describe("Native LinkBooks module section browsing", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "An authorised E2E test user is required");
  });

  test("Purchases exposes every section as a link and preserves browser Back", async ({ page }) => {
    await signIn(page, "/purchases/bills");
    const nav = page.getByRole("navigation", { name: "Purchases sections" });
    await expect(nav.getByTestId("module-section-strip")).toBeVisible();
    for (const name of [
      "Overview",
      "Bills",
      "Expenses",
      "Suppliers",
      "Payments",
      "Credit notes",
      "Purchase orders",
      "Recurring",
      "Employee expenses",
      "Statements",
      "Portal inbox",
    ]) {
      await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(1);
    }
    await expect(nav.getByRole("button", { name: /More Purchases sections/ })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Bills", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const orders = nav.getByRole("link", { name: "Purchase orders" });
    await orders.scrollIntoViewIfNeeded();
    await orders.click();
    await expect(page).toHaveURL(/\/purchases\/orders(?:\/|$|\?)/);
    await page.goBack();
    await expect(page).toHaveURL(/\/purchases\/bills(?:\/|$|\?)/);
  });

  test("Sales sections retain new-tab navigation", async ({ page, context }) => {
    await signIn(page, "/sales/invoices");
    const nav = page.getByRole("navigation", { name: "Sales sections" });
    const reminders = nav.getByRole("link", { name: "Reminders" });
    await expect(reminders).toHaveAttribute("href", /\/sales\/reminders/);
    const otherPage = context.waitForEvent("page");
    await reminders.click({ modifiers: ["Control"] });
    const tab = await otherPage;
    await expect(tab).toHaveURL(/\/sales\/reminders/);
    await expect(page).toHaveURL(/\/sales\/invoices/);
    await tab.close();
  });

  test("Long navigation strips scroll without changing record context", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 768 });
    await signIn(page, "/purchases/bills");
    const nav = page.getByRole("navigation", { name: "Purchases sections" });
    const strip = nav.getByTestId("module-section-strip");
    await expect(strip).toBeVisible();
    const arrow = nav.getByRole("button", { name: "Scroll Purchases sections right" });
    await expect(arrow).toBeEnabled();
    await arrow.click();
    await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/purchases\/bills/);
  });
  test("Bills restores sorting and pagination after opening and returning", async ({ page }) => {
    // This journey requires an authorised seeded organisation with at least one bill.
    await signIn(page, "/purchases/bills?tab=all&sortBy=due_date&sortDir=asc&page=0");
    const source = page.url();
    const billLink = page.locator('a[href*="/purchases/bills/"][href*="returnContext="]').first();
    await expect(billLink).toBeVisible();
    await billLink.click();
    await expect(page).toHaveURL(/\/purchases\/bills\/[^/]+/);
    const details = new URL(page.url());
    expect(details.searchParams.has("returnContext")).toBe(true);
    await page.getByRole("link", { name: "Back to Bills" }).click();
    await expect(page).toHaveURL(/\/purchases\/bills(?:\/|\?|$)/);
    const restored = new URL(page.url()).searchParams;
    const previous = new URL(source).searchParams;
    expect(restored.get("sortBy")).toBe(previous.get("sortBy"));
    expect(restored.get("sortDir")).toBe(previous.get("sortDir"));
    expect(restored.get("page")).toBe(previous.get("page"));
  });
});
