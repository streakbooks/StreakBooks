import { expect, test } from "@playwright/test";

test("requester submits a draft and cannot approve their own order", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "PO-0042" })).toBeVisible();
  await page.screenshot({ path: "work/po-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Submit for approval", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Comment (optional)").fill("Required for the office");
  await dialog.getByRole("button", { name: "Submit for approval", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Another authorised user must review your order.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve order", exact: true })).toHaveCount(0);
});

test("reviewer approves a submitted order", async ({ page }) => {
  await page.goto("/?state=pending&role=reviewer");
  await page.getByRole("button", { name: "Approve order", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Approve order", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Mark as sent", exact: true })).toBeVisible();
});

test("receiving preserves order currency and exposes billable goods", async ({ page }) => {
  await page.goto("/?state=sent");
  await expect(page.getByText("Delivery overdue", { exact: true })).toBeVisible();
  await expect(page.getByText("Total (USD)", { exact: true })).toBeVisible();
  await expect(page.getByText("$100.00", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Record receipt", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Delivery / receipt reference").fill("DN-42");
  await dialog.locator('input[inputmode="decimal"]').fill("4");
  await dialog.getByRole("button", { name: "Record receipt", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("DN-42").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bill received goods", exact: true }),
  ).toBeVisible();
});

test("viewer has no mutation controls and mobile layout contains horizontal tables", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?state=sent&role=viewer");
  await expect(page.getByRole("heading", { name: "PO-0042" })).toBeVisible();
  for (const name of [
    "Record receipt",
    "Bill received goods",
    "Duplicate as draft",
    "Delivery & terms",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "work/po-mobile.png", fullPage: true });
});
