import { expect, test, type Page } from "@playwright/test";

const externalRequests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const external: string[] = [];
  externalRequests.set(page, external);
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") {
      external.push(url.hostname);
      return route.abort();
    }
    return route.continue();
  });
});
test.afterEach(async ({ page }) => {
  expect(externalRequests.get(page)).toEqual([]);
  const writes = await page.evaluate(() =>
    (window.voiceServer?.calls ?? []).filter((call) =>
      /^(save|create|authorise|post|void|delete|approve|record|update|send|reset|import|remove|ensure)/i.test(
        call.name,
      ),
    ),
  );
  expect(writes).toEqual([]);
});
const stray =
  "/?edit=unrelated-order&billId=unrelated-bill&bankAccountId=unrelated-bank&amount=999&direction=in";
for (const [action, heading] of [
  ["Purchase order", "New purchase order"],
  ["Supplier credit", "New credit note"],
  ["Transfer money", "Transfer money"],
  ["Spend money", "Spend money"],
  ["Receive money", "Receive money"],
  ["Manual Journal", "Manual journal"],
  ["Recurring journal", "Recurring journal template"],
]) {
  test(`Create ${action} opens from another page without inheriting its search context`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(stray);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("link", { name: action!, exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Create new" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: heading!, exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/unrelated/);
    expect(errors).toEqual([]);
    const requests = await page.evaluate(() =>
      window.voiceServer.calls.filter((call) =>
        ["getPurchaseOrder", "getBill"].includes(call.name),
      ),
    );
    expect(requests).toEqual([]);
    if (action === "Transfer money")
      await expect(page.getByRole("textbox", { name: "Transfer amount", exact: true })).toHaveValue(
        "",
      );
  });
}
test("native order edit route retains its scoped document context", async ({ page }) => {
  await page.goto("/purchases/orders/new?edit=route-order");
  await expect(page.getByRole("heading", { name: "Edit PO-FIX", exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => window.voiceServer.calls.find((call) => call.name === "getPurchaseOrder")?.data,
    ),
  ).toMatchObject({ companyId: "company-a", orderId: "route-order" });
});
test("native supplier-credit route retains its bill prefill", async ({ page }) => {
  await page.goto("/purchases/credit-notes/new?billId=route-bill");
  await expect(page.getByRole("heading", { name: "New credit note", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.voiceServer.calls.find((call) => call.name === "getBill")?.data),
    )
    .toMatchObject({ companyId: "company-a", billId: "route-bill" });
});
test("native transfer route retains statement amount and destination prefill", async ({ page }) => {
  await page.goto("/banking/transfers/new?bankAccountId=bank-a&amount=%22123.45%22&direction=in");
  await expect(page.getByRole("textbox", { name: "Transfer amount", exact: true })).toHaveValue(
    "123.45",
  );
  await expect(page.getByRole("combobox", { name: "To account", exact: true })).toContainText(
    "Operating account",
  );
});
test("view-only permissions keep the three create actions disabled", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.voiceFixture.setContext({ permissions: [] }));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  for (const name of ["Purchase order", "Supplier credit", "Transfer money"])
    await expect(page.getByRole("button", { name: new RegExp("^" + name) })).toBeDisabled();
});
test("mobile transfer draft survives resizing and Back restores the previous URL", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(stray);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Transfer money", exact: true }).click();
  const amount = page.getByRole("textbox", { name: "Transfer amount", exact: true });
  await amount.fill("42.50");
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(amount).toHaveValue("42.50");
  await expect(page).toHaveURL(/banking\/transfers\/new$/);
  await page.goBack();
  await expect(page).toHaveURL(/edit=unrelated-order/);
});

for (const [url, heading] of [
  ["/purchases/orders/new?edit=42", "New purchase order"],
  ["/purchases/credit-notes/new?billId=42", "New credit note"],
  ["/banking/transfers/new?amount=123.45", "Transfer money"],
]) {
  test(`raw numeric prefill is rejected safely: ${url}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url!);
    await expect(page.getByRole("heading", { name: heading!, exact: true })).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.voiceServer.calls.filter((call) =>
          ["getPurchaseOrder", "getBill"].includes(call.name),
        ),
      ),
    ).toEqual([]);
    if (url!.startsWith("/banking"))
      await expect(page.getByRole("textbox", { name: "Transfer amount", exact: true })).toHaveValue(
        "",
      );
    expect(errors).toEqual([]);
  });
}

test("modified Create clicks open the canonical form independently", async ({ page, context }) => {
  await page.goto(stray);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const transfer = page.getByRole("link", { name: "Transfer money", exact: true });
  await expect(transfer).toHaveAttribute("href", "/banking/transfers/new");
  const opened = context.waitForEvent("page");
  await transfer.click({ modifiers: ["Control"] });
  const tab = await opened;
  await expect(tab).toHaveURL(/banking\/transfers\/new$/);
  await tab.close();
  await expect(page.getByRole("dialog", { name: "Create new" })).toBeVisible();
  await expect(page).toHaveURL(/edit=unrelated-order/);
});
