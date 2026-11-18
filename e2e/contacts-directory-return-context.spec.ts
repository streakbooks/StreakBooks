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

test.describe("Contacts: preserving the originating directory view", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Requires an authorised E2E test account");
  });

  test("a contact preserves the Suppliers view across detail tabs and Directory return", async ({
    page,
  }) => {
    await signIn(page, "/contacts?view=suppliers");
    await expect(page.getByRole("tab", { name: "Suppliers" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const record = page.locator('tbody a[href*="/contacts/"][href*="fromView=suppliers"]').first();
    test.skip((await record.count()) === 0, "Requires an authorised seeded supplier contact");
    await record.click();

    await expect(page).toHaveURL(/\/contacts\/[^/?]+\?fromView=suppliers/);
    await page.getByRole("tab", { name: "People" }).click();
    const detail = new URL(page.url());
    expect(detail.searchParams.get("fromView")).toBe("suppliers");
    expect(detail.searchParams.get("tab")).toBe("people");

    await page.getByRole("link", { name: "Directory" }).click();
    await expect(page).toHaveURL(/\/contacts(?:\/)?\?view=suppliers/);
    await expect(page.getByRole("tab", { name: "Suppliers" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("direct contact links without origin still return to the default directory", async ({
    page,
  }) => {
    await signIn(page, "/contacts?view=all");
    const record = page.locator('tbody a[href*="/contacts/"]').first();
    test.skip((await record.count()) === 0, "Requires at least one authorised contact fixture");
    await record.click();
    await expect(page.getByRole("link", { name: "Directory" })).toBeVisible();
    await page.getByRole("link", { name: "Directory" }).click();
    await expect(page).toHaveURL(/\/contacts/);
    await expect(page.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
  });

  test("contact directory deep-link query and sorting survive refresh and role tabs", async ({
    page,
  }) => {
    await signIn(page, "/contacts?view=customers&q=consulting&sort=name_desc&page=0");
    await expect(page.getByRole("textbox", { name: "Search contacts" })).toHaveValue("consulting");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Search contacts" })).toHaveValue("consulting");
    await page.getByRole("tab", { name: "Suppliers" }).click();
    const params = new URL(page.url()).searchParams;
    expect(params.get("view")).toBe("suppliers");
    expect(params.get("q")).toBe("consulting");
    expect(params.get("sort")).toBe("name_desc");
  });

  test("contact record can return to its originating directory sorting and page", async ({
    page,
  }) => {
    await signIn(page, "/contacts?view=all&sort=name_desc&page=0");
    const contact = page.locator('tbody a[href*="/contacts/"][href*="returnContext="]').first();
    test.skip((await contact.count()) === 0, "Requires an authorised contact fixture");
    await contact.click();
    await expect(page).toHaveURL(/\/contacts\/[^/?]+/);
    await page.getByRole("tab", { name: "People" }).click();
    expect(new URL(page.url()).searchParams.has("returnContext")).toBe(true);
    await page.getByRole("link", { name: "Directory" }).click();
    const params = new URL(page.url()).searchParams;
    expect(params.get("sort")).toBe("name_desc");
    expect(params.get("page")).toBe("0");
  });
});
