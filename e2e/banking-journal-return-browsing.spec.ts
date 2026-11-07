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

test.describe("Banking: linked journal return browsing", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Requires an authorised E2E organisation");
  });

  test("preserves bank-transaction filters across linked journal navigation", async ({ page }) => {
    await signIn(
      page,
      "/banking/transactions?statusGroup=posted&dateFrom=2026-01-01&dateTo=2026-10-31&pageSize=25",
    );
    const journal = page.locator('a[href*="/banking/journal/"][href*="returnContext="]').first();
    test.skip((await journal.count()) === 0, "Requires a seeded posted bank transaction with linked journal");
    await journal.click();
    await expect(page).toHaveURL(/\/banking\/journal\/[^/?]+/);
    await page.getByRole("link", { name: "Back to transactions" }).click();
    const search = new URL(page.url()).searchParams;
    expect(search.get("statusGroup")).toBe("posted");
    expect(search.get("dateFrom")).toBe("2026-01-01");
    expect(search.get("dateTo")).toBe("2026-10-31");
    expect(search.get("pageSize")).toBe("25");
  });

  test("a direct journal link always provides a safe transactions route", async ({ page }) => {
    await signIn(page, "/banking/transactions?statusGroup=posted");
    const journal = page.locator('a[href*="/banking/journal/"]').first();
    test.skip((await journal.count()) === 0, "Requires a seeded bank journal");
    const href = await journal.getAttribute("href");
    const direct = new URL(href ?? "", page.url());
    direct.search = "";
    await page.goto(direct.toString());
    await expect(page.getByRole("link", { name: "Back to transactions" })).toBeVisible();
    await page.getByRole("link", { name: "Back to transactions" }).click();
    await expect(page).toHaveURL(/\/banking\/transactions(?:\/|\?|$)/);
  });
});
