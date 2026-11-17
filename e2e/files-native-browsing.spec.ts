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

test.describe("Files workspace: native URL-backed browsing", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "An authorised organisation and browser account are required");
  });

  test("filter, sort and workspace selection survive refresh", async ({ page }) => {
    await signIn(page, "/files?view=all&q=receipt&type=company&sort=name&page=0");
    await expect(page.getByRole("textbox", { name: "Search file names" })).toHaveValue("receipt");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Search file names" })).toHaveValue("receipt");
    expect(new URL(page.url()).searchParams.get("sort")).toBe("name");
    expect(new URL(page.url()).searchParams.get("type")).toBe("company");
  });

  test("opening and returning from document review preserves the search", async ({ page }) => {
    await signIn(page, "/files?view=all&q=receipts");
    const review = page.getByRole("link", { name: "Document review" });
    await expect(review).toBeVisible();
    await review.click();
    expect(new URL(page.url()).searchParams.get("view")).toBe("review");
    expect(new URL(page.url()).searchParams.get("q")).toBe("receipts");
    await page.getByRole("link", { name: "Back to Files" }).click();
    expect(new URL(page.url()).searchParams.get("view")).toBe("all");
    expect(new URL(page.url()).searchParams.get("q")).toBe("receipts");
  });

  test("folder links preserve current filters and support browser Back", async ({ page }) => {
    await signIn(page, "/files?q=pdf&sort=largest");
    const folder = page
      .locator('section[aria-label="Document folders"] a[href*="folder="]')
      .first();
    test.skip((await folder.count()) === 0, "Requires an authorised seeded document folder");
    await folder.click();
    expect(new URL(page.url()).searchParams.has("folder")).toBe(true);
    expect(new URL(page.url()).searchParams.get("q")).toBe("pdf");
    await page.goBack();
    expect(new URL(page.url()).searchParams.get("folder")).toBeNull();
    expect(new URL(page.url()).searchParams.get("sort")).toBe("largest");
  });
});
