import { test, expect } from "@playwright/test";
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 375, height: 667 },
]) {
  test(`selection, rejection, preference and keyboard controls ${viewport.width}px (isolated UI)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByText("conflicting classifications: review", { exact: false }),
    ).toBeVisible();
    const select = page.getByRole("button", { name: "Use suggestion" });
    await select.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Selected account")).toHaveText("expense");
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.memoryFixture.calls.some((c) => c.state === "rejected")),
      )
      .toBe(true);
    await page.getByText("Supporting history and preferences", { exact: true }).click();
    await expect(page.getByRole("link", { name: "View latest posting" })).toBeVisible();
    await page.getByRole("button", { name: "Disable preference" }).click();
    await expect(page.getByRole("button", { name: "Re-enable preference" })).toBeVisible();
    await page.getByRole("button", { name: "Re-enable preference" }).click();
    await expect(select).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.getByRole("button", { name: "Toggle read-only role" }).click();
    await expect(select).toBeDisabled();
    await expect(page.getByRole("button", { name: "Disable preference" })).toBeDisabled();
  });
}
test("feedback retries preserve request identity and migration absence is explicit (isolated UI)", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.memoryFixture.failures = 2;
  });
  await page.getByRole("button", { name: "Use suggestion" }).click();
  await expect(page.getByRole("alert")).toContainText("Fixture evidence service unavailable");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByLabel("Selected account")).toHaveText("expense");
  expect(
    await page.evaluate(() => new Set(window.memoryFixture.calls.map((c) => c.requestId)).size),
  ).toBe(1);
  await page.getByRole("button", { name: "Toggle migration availability" }).click();
  await expect(page.getByRole("status").filter({ hasText: "database update" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use suggestion" })).toHaveCount(0);
});

test("company switching ignores a late selection from the previous company (isolated UI)", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.memoryFixture.delay = 300;
  });
  await page.getByRole("button", { name: "Use suggestion" }).click();
  await page.getByRole("button", { name: "Switch company" }).click();
  await expect(page.getByLabel("Selected account")).toHaveText("");
  await expect(page.getByRole("button", { name: "Use suggestion" })).toBeEnabled();
  // Wait for the known fixture response, then assert the old callback stayed inert.
  await page.waitForTimeout(450);
  await expect(page.getByLabel("Selected account")).toHaveText("");
});
