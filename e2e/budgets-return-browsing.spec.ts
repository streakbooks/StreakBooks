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

test.describe("Budgets: preserve search and native detail navigation", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Requires authorised E2E credentials and budget data");
  });

  test("search persists across refresh and budget detail return", async ({ page }) => {
    await signIn(page, "/budgets?q=annual");
    await expect(page.getByRole("textbox", { name: "Search budgets" })).toHaveValue("annual");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Search budgets" })).toHaveValue("annual");

    const record = page.locator('tbody a[href*="/budgets/"][href*="returnContext="]').first();
    test.skip((await record.count()) === 0, "Requires a seeded budget matching the search");
    await record.click();
    await expect(page).toHaveURL(/\/budgets\/[^/?]+/);
    await page.getByRole("link", { name: "All budgets" }).click();
    expect(new URL(page.url()).searchParams.get("q")).toBe("annual");
  });

  test("the budget editor offers a safe return when opened directly", async ({ page }) => {
    await signIn(page, "/budgets");
    const record = page.locator('tbody a[href*="/budgets/"]').first();
    test.skip((await record.count()) === 0, "Requires at least one budget fixture");
    const url = new URL((await record.getAttribute("href")) ?? "", page.url());
    url.search = "";
    await page.goto(url.toString());
    await page.getByRole("link", { name: "All budgets" }).click();
    await expect(page).toHaveURL(/\/budgets(?:\/|\?|$)/);
  });
});
