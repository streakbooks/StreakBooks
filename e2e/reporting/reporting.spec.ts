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
