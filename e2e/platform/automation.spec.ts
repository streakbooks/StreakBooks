import { test, expect } from "@playwright/test";
const base = "/platform/automation?module=";
test("queueing stays distinct from execution and exposes actual attempt history", async ({
  page,
}) => {
  await page.goto(base + "jobs");
  await expect(page.getByText("Attempts: 5 / 5")).toBeVisible();
  await page.getByRole("link", { name: "Attempt history" }).click();
  await expect(page.getByRole("dialog")).toContainText("Handler failure code: P0001");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Queue implemented job" }).click();
  await page.getByLabel("Reason for this action").fill("Run observed operational checks");
  await page.getByRole("button", { name: "Queue job", exact: true }).click();
  await expect(page.getByText("Attempts: 0 / 5")).toBeVisible();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Attempts: 0 / 5" })
      .getByText("queued", { exact: true }),
  ).toBeVisible();
});
test("enabling a paused rule keeps missing observation unknown", async ({ page }) => {
  await page.goto(base + "rules");
  await expect(page.getByText("Last measured count: Unknown")).toBeVisible();
  await page.getByRole("button", { name: "Enable rule" }).click();
  await page.getByLabel("Reason for this action").fill("Configured source reviewed");
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByText("unknown · warning", { exact: true })).toBeVisible();
  await expect(page.getByText("Last measured count: Unknown")).toBeVisible();
});
test("creates a rule with a measured source and preserves configuration on conflict", async ({
  page,
}) => {
  await page.goto(base + "rules&conflict=1");
  await page.getByRole("button", { name: "Create alert rule" }).click();
  await page.getByLabel("Rule name", { exact: true }).fill("Critical deadline review");
  await page.getByLabel("Reason for this action").fill("Support escalation policy");
  await page.getByRole("button", { name: "Create paused rule" }).click();
  await expect(page.getByRole("alert")).toContainText("rule changed");
  await expect(page.getByLabel("Rule name", { exact: true })).toHaveValue(
    "Critical deadline review",
  );
});
test("acknowledgment records attention without claiming recovery", async ({ page }) => {
  await page.goto(base + "events");
  await page.getByRole("button", { name: "Acknowledge alert" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "does not claim the underlying problem is resolved",
  );
  await page.getByLabel("Reason for this action").fill("Assigned to support lead");
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByRole("button", { name: "Acknowledge alert" })).toHaveCount(0);
  await expect(page.getByText("Resolved: Not recorded")).toBeVisible();
});
test("unconfigured scheduler and denied source are visible", async ({ page }) => {
  await page.goto(base + "jobs&unconfigured=1");
  await expect(page.getByRole("alert")).toContainText(
    "Queued work must not be treated as completed",
  );
  await page.goto(base + "jobs&automationDenied=1");
  await expect(page.getByRole("alert")).toContainText("permission required");
  await page.goto(base + "jobs&automationError=1");
  await expect(page.getByRole("alert")).toContainText("Automation source unavailable");
});
test("read-only roles see records without execution or configuration controls", async ({
  page,
}) => {
  await page.goto(base + "jobs&readonly=1");
  await expect(page.getByRole("link", { name: "Attempt history" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Queue implemented job" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review retry" })).toHaveCount(0);
  await page.goto(base + "rules&readonly=1");
  await expect(page.getByRole("button", { name: "Configure rule" })).toHaveCount(0);
});

test("closing a failed record retains attempts without claiming success", async ({ page }) => {
  await page.goto(base + "jobs");
  await page.getByRole("button", { name: "Close failed job" }).click();
  await expect(page.getByRole("dialog")).toContainText("without claiming successful execution");
  await page.getByLabel("Reason for this action").fill("Dependency reviewed; close dead letter");
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByRole("article").getByText("cancelled", { exact: true })).toBeVisible();
  await expect(page.getByText("Attempts: 5 / 5")).toBeVisible();
});
