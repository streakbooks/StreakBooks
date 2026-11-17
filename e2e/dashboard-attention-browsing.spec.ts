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

test.describe("Dashboard native attention-workspace browsing", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Requires an authorised E2E organisation");
  });

  test("direct attention link and refresh restore the same priority queue", async ({ page }) => {
    await signIn(page, "/?attention=overdue");
    const group = page.getByRole("group", { name: "Filter bookkeeping tasks" });
    await expect(group.getByRole("link", { name: /Overdue/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.reload();
    await expect(group.getByRole("link", { name: /Overdue/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("queue navigation preserves browser history and supports native new-tab links", async ({
    page,
    context,
  }) => {
    await signIn(page, "/?attention=all");
    const group = page.getByRole("group", { name: "Filter bookkeeping tasks" });
    const bank = group.getByRole("link", { name: /Bank review/ });
    await bank.click();
    expect(new URL(page.url()).searchParams.get("attention")).toBe("bank");
    await page.goBack();
    expect(new URL(page.url()).searchParams.get("attention")).toBe("all");
    const newTabPromise = context.waitForEvent("page");
    await bank.click({ modifiers: ["Control"] });
    const newTab = await newTabPromise;
    await newTab.waitForLoadState("domcontentloaded");
    expect(new URL(newTab.url()).searchParams.get("attention")).toBe("bank");
    expect(new URL(page.url()).searchParams.get("attention")).toBe("all");
    await newTab.close();
  });
});
