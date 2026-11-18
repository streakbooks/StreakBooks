import { expect, test } from "@playwright/test";
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`cart preview and clear at ${viewport.width}px (isolated fixture)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
    await page.getByLabel("Name or SKU").fill("CONS");
    await page.getByLabel("Name or SKU").press("Enter");
    await page.getByRole("button", { name: "Add Consultation" }).click();
    await expect(page.getByText("110.00", { exact: true })).toBeVisible();
    const breakdown = page.getByRole("region", { name: "Cart price breakdown" });
    await expect(breakdown).toContainText("Itemised price preview");
    await expect(breakdown).toContainText("CONS · 1 × 100.00");
    await expect(breakdown).toContainText("Line net");
    await expect(breakdown).toContainText("Line tax");

    await page.getByLabel("Quantity", { exact: true }).fill("2");
    await expect(page.getByText("220.00", { exact: true })).toBeVisible();
    await expect(breakdown).toContainText("CONS · 2 × 100.00");
    await page.getByRole("button", { name: "Refresh prices" }).click();
    await expect(page.getByText("220.00", { exact: true })).toBeVisible();
    await page.getByLabel("Cash tendered (USD)").fill("250.00");
    await expect(page.getByText("Change due: 30.00")).toBeVisible();
    await page.getByRole("button", { name: "Complete cash sale" }).click();
    await expect(page.getByRole("region", { name: "Last receipt" })).toContainText("Change due: 30.00");
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: "Clear cart" }).click();
    await expect(page.getByText("220.00", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  });
}
test("company switch clears the cart", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add Consultation" }).click();
  await expect(page.getByText("110.00", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { switchPosCompany: () => void }).switchPosCompany(),
  );
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  await expect(page.getByText("110.00", { exact: true })).toHaveCount(0);
});
test("denied permission hides catalogue", async ({ page }) => {
  await page.goto("/?denied=true");
  await expect(page.getByRole("heading", { name: "POS access required" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Consultation" })).toHaveCount(0);
});
test("quote failure shows retry without a total", async ({ page }) => {
  await page.goto("/?quoteError=true");
  await page.getByRole("button", { name: "Add Consultation" }).click();
  await expect(page.getByRole("heading", { name: "Could not calculate cart" })).toBeVisible();
  await expect(page.getByText("Total preview", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("110.00", { exact: true })).toBeVisible();
});
