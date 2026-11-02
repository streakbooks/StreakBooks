import { test, expect } from "@playwright/test";
const content =
  "InvoiceNumber,ContactName,InvoiceDate,DueDate,AccountCode,Description,Quantity,UnitAmount\nINV-1,Customer,01/02/2026,28/02/2026,4000,Work,1,100.00";
test("upload, date mapping, validation report, and invalid replacement", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Source software", { exact: true }).selectOption("QuickBooks Online");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "export.csv", mimeType: "text/csv", buffer: Buffer.from(content) });
  await expect(page.getByRole("alert")).toContainText("select the source date format");
  await expect(page.getByLabel("Validated payload")).toHaveText("");
  await page.getByLabel("Source date format", { exact: true }).selectOption("DMY");
  await expect(page.getByRole("status").filter({ hasText: "File checks passed" })).toContainText(
    "File checks passed",
  );
  await expect(page.getByLabel("Validated payload")).toContainText("2026-02-01,2026-02-28");
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download validation report" }).click();
  expect((await waiting).suggestedFilename()).toBe("linkbooks-migration-validation.csv");
  await page.getByLabel("Map Customer", { exact: true }).selectOption("");
  await expect(page.getByRole("alert")).toContainText("Map required field: Customer");
  await expect(page.getByLabel("Validated payload")).toHaveText("");
  await page.locator('input[type="file"]').setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Name,Name\na,b"),
  });
  await expect(page.getByRole("alert")).toContainText("unique");
  await expect(page.getByLabel("Validated payload")).toHaveText("");
  expect(errors).toEqual([]);
});
