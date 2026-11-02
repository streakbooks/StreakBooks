import { expect, test } from "@playwright/test";
test("custom designer uses account facts, validates formulas, reorders columns and persists configuration", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  await expect(page.getByRole("article", { name: "Financial report preview" })).toContainText(
    "110.00",
  );
  await page.getByRole("button", { name: /Net profit\s*\[net\]/ }).click();
  await page.getByLabel("Formula", { exact: true }).fill("[revenue] - [expenses] * 2");
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("70.00");
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await page.getByLabel("Column 2 label", { exact: true }).fill("Last period");
  await page.getByRole("button", { name: "Move column 2 left", exact: true }).click();
  await expect(page.getByLabel("Column 1 label", { exact: true })).toHaveValue("Last period");
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  // A prior column with no revenue must not fabricate a margin; remove that ratio for this dataset.
  await expect(page.getByRole("alert")).toContainText("Division by zero");
  await page.getByRole("button", { name: "Remove Net margin", exact: true }).click();
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  await page.getByRole("button", { name: "Persist fixture configuration", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Column 1 label", { exact: true })).toHaveValue("Last period");
  await page.getByRole("button", { name: /Net profit\s*\[net\]/ }).click();
  await expect(page.getByLabel("Formula", { exact: true })).toHaveValue(
    "[revenue] - [expenses] * 2",
  );
  await page.getByLabel("Formula", { exact: true }).fill("globalThis.alert(1)");
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Expected a number");
  expect(errors).toEqual([]);
});
test("large lookup pages, searches, uses keyboard selection and preserves parent state through creation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("combobox", { name: "Large account lookup", exact: true }).click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(51); // 50 results plus real create action
  await page.getByRole("button", { name: /Load more/ }).click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(101);
  await page.getByRole("searchbox").fill("09999");
  await expect(page.getByRole("option", { name: /09999/ })).toBeVisible();
  await page.getByRole("searchbox").press("ArrowDown");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Selected lookup id" })).toContainText(
    "account-9999",
  );
  await page.getByRole("combobox", { name: "Large account lookup", exact: true }).click();
  await page.getByRole("searchbox").fill("New fixture account");
  await page.getByRole("option", { name: /Create new/ }).click();
  await expect(page.getByLabel("New lookup record name", { exact: true })).toHaveValue(
    "New fixture account",
  );
  await page.getByRole("button", { name: "Cancel record creation", exact: true }).click();
  await expect(page.getByLabel("Unsaved parent note", { exact: true })).toHaveValue(
    "Keep this unsaved note",
  );
  await page.getByRole("combobox", { name: "Large account lookup", exact: true }).click();
  await page.getByRole("option", { name: /Create new/ }).click();
  await page.getByLabel("New lookup record name", { exact: true }).fill("Created fixture account");
  await page.getByRole("button", { name: "Save new lookup record", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Large account lookup", exact: true }),
  ).toContainText("Created fixture account");
  expect(errors).toEqual([]);
});
test("migrated option declarations preserve selected values, disabled records and keyboard behavior", async ({
  page,
}) => {
  await page.goto("/");
  const lookup = page.getByRole("combobox", { name: "Migrated declaration", exact: true });
  await expect(lookup).toContainText("Beta record");
  await lookup.click();
  await expect(
    page.getByRole("option", { name: "Restricted record", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("searchbox").fill("Alpha");
  await page.getByRole("searchbox").press("ArrowDown");
  await page.getByRole("searchbox").press("Enter");
  await expect(lookup).toContainText("Alpha record");
  await lookup.click();
  await page.getByRole("searchbox").press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});
for (const width of [390, 768, 1440])
  test(`designer and lookups fit viewport ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const horizontal = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(horizontal).toBe(false);
  });
