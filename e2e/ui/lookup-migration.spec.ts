import { test, expect } from "@playwright/test";

test("migrated record picker searches labels, keeps IDs and disabled options, and clears to all", async ({
  page,
}) => {
  await page.goto("/?flow=lookup-migration");
  const control = page.getByRole("combobox", { name: "Organisation member", exact: true });
  await control.click();
  await page.getByRole("searchbox").fill("Alex");
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.getByRole("option", { name: "Alex · South" }).click();
  await expect(page.getByLabel("Selected member ID")).toHaveText("member-b");
  await expect(control).toContainText("Alex · South");
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(page.getByLabel("Selected member ID")).toHaveText("all");
  await expect(control).toContainText("All members");
  await control.click();
  await page.getByRole("searchbox").fill("Archived");
  await expect(page.getByRole("option", { name: "Archived member" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByLabel("Selected member ID")).toHaveText("all");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Denied selector" })).toBeDisabled();
});

test("migrated action picker resets and can apply the same template twice", async ({ page }) => {
  await page.goto("/?flow=lookup-migration");
  const control = page.getByRole("combobox", { name: "Apply template", exact: true });
  for (const count of [1, 2]) {
    await control.click();
    await page.getByRole("option", { name: "Standard template", exact: true }).click();
    await expect(page.getByLabel("Template applications")).toHaveText(String(count));
    await expect(control).toContainText("Choose a template");
    await expect(page.getByRole("listbox")).toHaveCount(0);
  }
});

for (const width of [375, 768, 1280]) {
  test(`migrated picker preserves trigger layout, descriptions and keyboard selection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/?flow=lookup-migration");
    const control = page.getByRole("combobox", { name: "Member status", exact: true });
    await expect(control).toHaveClass(/w-48/);
    await expect(control).toHaveAccessibleDescription(
      "Status changes the view without altering records.",
    );
    await control.focus();
    await page.keyboard.press("Enter");
    const search = page.getByRole("searchbox");
    await search.fill("archived");
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(page.getByLabel("Selected status")).toHaveText("archived");
    await expect(control).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
}
