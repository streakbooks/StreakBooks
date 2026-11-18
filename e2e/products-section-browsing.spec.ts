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

  test("catalogue deep links restore filters after refresh and tab switching", async ({ page }) => {
    await signIn(
      page,
      "/products-services?section=catalogue&q=weekly&kind=service&status=active&sort=recent&page=1&pageSize=25",
    );
    const search = page.getByRole("textbox", { name: "Search products and services" });
    await expect(search).toHaveValue("weekly");
    await expect(page.getByRole("combobox", { name: "Item kind" })).toContainText("Services");
    await page.reload();
    await expect(search).toHaveValue("weekly");
    const categories = page.getByRole("tab", { name: "Categories" });
    await categories.click();
    expect(new URL(page.url()).searchParams.get("q")).toBe("weekly");
    expect(new URL(page.url()).searchParams.get("kind")).toBe("service");
    await page.getByRole("tab", { name: "Catalogue" }).click();
    await expect(search).toHaveValue("weekly");
    await expect(page.getByRole("combobox", { name: "Sort catalogue" })).toContainText(
      "Newest first",
    );
  });

  test("changing catalogue sorting updates a shareable URL and Back restores it", async ({
    page,
  }) => {
    await signIn(page, "/products-services?section=catalogue&sort=name");
    const sort = page.getByRole("combobox", { name: "Sort catalogue" });
    await sort.click();
    await page.getByRole("option", { name: "Name: Z–A" }).click();
    await expect(page).toHaveURL(/sort=name_desc/);
    await page.goBack();
    expect(new URL(page.url()).searchParams.get("sort")).toBe("name");
    await expect(sort).toContainText("Name: A–Z");
  });

});
