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

test.describe("Action Center: bookmarkable grouping", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Authenticated E2E test account required");
  });

  test("grouping remains active through refresh and browser Back", async ({ page }) => {
    await signIn(page, "/notifications?view=all&sort=newest");
    const grouping = page.getByRole("button", { name: "Group page by module" });
    test.skip((await grouping.count()) === 0, "Requires authorised notification fixtures");

    await expect(grouping).toHaveAttribute("aria-pressed", "false");
    await grouping.click();
    expect(new URL(page.url()).searchParams.get("group")).toBe("true");
    await expect(grouping).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(grouping).toHaveAttribute("aria-pressed", "true");
    await grouping.click();
    expect(new URL(page.url()).searchParams.get("group")).toBeNull();
    await page.goBack();
    await expect(grouping).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.get("sort")).toBe("newest");
  });
});
