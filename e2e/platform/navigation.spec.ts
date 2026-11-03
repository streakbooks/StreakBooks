import { expect, test } from "@playwright/test";
const business = "20000000-0000-4000-8000-000000000001";
const user = "00000000-0000-4000-8000-000000000001";
async function search(page: import("@playwright/test").Page, term = "Example") {
  await page.goto("/platform");
  await page.getByRole("button", { name: "Search platform", exact: true }).click();
  await page.getByLabel("Search platform records").fill(term);
  await page.getByRole("button", { name: "Search records", exact: true }).click();
}
test("search results are native links and open an exact customer record", async ({ page }) => {
  await search(page);
  const link = page.getByRole("link", { name: "Example Company Business", exact: true });
  await expect(link).toHaveAttribute("href", new RegExp(`record=${business}`));
  await link.click();
  await expect(page.getByRole("heading", { name: "Customer 360 · Example Company" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Customer 360 · Example Company" })).toBeVisible();
});
test("browser Back and Forward preserve record navigation", async ({ page }) => {
  await search(page);
  await page.getByRole("link", { name: "Example Company Business", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Customer 360 · Example Company" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Customer 360 · Example Company" })).toBeVisible();
});
test("search links support opening in another tab", async ({ page, context }) => {
  await search(page);
  const created = context.waitForEvent("page");
  await page
    .getByRole("link", { name: "Example Firm Accounting firm", exact: true })
    .click({ modifiers: ["Control"] });
  const tab = await created;
  await expect(tab.getByRole("heading", { name: "Accounting firm · Example Firm" })).toBeVisible();
  await tab.close();
});
test("customer team links reach user details and return to the business", async ({ page }) => {
  await page.goto(`/platform?section=businesses&record=${business}`);
  await page.getByRole("tab", { name: "Team", exact: true }).click();
  await page.getByRole("link", { name: user, exact: true }).click();
  await expect(page.getByRole("heading", { name: "User details · Example User" })).toBeVisible();
  await page.getByRole("link", { name: business, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Customer 360 · Example Company" })).toBeVisible();
});
test("invalid identifiers cannot open arbitrary records", async ({ page }) => {
  await page.goto("/platform?section=businesses&record=../../journals");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("missing record is an error with retry, not a blank dialog", async ({ page }) => {
  await page.goto(`/platform?section=businesses&record=${business}&recordError=1`);
  await expect(page.getByRole("alert")).toContainText("not found");
  await expect(page.getByRole("button", { name: "Retry record" })).toBeVisible();
});
test("search failure is not a zero-result message", async ({ page }) => {
  await search(page, "blocked");
  await expect(page.getByRole("alert")).toContainText("permission denied");
  await expect(page.getByText("No matching platform records.")).toHaveCount(0);
});
test("empty search is explicit", async ({ page }) => {
  await search(page, "missing");
  await expect(page.getByText("No matching platform records.")).toBeVisible();
});
test("search supports arrow-key focus and Enter navigation", async ({ page }) => {
  await search(page);
  await expect(
    page.getByRole("link", { name: "Example Company Business", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search platform records").focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("link", { name: "Example Company Business", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Customer 360 · Example Company" })).toBeVisible();
});
test("search is absent without metadata permissions", async ({ page }) => {
  await page.goto("/platform?readonly=1");
  await expect(page.getByRole("button", { name: "Search platform", exact: true })).toHaveCount(0);
});

test("closing search returns keyboard focus to its trigger", async ({ page }) => {
  await page.goto("/platform");
  await page.getByRole("button", { name: "Search platform", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Search platform", exact: true })).toBeFocused();
});
