import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

async function signIn(page: Page, destination: string) {
  await page.goto(`/auth?redirect=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password", { exact: true }).fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 20_000 });
}

/** Native links preserve the source workspace on modifier-click and expose real href targets. */
test.describe("Native browser navigation across LinkBooks", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Provide an authorised E2E test account; authentication is not bypassed.");
  });

  test("sidebar navigation exposes real browser URLs and supports Ctrl+Click", async ({ page, context }) => {
    await signIn(page, "/");
    const menu = page.getByRole("navigation", { name: "Main" });
    const sales = menu.getByRole("link", { name: "Sales", exact: true });
    await expect(sales).toHaveAttribute("href", /\/sales/);
    const original = page.url();
    const newPagePromise = context.waitForEvent("page");
    await sales.click({ modifiers: ["Control"] });
    const newPage = await newPagePromise;
    await newPage.waitForLoadState("domcontentloaded");
    await expect(newPage).toHaveURL(/\/sales/);
    expect(page.url()).toBe(original);
    await newPage.close();
  });

  test("accounting subnavigation uses hyperlinks for URL-addressable tabs", async ({ page, context }) => {
    await signIn(page, "/accounting");
    const journals = page.getByRole("tab", { name: "Journals", exact: true });
    await expect(journals).toHaveAttribute("href", /tab=journals/);
    const original = page.url();
    const nextPage = context.waitForEvent("page");
    await journals.click({ modifiers: ["Control"] });
    const popup = await nextPage;
    await expect(popup).toHaveURL(/tab=journals/);
    expect(page.url()).toBe(original);
    await popup.reload();
    await expect(popup).toHaveURL(/tab=journals/);
    await popup.close();
  });

  test("bill workflow navigation and Files breadcrumbs are native links", async ({ page }) => {
    await signIn(page, "/purchases/bills");
    const workflow = page.getByRole("navigation", { name: "Bill workflow" });
    await expect(workflow.getByRole("link", { name: /Drafts/ })).toHaveAttribute("href", /tab=drafts/);
    const drafts = workflow.getByRole("link", { name: /Drafts/ });
    await drafts.click();
    await expect(page).toHaveURL(/tab=drafts/);
    await page.goBack();
    await page.goto("/files");
    await expect(page.getByRole("link", { name: "All files" })).toHaveAttribute("href", /\/files/);
  });

  test("document and banking native links do not suppress their browser context menu", async ({ page }) => {
    await signIn(page, "/banking/transactions");
    const link = page.getByRole("navigation", { name: "Banking sections" }).getByRole("link", { name: /All transactions/ });
    await expect(link).toHaveAttribute("href", /\/banking\/transactions/);
    const defaultAllowed = await link.evaluate((element) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
      return element.dispatchEvent(event);
    });
    expect(defaultAllowed).toBe(true);
  });
});
