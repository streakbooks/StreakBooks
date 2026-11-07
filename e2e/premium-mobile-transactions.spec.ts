import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function signIn(page: Page, destination: string) {
  await page.goto("/auth?redirect=" + encodeURIComponent(destination));
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password", { exact: true }).fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 20_000,
  });
}

test.describe("Premium mobile transaction views", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Requires an authorised mobile E2E organisation");
  });

  test("invoices show status-labelled cards and native record links", async ({ page }) => {
    await signIn(page, "/sales/invoices");
    const cards = page.getByRole("region", { name: "Mobile invoices" });
    test.skip((await cards.count()) === 0, "Requires at least one seeded invoice");
    await expect(cards.first()).toBeVisible();
    await expect(cards.locator('[data-slot="status-badge"]').first()).toBeVisible();
    await expect(cards.getByRole("link", { name: /Open invoice/ }).first()).toBeVisible();
    await expect(cards.getByRole("button", { name: /Preview invoice/ }).first()).toBeVisible();
  });

  test("bills show lifecycle status without inferring payment from the style", async ({ page }) => {
    await signIn(page, "/purchases/bills");
    const cards = page.getByRole("region", { name: "Mobile bills" });
    test.skip((await cards.count()) === 0, "Requires at least one seeded supplier bill");
    await expect(cards.first()).toBeVisible();
    const badge = cards.locator('[data-slot="status-badge"]').first();
    await expect(badge).toBeVisible();
    expect(["neutral", "warning", "info", "success", "complete", "danger"]).toContain(
      await badge.getAttribute("data-tone"),
    );
    await expect(cards.getByRole("button", { name: /Preview bill/ }).first()).toBeVisible();
    await expect(cards.getByRole("button", { name: /Open bill/ }).first()).toBeVisible();
  });

  test("bank cards retain transaction preview and existing permission-sensitive actions", async ({
    page,
  }) => {
    await signIn(page, "/banking/transactions");
    const cards = page.getByRole("region", { name: "Mobile bank transactions" });
    test.skip((await cards.count()) === 0, "Requires accessible bank transaction fixtures");
    await expect(cards.first()).toBeVisible();
    await expect(cards.locator('[data-slot="status-badge"]').first()).toBeVisible();
    await expect(cards.getByRole("button", { name: /Preview transaction/ }).first()).toBeVisible();
    const width = await cards.evaluate((element) => element.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(390);
  });
});
