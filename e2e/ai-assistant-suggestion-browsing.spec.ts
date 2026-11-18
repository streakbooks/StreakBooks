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

test.describe("AI Assistant suggestion list browsing", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "An authorised AI-enabled test account is required");
  });

  test("recent suggestions restore safe status/search through refresh", async ({ page }) => {
    await signIn(page, "/ai-assistant?suggestionStatus=validated&suggestionQ=accrual");
    const search = page.getByRole("textbox", { name: "Search suggestions" });
    test.skip((await search.count()) === 0, "Requires ai.use permission");
    await expect(search).toHaveValue("accrual");
    await page.reload();
    await expect(search).toHaveValue("accrual");
    expect(new URL(page.url()).searchParams.get("suggestionStatus")).toBe("validated");
  });

  test("status choices navigate with browser history and retain query", async ({ page }) => {
    await signIn(page, "/ai-assistant?suggestionQ=rent&suggestionStatus=all");
    const status = page.getByRole("combobox", { name: "Filter suggestion status" });
    test.skip((await status.count()) === 0, "Requires ai.use permission");
    await status.click();
    await page.getByRole("option", { name: "Pending" }).click();
    expect(new URL(page.url()).searchParams.get("suggestionStatus")).toBe("pending");
    expect(new URL(page.url()).searchParams.get("suggestionQ")).toBe("rent");
    await page.goBack();
    expect(new URL(page.url()).searchParams.get("suggestionStatus")).toBe("all");
  });
});
