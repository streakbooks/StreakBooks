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

test.describe("Products & Services native browsing", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Authorised browser test credentials are required");
  });

  test("deep links, refresh and browser history preserve product sections", async ({ page }) => {
    await signIn(page, "/products-services?section=categories");
    const tabs = page.getByRole("tablist", { name: "Products and services sections" });
    const categories = tabs.getByRole("tab", { name: "Categories" });
    await expect(categories).toHaveAttribute("aria-selected", "true");
    await page.reload();
    await expect(categories).toHaveAttribute("aria-selected", "true");

    const priceLists = tabs.getByRole("tab", { name: "Price Lists" });
    await expect(priceLists).toHaveAttribute("href", /section=price-lists/);
    await priceLists.click();
    await expect(page).toHaveURL(/section=price-lists/);
    await page.goBack();
    await expect(page).toHaveURL(/section=categories/);
    await expect(categories).toHaveAttribute("aria-selected", "true");
  });

  test("product sections support Ctrl-click in a new browser tab", async ({ page, context }) => {
    await signIn(page, "/products-services?section=catalogue");
    const tabs = page.getByRole("tablist", { name: "Products and services sections" });
    const priceLists = tabs.getByRole("tab", { name: "Price Lists" });
    const origin = page.url();
    const tabPromise = context.waitForEvent("page");
    await priceLists.click({ modifiers: ["Control"] });
    const newTab = await tabPromise;
    await newTab.waitForLoadState("domcontentloaded");
    await expect(newTab).toHaveURL(/section=price-lists/);
    expect(page.url()).toBe(origin);
    await newTab.close();
  });
});
