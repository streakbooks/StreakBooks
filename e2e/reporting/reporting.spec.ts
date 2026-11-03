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
  // A prior column with no revenue must expose an unavailable ratio, never fabricate zero.
  await expect(page.getByRole("article")).toContainText("Unavailable");
  await expect(page.getByRole("alert")).toHaveCount(0);
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
test("calculated columns validate references and preserve saved financial output", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await page.getByLabel("Column 2 period", { exact: true }).selectOption("calculated");
  await page.getByLabel("Column 2 label", { exact: true }).fill("Double actual");
  await page.getByLabel("Column 2 formula", { exact: true }).fill("[current] * 2");
  await page.getByLabel("Column 2 format", { exact: true }).selectOption("money");
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("220.00");
  await page.getByRole("button", { name: "Persist fixture configuration", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Column 2 formula", { exact: true })).toHaveValue("[current] * 2");
  await page.getByLabel("Column 2 formula", { exact: true }).fill("[missing]");
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unknown column missing");
});
test("display controls persist scaling and currency styling without changing the calculated net", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Net profit\s*\[net\]/ }).click();
  await page.getByLabel("Formula", { exact: true }).fill("[revenue] - [expenses] * 10");
  await page.getByLabel("Display scale", { exact: true }).selectOption("100");
  await page.getByLabel("Currency symbols", { exact: true }).check();
  await page.getByLabel("Negative values in red", { exact: true }).check();
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  await expect(page.getByRole("cell", { name: "(£2.50)", exact: true })).toHaveClass(
    /text-destructive/,
  );
  await expect(page.getByRole("article")).toContainText("figures divided by 100");
  await page.getByRole("button", { name: "Persist fixture configuration", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Display scale", { exact: true })).toHaveValue("100");
  await expect(page.getByLabel("Currency symbols", { exact: true })).toBeChecked();
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

test("recent report links retain account filters and custom-report periods with truthful empty states", async ({
  page,
}) => {
  await page.goto("/");
  const activity = page.getByRole("region", { name: "Report activity fixture" });
  await expect(activity).toContainText("3 opens");
  const gl = activity.getByRole("link", { name: /Account Transactions/ }).first();
  await expect(gl).toHaveAttribute("href", /account=11111111-1111-4111-8111-111111111111/);
  await expect(gl).toHaveAttribute("href", /from=2026-10-01/);
  await expect(activity.getByRole("link", { name: /Board contribution/ })).toHaveAttribute(
    "href",
    /from=2026-09-01/,
  );
  await page.getByRole("button", { name: "Clear fixture report activity", exact: true }).click();
  await expect(
    activity.getByText(
      "Open a financial or saved custom report to build your own activity history.",
    ),
  ).toHaveCount(2);
});

test("posted-line filter controls preserve explicit conditions without fabricating fixture balances", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add condition", exact: true }).click();
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Choose the required filter values");
  await page.getByRole("combobox", { name: "Condition 1 field", exact: true }).click();
  await page.getByRole("option", { name: "Account type", exact: true }).click();
  await page.getByRole("combobox", { name: "Condition 1 value", exact: true }).click();
  await page.getByRole("option", { name: "income", exact: true }).click();
  await page.getByRole("button", { name: "Persist fixture configuration", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Condition 1 value", exact: true }),
  ).toContainText("income");
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("verified by the live database suite");
  await expect(page.getByRole("article", { name: "Financial report preview" })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove condition 1", exact: true }).click();
  await page.getByRole("button", { name: "Recalculate report preview", exact: true }).click();
  await expect(page.getByRole("article", { name: "Financial report preview" })).toContainText(
    "110.00",
  );
});

test("standard report More options links reach reporting tools with the selected dates and survive reload/back", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Create custom report", exact: true }),
  ).toHaveAttribute("href", "/reports/builder/new?from=2026-04-01&to=2026-11-02");
  for (const [name, tab] of [
    ["Saved custom reports", "custom"],
    ["Management dashboards & forecasts", "management"],
    ["Management report packs", "packs"],
    ["Report templates", "templates"],
    ["Schedules & delivery history", "schedules"],
  ]) {
    await expect(page.getByRole("menuitem", { name, exact: true })).toHaveAttribute(
      "href",
      `/reports?tab=${tab}&from=2026-04-01&to=2026-11-02`,
    );
  }
  await page.getByRole("menuitem", { name: "Saved custom reports", exact: true }).click();
  await expect(page).toHaveURL(/\/reports\?tab=custom&from=2026-04-01&to=2026-11-02$/);
  await page.reload();
  await expect(page).toHaveURL(/tab=custom/);
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Management report packs", exact: true }).click();
  await expect(page).toHaveURL(/tab=packs/);
  await page.goBack();
  await expect(page).toHaveURL(/tab=custom/);
});

test("More options is keyboard accessible and fits a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "More options", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "Create custom report", exact: true }),
  ).toBeFocused();
  const menu = page.getByRole("menu");
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("standard statements apply real comparison and presentation options and preserve saved settings", async ({
  page,
}) => {
  await page.goto("/");
  const region = page.getByRole("region", { name: "Standard statement fixture", exact: true });
  await region.getByRole("button", { name: "Customize report", exact: true }).click();
  await page.getByRole("combobox", { name: "Compare selected period with", exact: true }).click();
  await page.getByRole("option", { name: "Previous year", exact: true }).click();
  await page.getByLabel("Show change in amount", { exact: true }).check();
  await page.getByLabel("Show percentage change", { exact: true }).check();
  await page.getByLabel("Show percentage columns", { exact: true }).check();
  await page.getByRole("tab", { name: "Rows & numbers", exact: true }).click();
  await page.getByLabel("Show account codes", { exact: true }).uncheck();
  await page.getByLabel("Compact rows", { exact: true }).check();
  await page.getByRole("combobox", { name: "Decimal places", exact: true }).click();
  await page.getByRole("option", { name: "Whole numbers", exact: true }).click();
  await page.getByRole("tab", { name: "Header & notes", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Report notes", { exact: true })
    .fill("Reviewed management statement");
  await page.getByRole("button", { name: "Apply report settings", exact: true }).click();
  await region.getByRole("button", { name: "Run standard statement fixture", exact: true }).click();
  await expect(region.getByRole("article")).toContainText("Change in amount");
  await expect(region.getByRole("article")).toContainText("73.33%");
  await expect(region.getByRole("article")).toContainText("Unavailable");
  await expect(region.getByRole("article")).toContainText("Reviewed management statement");
  await expect(region.getByRole("article")).not.toContainText("4000 Fixture revenue");
  await region
    .getByRole("button", { name: "Persist standard statement settings", exact: true })
    .click();
  await page.reload();
  await region.getByRole("button", { name: "Customize report", exact: true }).click();
  await expect(page.getByLabel("Show percentage change", { exact: true })).toBeChecked();
  await page.getByRole("tab", { name: "Rows & numbers", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Decimal places", exact: true })).toContainText(
    "Whole numbers",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("standard customization validates comparison dates and filters before applying", async ({
  page,
}) => {
  await page.goto("/");
  const region = page.getByRole("region", { name: "Standard statement fixture", exact: true });
  await region.getByRole("button", { name: "Customize report", exact: true }).click();
  await page.getByRole("combobox", { name: "Compare selected period with", exact: true }).click();
  await page.getByRole("option", { name: "Custom comparison period", exact: true }).click();
  await expect(page.getByLabel("Comparison from", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply report settings", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("valid custom comparison");
  await page.getByLabel("Comparison from", { exact: true }).fill("2025-01-01");
  await page.getByLabel("Comparison to", { exact: true }).fill("2025-12-31");
  await page.getByRole("tab", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Add condition", exact: true }).click();
  await page.getByRole("button", { name: "Apply report settings", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("required filter values");
  await page.getByRole("button", { name: "Remove condition 1", exact: true }).click();
  await page.getByRole("button", { name: "Apply report settings", exact: true }).click();
  await region.getByRole("button", { name: "Run standard statement fixture", exact: true }).click();
  await expect(region.getByRole("article")).toContainText("Custom comparison");
});

test("standard report comparison and filter shortcuts open the relevant controls", async ({
  page,
}) => {
  await page.goto("/");
  const region = page.getByRole("region", { name: "Standard statement fixture", exact: true });
  await region.getByRole("combobox", { name: "Compare statement with", exact: true }).click();
  await page.getByRole("option", { name: "Previous year", exact: true }).click();
  await region.getByRole("button", { name: "Run standard statement fixture", exact: true }).click();
  await expect(region.getByRole("article")).toContainText("Previous year");
  await region.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Filters", exact: true })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.getByRole("button", { name: "Add condition", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await region.getByRole("combobox", { name: "Compare statement with", exact: true }).click();
  await page.getByRole("option", { name: "Custom comparison period", exact: true }).click();
  await expect(page.getByLabel("Comparison from", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("standard filters accept and retain a single-day inclusive range", async ({ page }) => {
  await page.goto("/");
  const region = page.getByRole("region", { name: "Standard statement fixture", exact: true });
  await region.getByRole("button", { name: "Customize report", exact: true }).click();
  await page.getByRole("tab", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Add condition", exact: true }).click();
  await page.getByRole("combobox", { name: "Condition 1 field", exact: true }).click();
  await page.getByRole("option", { name: "Journal date", exact: true }).click();
  await page.getByRole("combobox", { name: "Condition 1 operator", exact: true }).click();
  await page.getByRole("option", { name: "Between", exact: true }).click();
  await page.getByLabel("Condition 1 value 1", { exact: true }).fill("2026-01-15");
  await page.getByLabel("Condition 1 value 2", { exact: true }).fill("2026-01-15");
  await page.getByRole("button", { name: "Apply report settings", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await region
    .getByRole("button", { name: "Persist standard statement settings", exact: true })
    .click();
  await page.reload();
  await region.getByRole("button", { name: "Customize report", exact: true }).click();
  await page.getByRole("tab", { name: "Filters", exact: true }).click();
  await expect(page.getByLabel("Condition 1 value 1", { exact: true })).toHaveValue("2026-01-15");
  await expect(page.getByLabel("Condition 1 value 2", { exact: true })).toHaveValue("2026-01-15");
});

test("catalogue search and category survive reload with retained report dates", async ({
  page,
}) => {
  await page.goto("/reports?tab=standard&from=2026-04-01&to=2026-10-31");
  const catalogue = page.getByRole("region", { name: "Report catalogue", exact: true });
  await catalogue.getByLabel("Search reports", { exact: true }).fill("aged");
  await catalogue.getByLabel("Category", { exact: true }).selectOption("sales");
  await expect(catalogue.getByRole("status")).toHaveText("1 report found");
  await expect(page).toHaveURL(/query=aged/);
  await page.reload();
  await expect(catalogue.getByLabel("Search reports", { exact: true })).toHaveValue("aged");
  await expect(catalogue.getByLabel("Category", { exact: true })).toHaveValue("sales");
  const report = catalogue.getByRole("link", { name: /Aged Receivables/ }).last();
  const href = await report.getAttribute("href");
  expect(href).toContain("from=2026-04-01");
  expect(href).toContain("to=2026-10-31");
});

test("catalogue keeps the chosen category visible and recovers from no matches", async ({
  page,
}) => {
  await page.goto(
    "/reports?query=aged&category=financial_statements&from=2026-04-01&to=2026-10-31",
  );
  const catalogue = page.getByRole("region", { name: "Report catalogue", exact: true });
  await expect(catalogue.getByLabel("Category", { exact: true })).toHaveValue(
    "financial_statements",
  );
  await expect(catalogue.getByRole("status")).toHaveText("0 reports found");
  await expect(catalogue.getByText("No matching reports", { exact: true })).toBeVisible();
  await catalogue.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(catalogue.getByLabel("Search reports", { exact: true })).toHaveValue("");
  await expect(catalogue.getByLabel("Category", { exact: true })).toHaveValue("all");
  await expect(page).not.toHaveURL(/query=|category=/);
  await expect(page).toHaveURL(/from=2026-04-01/);
  await expect(page).toHaveURL(/to=2026-10-31/);
  await expect(catalogue.getByText("No matching reports", { exact: true })).toHaveCount(0);
});

test("catalogue filters are keyboard accessible and fit mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reports?query=aged");
  const catalogue = page.getByRole("region", { name: "Report catalogue", exact: true });
  await catalogue.getByLabel("Category", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(catalogue.getByRole("button", { name: "Clear filters", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(catalogue.getByLabel("Search reports", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("catalogue matches separate search words without requiring the exact report title", async ({
  page,
}) => {
  await page.goto("/reports?query=profit%20loss&category=financial_statements");
  const catalogue = page.getByRole("region", { name: "Report catalogue", exact: true });
  await expect(catalogue.getByRole("status")).toHaveText("1 report found");
  await expect(catalogue.getByRole("link", { name: /Profit and Loss/ }).last()).toBeVisible();
});

test("forecast comparison exposes completed-month expense and profit variances without fabricating future actuals", async ({
  page,
}) => {
  await page.goto("/");
  const comparison = page.getByRole("region", { name: "Forecast versus actual", exact: true });
  const row = comparison.getByRole("row").filter({ hasText: "2026-11-01" });
  const cells = row.getByRole("cell");
  await expect(cells.nth(5)).toHaveText("70.00");
  await expect(cells.nth(8)).toHaveText("-10.00");
  await expect(cells.nth(9)).toHaveText("-16.67%");
  await expect(cells.nth(10)).toHaveText("30.00");
  await expect(cells.nth(11)).toHaveText("75.00%");
  const future = comparison.getByRole("row").filter({ hasText: "2026-12-01" });
  await expect(future).toContainText("No completed-month actual");
  await expect(future).toContainText("Unavailable");
  await page.setViewportSize({ width: 390, height: 844 });
  await comparison
    .getByRole("region", { name: "Forecast comparison results", exact: true })
    .focus();
  await expect(
    comparison.getByRole("region", { name: "Forecast comparison results", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("cash basis selector changes actual recognition, persists and drills to cash dates", async ({
  page,
}) => {
  await page.goto("/cash-fixture");
  const fixture = page.getByRole("region", { name: "Cash basis fixture", exact: true });
  await expect(fixture.getByRole("row").filter({ hasText: "Net profit" })).toContainText("0.00");
  await fixture.getByLabel("Accounting method", { exact: true }).selectOption("cash");
  await expect(fixture.getByRole("row").filter({ hasText: "Net profit" })).toContainText("10.00");
  await expect(fixture.getByRole("article")).toContainText("Cash basis");
  await expect(fixture.getByRole("article").getByRole("link")).toHaveCount(0);
  await fixture
    .getByRole("button", { name: /cash transactions/ })
    .first()
    .click();
  await expect(fixture.getByRole("status")).toContainText("2026-11-01 to 2026-11-30");
  await page.reload();
  await expect(fixture.getByLabel("Accounting method", { exact: true })).toHaveValue("cash");
  await expect(fixture.getByRole("row").filter({ hasText: "Net profit" })).toContainText("10.00");
  await fixture.getByLabel("Accounting method", { exact: true }).selectOption("accrual");
  await expect(fixture.getByRole("row").filter({ hasText: "Net profit" })).toContainText("0.00");
});
