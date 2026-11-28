import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

async function signIn(page: Page, destination: string) {
  await page.goto(`/auth?redirect=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password", { exact: true }).fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 20_000 });
}

test.describe("Settings route and breadcrumb contract", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Provide an authorised E2E test account; auth is not bypassed.");
  });

  test("category navigation, breadcrumbs, refresh and browser history use canonical routes", async ({
    page,
  }) => {
    await signIn(page, "/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    await page.getByRole("link", { name: /Accounting & Financial/ }).click();
    await expect(page).toHaveURL(/\/settings\/accounting\/overview/);
    const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumbs.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(breadcrumbs.getByText("Accounting & Financial", { exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.reload();
    await expect(page).toHaveURL(/\/settings\/accounting\/overview/);
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/accounting\/overview/);
    await page.goForward();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("legacy query links resolve to the canonical page and nested pages show the full trail", async ({
    page,
  }) => {
    await signIn(page, "/settings?section=sales");
    await expect(page).toHaveURL(/\/settings\/sales\/overview/);
    await page.getByRole("link", { name: "Invoice reminders", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/sales\/reminders/);

    const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumbs.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(
      breadcrumbs.getByRole("link", { name: "Sales & Receivables", exact: true }),
    ).toBeVisible();
    await expect(breadcrumbs.getByText("Invoice reminders", { exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(breadcrumbs).toBeVisible();
    await breadcrumbs.getByRole("link", { name: "Sales & Receivables", exact: true }).focus();
    await expect(
      breadcrumbs.getByRole("link", { name: "Sales & Receivables", exact: true }),
    ).toBeFocused();
  });

  test("module settings links offer a safe return to their source module", async ({ page }) => {
    await signIn(page, "/sales/settings");
    await page.getByRole("link", { name: "Invoice reminders", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/sales\/reminders/);
    const back = page.getByRole("link", { name: "Back to Sales", exact: true });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/sales\/settings/);
  });
});
