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

test.describe("Accounting journal list native browsing", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Requires an authorised accounting E2E account");
  });

  test("deep-link journal filters survive reload and Accounting tab switches", async ({ page }) => {
    await signIn(
      page,
      "/accounting?tab=journals&journalQ=rent&journalSource=manual&journalFrom=2026-01-01&journalPageSize=50",
    );
    const search = page.getByRole("textbox", { name: "Search journals" });
    await expect(search).toHaveValue("rent");
    await page.reload();
    await expect(search).toHaveValue("rent");
    await expect(page.getByRole("combobox", { name: "Journal source" })).toHaveValue("manual");
    await expect(page.getByRole("tab", { name: "Chart of accounts" })).toBeVisible();
    await page.getByRole("tab", { name: "Chart of accounts" }).click();
    await page.getByRole("tab", { name: "Journals" }).click();
    await expect(search).toHaveValue("rent");
    expect(new URL(page.url()).searchParams.get("journalPageSize")).toBe("50");
  });

  test("journal filters update shareable URLs and Clear resets the list", async ({ page }) => {
    await signIn(page, "/accounting?tab=journals&journalQ=rent&journalSource=manual");
    await page.getByRole("button", { name: "Clear filters" }).click();
    const params = new URL(page.url()).searchParams;
    expect(params.has("journalQ")).toBe(false);
    expect(params.has("journalSource")).toBe(false);
    expect(params.get("tab")).toBe("journals");
  });

  test("recurring journals return directly to the Accounting journals workspace", async ({
    page,
  }) => {
    await signIn(page, "/recurring-journals");
    await page.getByRole("link", { name: "Back to journals" }).click();
    await expect(page).toHaveURL(/\/accounting(?:\/|\?|$)/);
    expect(new URL(page.url()).searchParams.get("tab")).toBe("journals");
  });
});
