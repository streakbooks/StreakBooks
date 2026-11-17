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

test.describe("Sales invoices: complete browsing context", () => {
  test.beforeEach(() => {
    test.skip(
      !email || !password,
      "Provide an authorised E2E account, not bypassed authentication",
    );
  });

  test("reload keeps validated invoice filters, sort and page size", async ({ page }) => {
    await signIn(page, "/sales/invoices?status=draft&sort=due_date&dir=asc&pageSize=25&page=0");
    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
    await page.reload();
    const params = new URL(page.url()).searchParams;
    expect(params.get("status")).toBe("draft");
    expect(params.get("sort")).toBe("due_date");
    expect(params.get("dir")).toBe("asc");
    expect(params.get("pageSize")).toBe("25");
    await expect(page.getByRole("combobox", { name: "Status" })).toBeVisible();
  });

  test("New Invoice returns to the original list instead of resetting filters", async ({
    page,
  }) => {
    await signIn(page, "/sales/invoices?sort=due_date&dir=asc&pageSize=25&page=0");
    await page.getByRole("link", { name: "New invoice" }).first().click();
    await expect(page).toHaveURL(/\/sales\/invoices\/new/);
    expect(new URL(page.url()).searchParams.has("returnContext")).toBe(true);
    await page.getByRole("link", { name: "Back to Invoices" }).click();
    const params = new URL(page.url()).searchParams;
    expect(params.get("sort")).toBe("due_date");
    expect(params.get("dir")).toBe("asc");
    expect(params.get("pageSize")).toBe("25");
  });

  test("opening a seeded invoice returns with filters and pagination", async ({ page }) => {
    await signIn(page, "/sales/invoices?sort=due_date&dir=asc&pageSize=25&page=0");
    const record = page
      .locator('tbody a[href*="/sales/invoices/"][href*="returnContext="]')
      .first();
    test.skip(
      (await record.count()) === 0,
      "Requires an authorised organisation with invoice fixtures",
    );
    await record.click();
    await expect(page).toHaveURL(/\/sales\/invoices\/[^/]+/);
    expect(new URL(page.url()).searchParams.has("returnContext")).toBe(true);
    await page.getByRole("link", { name: "Back to Invoices" }).click();
    const params = new URL(page.url()).searchParams;
    expect(params.get("sort")).toBe("due_date");
    expect(params.get("dir")).toBe("asc");
    expect(params.get("pageSize")).toBe("25");
  });
});
