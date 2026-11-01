import { expect, test } from "@playwright/test";
test("create deadlines, protect self review and read-only work, export evidence and generate packs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Client work & month-end review" })).toBeVisible();
  const protectedRow = page.getByRole("row").filter({ hasText: "View-only tax review" });
  await expect(protectedRow.getByRole("checkbox")).toBeDisabled();
  await expect(protectedRow.getByRole("button", { name: "Edit work" })).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Select Reconcile October bank for Writable client",
      exact: true,
    })
    .check();
  await page.getByLabel("Bulk work action", { exact: true }).selectOption("completed");
  await page.getByLabel("Bulk evidence note", { exact: true }).fill("Reviewed supporting reports");
  await expect(page.getByRole("button", { name: "Apply to selected work" })).toBeDisabled();
  await page.getByLabel("Bulk work action", { exact: true }).selectOption("in_progress");
  await page.getByRole("button", { name: "Apply to selected work" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Reconcile October bank" })).toContainText(
    "In progress",
  );
  await page.getByLabel("Work title", { exact: true }).fill("Client VAT deadline");
  await page.getByLabel("Work due date", { exact: true }).fill("2026-11-30");
  await page.getByRole("button", { name: "Create deadline", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "Client VAT deadline" })).toBeVisible();
  await page.getByLabel("Search client work", { exact: true }).fill("VAT");
  await expect(page.getByRole("row").filter({ hasText: "Reconcile October bank" })).toHaveCount(0);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export work CSV" }).click();
  expect((await downloading).suggestedFilename()).toBe("linkbooks-practice-work.csv");
  await page.getByLabel("Accounting month", { exact: true }).fill("2026-10");
  await page.getByLabel("Month-end deadline", { exact: true }).fill("2026-11-07");
  await page.getByRole("button", { name: "Generate month-end work", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Writable client: 6 tasks created");
  await expect(page.getByRole("status")).not.toContainText("View only client");
  expect(errors).toEqual([]);
});
