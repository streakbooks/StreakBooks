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

test.describe("Contact creation respects directory browsing context", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Authorised test account required");
  });

  test("New Contact and Back preserve directory search and sorting", async ({ page }) => {
    await signIn(page, "/contacts?view=customers&q=Acme&sort=name_desc&page=0");
    await page.getByRole("link", { name: "New contact" }).click();
    await expect(page).toHaveURL(/\/contacts\/new/);
    const token = new URL(page.url()).searchParams.get("returnContext");
    expect(token).toBeTruthy();
    const origin = new URLSearchParams(token!);
    expect(origin.get("view")).toBe("customers");
    expect(origin.get("q")).toBe("Acme");
    expect(origin.get("sort")).toBe("name_desc");
    await page.getByRole("link", { name: "Back to directory" }).click();
    const restored = new URL(page.url()).searchParams;
    expect(restored.get("view")).toBe("customers");
    expect(restored.get("q")).toBe("Acme");
    expect(restored.get("sort")).toBe("name_desc");
  });

  test("invalid direct return tokens never become open redirects", async ({ page }) => {
    await signIn(
      page,
      "/contacts/new?returnContext=" +
        encodeURIComponent("next=https%3A%2F%2Fevil.example&view=suppliers&admin=true"),
    );
    await page.getByRole("link", { name: "Back to directory" }).click();
    await expect(page).toHaveURL(/\/contacts(?:\/|\?|$)/);
    const params = new URL(page.url()).searchParams;
    expect(params.get("view")).toBe("suppliers");
    expect(params.has("admin")).toBe(false);
    expect(params.has("next")).toBe(false);
  });
});
