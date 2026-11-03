import { test, expect } from "@playwright/test";
const sample = "80000000-0000-4000-8000-000000000001";
const base = "/platform/operations?module=cases";
test("case details survive refresh and native new tab", async ({ page, context }) => {
  await page.goto(base);
  const record = page.getByRole("link", { name: "Invoice assistance" });
  await expect(record).toBeVisible();
  const href = await record.getAttribute("href");
  const tab = await context.newPage();
  await tab.goto(href!);
  await expect(tab.getByRole("dialog")).toContainText("Review customer request");
  await tab.reload();
  await expect(tab.getByRole("dialog")).toContainText("Invoice assistance");
  await tab.close();
});
test("creates a real form record with searchable business and internal audit note", async ({
  page,
}) => {
  await page.goto(base + "&empty=1");
  await page.getByRole("button", { name: "Create case", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Subject", { exact: true }).fill("Customer reporting assistance");
  await dialog.getByRole("combobox", { name: "Business", exact: true }).click();
  await page.getByRole("option", { name: "Example Company" }).click();
  await dialog.getByLabel("Description", { exact: true }).fill("Help with reporting navigation");
  await dialog.getByLabel("Reason for this action").fill("Customer requested support");
  await dialog.getByRole("button", { name: "Create record" }).click();
  await expect(page.getByRole("dialog")).toContainText("Customer reporting assistance");
  await page.getByRole("button", { name: "actions", exact: true }).click();
  await page.getByLabel("Internal note", { exact: true }).fill("Waiting for customer confirmation");
  await page.getByLabel("Reason for this action").nth(1).fill("Record support follow-up");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByRole("button", { name: "history", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Waiting for customer confirmation");
});
test("close and reopen retains record and changes allowed edit controls", async ({ page }) => {
  await page.goto(base + `&item=${sample}`);
  await page.getByRole("button", { name: "actions", exact: true }).click();
  await page.getByLabel("Reason for this action").first().fill("Customer confirmed resolution");
  await page.getByRole("button", { name: "close case", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("closed");
  await expect(page.getByRole("button", { name: "edit", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "actions", exact: true }).click();
  await page.getByLabel("Reason for this action").first().fill("Follow-up needs review");
  await page.getByRole("button", { name: "reopen case", exact: true }).click();
  await expect(page.getByRole("button", { name: "edit", exact: true })).toBeVisible();
});
test("stale edit preserves dirty values and offers explicit reload", async ({ page }) => {
  await page.goto(base + `&item=${sample}&conflict=1`);
  await page.getByRole("button", { name: "edit", exact: true }).click();
  await page.getByLabel("Subject", { exact: true }).fill("My unsaved case edit");
  await page.getByLabel("Reason for this action").fill("Customer context updated");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("record changed");
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("My unsaved case edit");
  await expect(page.getByRole("button", { name: "Reload latest" })).toBeVisible();
});
test("read-only staff can inspect without mutation controls", async ({ page }) => {
  await page.goto(base + `&item=${sample}&readonly=1`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create case", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "actions", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "edit", exact: true })).toHaveCount(0);
});
test("permission, error, empty and invalid URL states remain clear", async ({ page }) => {
  await page.goto(base + "&opsDenied=1");
  await expect(page.getByRole("alert")).toContainText("permission required");
  await page.goto(base + "&opsError=1");
  await expect(page.getByRole("alert")).toContainText("Operations unavailable");
  await page.goto(base + "&empty=1&item=bad");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("No matching service cases.")).toBeVisible();
});
test("segment preview shows business names and actual change count before confirmation", async ({
  page,
}) => {
  await page.goto(`/platform/operations?module=segments&item=${sample}`);
  await page.getByRole("button", { name: "members", exact: true }).click();
  await page.getByRole("button", { name: "Select for removal" }).click();
  await expect(page.getByRole("button", { name: "Confirm membership changes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Preview membership change" }).click();
  await expect(page.getByText("1 changes from 1 selected businesses")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm membership changes" })).toBeVisible();
});
test("narrow viewport keeps controls reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await expect(page.getByRole("button", { name: "Create case", exact: true })).toBeInViewport();
  await page.getByRole("link", { name: "Invoice assistance" }).click();
  await expect(page.getByRole("button", { name: "Reload latest" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true,
  );
});
