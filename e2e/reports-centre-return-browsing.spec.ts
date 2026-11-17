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

test.describe("Reports Centre: native return-to-origin browsing", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Requires an authorised organisation and E2E account");
  });

  test("return from a report restores catalogue query and reporting period", async ({ page }) => {
    await signIn(page, "/reports?tab=standard&query=profit&from=2026-01-01&to=2026-10-31");
    const report = page
      .locator('section[aria-label="Report catalogue"] a[href*="centre="]')
      .first();
    await expect(report).toBeVisible();
    await report.click();
    await expect(page).toHaveURL(/\/reports\/[^/?]+/);
    const encodedOrigin = new URL(page.url()).searchParams.get("centre");
    expect(encodedOrigin).toContain("query=profit");
    await page.getByRole("link", { name: "Back to Reports Centre" }).click();
    const returned = new URL(page.url()).searchParams;
    expect(returned.get("tab")).toBe("standard");
    expect(returned.get("query")).toBe("profit");
    expect(returned.get("from")).toBe("2026-01-01");
    expect(returned.get("to")).toBe("2026-10-31");
  });

  test("open report in a new tab and return via its native origin link", async ({
    page,
    context,
  }) => {
    await signIn(page, "/reports?tab=standard&query=profit");
    const report = page
      .locator('section[aria-label="Report catalogue"] a[href*="centre="]')
      .first();
    await expect(report).toBeVisible();
    const opened = context.waitForEvent("page");
    await report.click({ modifiers: ["Control"] });
    const newTab = await opened;
    await newTab.waitForLoadState("domcontentloaded");
    await expect(newTab).toHaveURL(/\/reports\/[^/?]+/);
    await newTab.getByRole("link", { name: "Back to Reports Centre" }).click();
    expect(new URL(newTab.url()).searchParams.get("query")).toBe("profit");
    expect(new URL(page.url()).searchParams.get("query")).toBe("profit");
    await newTab.close();
  });

  test("direct report deep link has a deterministic Reports Centre return", async ({ page }) => {
    await signIn(page, "/reports/profit-and-loss?from=2026-01-01&to=2026-10-31");
    await page.getByRole("link", { name: "Back to Reports Centre" }).click();
    await expect(page).toHaveURL(/\/reports(?:\/|\?|$)/);
    expect(new URL(page.url()).searchParams.get("tab")).toBe("standard");
  });
});
