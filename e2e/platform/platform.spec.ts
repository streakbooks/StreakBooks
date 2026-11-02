import { expect, test } from "@playwright/test";
test("customer information tabs show real metadata and permission states", async ({ page }) => {
  await page.goto("/?nobilling");
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Team", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Client One", exact: true })).toBeVisible();
  await expect(page.getByText("1 members shown, up to 100.", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Subscription", exact: true }).click();
  await expect(page.getByText("growth", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Billing activity", exact: true }).click();
  await expect(page.getByText("Billing activity requires billing view permission.")).toBeVisible();
});
test("no subscription is an explicit empty state", async ({ page }) => {
  await page.goto("/?nosub");
  await page.getByRole("tab", { name: "Subscription", exact: true }).click();
  await expect(page.getByText("No subscription is recorded for this business.")).toBeVisible();
});
test("request creates a pending request and does not claim active access", async ({ page }) => {
  await page.goto("/?empty");
  await expect(page.getByText("No support access requests recorded.")).toBeVisible();
  await page.getByRole("button", { name: "Request temporary support access", exact: true }).click();
  await page.getByLabel("Investigation reason").fill("Investigate client posting metadata");
  await page.getByLabel("Support duration").selectOption("30");
  await page.getByRole("button", { name: "Request second-person approval", exact: true }).click();
  await expect(page.getByText("Submitted for approval. Access is not active yet.")).toBeVisible();
  await expect(page.getByText("Example Company · pending")).toBeVisible();
});
test("request errors stay visible", async ({ page }) => {
  await page.goto("/?reject");
  await page.getByRole("button", { name: "Request temporary support access", exact: true }).click();
  await page.getByLabel("Investigation reason").fill("Review duplicate");
  await page.getByRole("button", { name: "Request second-person approval", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("already has break-glass access");
});
test("revocation updates status", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Revocation reason").fill("Investigation finished");
  await page.getByRole("button", { name: "Revoke access to Example Company" }).click();
  await expect(page.getByText("Example Company · revoked")).toBeVisible();
  await expect(page.getByText("Access revoked.", { exact: true })).toBeVisible();
});
test("read-only staff cannot request or revoke", async ({ page }) => {
  await page.goto("/?readonly");
  await expect(page.getByText("Example Company · active")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request temporary support access", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Revoke access to Example Company" })).toHaveCount(
    0,
  );
});
test("missing migration hides request and shows unavailable", async ({ page }) => {
  await page.goto("/?unavailable");
  await expect(page.getByText("Supervised support is unavailable", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request temporary support access", exact: true }),
  ).toHaveCount(0);
});
test("permission error is not an empty or unavailable result", async ({ page }) => {
  await page.goto("/?error");
  await expect(page.getByRole("alert")).toHaveText("Support permission denied");
  await expect(page.getByText("No support access requests recorded.")).toHaveCount(0);
});
test("approver sees scope and can record a decision", async ({ page }) => {
  await page.goto("/?approvals");
  await expect(page.getByText("journal diagnostic headers", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grant or revoke one feature" })).toHaveCount(0);
  await page.getByLabel("Decision reason").fill("Scope and expiry reviewed");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("No pending approvals.")).toBeVisible();
});
test("self approval controls are hidden", async ({ page }) => {
  await page.goto("/?approvals&self");
  await expect(page.getByText("Waiting for a different approver.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
});
test("unsupported request cannot be approved", async ({ page }) => {
  await page.goto("/?approvals&unsupported");
  await page.getByLabel("Decision reason").fill("No handler exists");
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toBeEnabled();
});
test("customer tabs remain usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Billing activity", exact: true }).click();
  await expect(page.getByRole("cell", { name: "subscription.updated", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("customer tabs support keyboard navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Team", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("approved requester opens diagnostics for the selected business", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Read diagnostics for Example Company", exact: true })
    .click();
  await expect(
    page.getByText("Diagnostic business selected: 20000000-0000-4000-8000-000000000001", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/platform-customer360.png", fullPage: true });
});
