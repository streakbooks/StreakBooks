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

test.describe("Fixed Assets complete register browsing context", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Authorised fixed-assets test account required");
  });

  test("register search/status/sort survive direct URL and refresh", async ({ page }) => {
    await signIn(page, "/fixed-assets?tab=register&q=office&status=active&sort=cost&desc=true");
    await expect(page.getByRole("tab", { name: "Register" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    test.skip(
      (await page.getByRole("textbox", { name: "Search fixed assets" }).count()) === 0,
      "Requires fixed-assets module enabled with registered assets",
    );
    await expect(page.getByRole("textbox", { name: "Search fixed assets" })).toHaveValue("office");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Search fixed assets" })).toHaveValue("office");
    await expect(page.getByRole("combobox", { name: "Filter asset status" })).toHaveValue("active");
    await expect(page.getByRole("combobox", { name: "Sort fixed assets" })).toHaveValue("cost");
  });

  test("native tab links preserve catalogue filters through Back/Forward", async ({ page }) => {
    await signIn(page, "/fixed-assets?tab=register&q=equipment&sort=name");
    await page.getByRole("tab", { name: "Run depreciation" }).click();
    expect(new URL(page.url()).searchParams.get("q")).toBe("equipment");
    expect(new URL(page.url()).searchParams.get("sort")).toBe("name");
    await page.goBack();
    const result = new URL(page.url()).searchParams;
    expect(result.get("tab")).toBe("register");
    expect(result.get("q")).toBe("equipment");
  });

  test("clear filters updates URL without resetting unrelated workspace tabs", async ({ page }) => {
    await signIn(page, "/fixed-assets?tab=register&q=vehicles&status=disposed&sort=purchase");
    const clear = page.getByRole("button", { name: "Clear filters" });
    test.skip((await clear.count()) === 0, "Requires assets to make register controls visible");
    await clear.click();
    const result = new URL(page.url()).searchParams;
    expect(result.get("q")).toBeNull();
    expect(result.get("tab")).toBe("register");
    expect(result.get("sort")).toBe("purchase");
  });
});
