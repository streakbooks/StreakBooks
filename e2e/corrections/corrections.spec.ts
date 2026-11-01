import { readFile } from "node:fs/promises";
import { parseImportCsv } from "../../src/lib/imports/import-preflight";
import { test, expect } from "@playwright/test";
const selectable = "Select journal 123 line 00000000-0000-4000-8000-000000000004";
async function plan(page: import("@playwright/test").Page, reason = "Correct expense coding") {
  await page.getByLabel("Correction search from", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Correction search through", { exact: true }).fill("2026-10-31");
  await page.getByRole("button", { name: "Find posted lines", exact: true }).click();
  await page.getByRole("checkbox", { name: selectable, exact: true }).check();
  await page
    .getByLabel("Correction destination account", { exact: true })
    .selectOption("00000000-0000-4000-8000-000000000003");
  await page.getByLabel("Correction reason", { exact: true }).fill(reason);
  await page.getByRole("button", { name: "Preview correction", exact: true }).click();
}
test("search, exclusions, preview invalidation, posting evidence, history and undo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await plan(page);
  await expect(
    page.getByRole("row").filter({ hasText: "Foreign-currency corrections" }),
  ).toContainText("USD 100.00");
  await page.screenshot({ path: "work/corrections-preview.png", fullPage: true });
  await expect(page.getByRole("checkbox", { name: /Select journal 124/ })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Post correction batch", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Correction reason", { exact: true }).fill("Updated supporting reference");
  await expect(
    page.getByRole("button", { name: "Post correction batch", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Preview correction", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download posting plan", exact: true }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toBe("linkbooks-transaction-correction.csv");
  const report = parseImportCsv(await readFile((await file.path())!, "utf8"));
  expect(report[1]).toHaveLength(report[0]!.length);
  expect(report[1]![report[0]!.indexOf("Currency")]).toBe("GBP");
  expect(report[1]![report[0]!.indexOf("Debit")]).toBe("100.00");
  await page.getByLabel("Acknowledge correction posting", { exact: true }).check();
  await page.getByRole("button", { name: "Post correction batch", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("recorded (applied)");
  await page.locator("summary").filter({ hasText: "Applied" }).click();
  await page.getByRole("button", { name: "Prepare undo", exact: true }).click();
  await page.getByLabel("Correction undo date", { exact: true }).fill("2026-11-01");
  await page
    .getByLabel("Correction undo reason", { exact: true })
    .fill("Undo correction after review");
  await page.getByRole("button", { name: "Post undo journals", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("undone");
  await expect(page.locator("summary")).toContainText("Undone");
  expect(errors).toEqual([]);
});
test("lost responses retain the same request reference for an exact retry", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await plan(page, "Simulate lost response");
  await page.getByLabel("Acknowledge correction posting", { exact: true }).check();
  await page.getByRole("button", { name: "Post correction batch", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Network response lost");
  await page.getByRole("button", { name: "Post correction batch", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("recorded (applied)");
  const references = JSON.parse(
    (await page.getByLabel("Posted request references", { exact: true }).textContent()) || "[]",
  );
  expect(references).toHaveLength(2);
  expect(references[0]).toBe(references[1]);
  await expect(page.locator("summary")).toHaveCount(1);
});
test("view-only users can search but cannot select or post corrections", async ({ page }) => {
  await page.goto("/?readonly=1");
  await page.getByRole("button", { name: "Find posted lines", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: selectable, exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Preview correction", exact: true }),
  ).toBeDisabled();
});

test("amount filters reject excess currency precision before searching", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Correction minimum amount", { exact: true }).fill("1.001");
  await page.getByRole("button", { name: "Find posted lines", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("at most 2 decimal places");
  await expect(page.getByRole("checkbox", { name: selectable, exact: true })).toHaveCount(0);
});

test("report-export denial disables evidence downloads", async ({ page }) => {
  await page.goto("/?noexport=1");
  await plan(page);
  await expect(
    page.getByRole("button", { name: "Download posting plan", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("CSV evidence downloads require report-export permission."),
  ).toBeVisible();
});
