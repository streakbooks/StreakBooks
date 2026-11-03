import { test, expect } from "@playwright/test";
const logo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nE8AAAAASUVORK5CYII=",
  "base64",
);
test("create, upload logo, customize, persist, default, edit, duplicate and delete", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("Theme name", { exact: true }).fill("Professional");
  await page
    .getByLabel("Theme logo", { exact: true })
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
  await expect(page.locator('[data-testid="document-sheet"] img')).toBeVisible();
  expect(
    await page
      .locator('[data-testid="document-sheet"] img')
      .evaluate((el: HTMLImageElement) => el.naturalWidth),
  ).toBeGreaterThan(0);
  await page.getByLabel("Theme Font family", { exact: true }).selectOption("serif");
  await page.locator("summary").filter({ hasText: "Colours and typography" }).click();
  await page.getByLabel("Theme Primary / accent colour", { exact: true }).fill("#345678");
  await expect(page.locator(".doc-sheet h1")).toHaveCSS("background-color", "rgb(52, 86, 120)");
  await page.getByLabel("Theme Paper size", { exact: true }).selectOption("Letter");
  await page.getByLabel("Theme Orientation", { exact: true }).selectOption("landscape");
  await page.getByLabel("Theme Page margins (mm)", { exact: true }).fill("18");
  await page.locator("summary").filter({ hasText: "Document fields" }).click();
  await page.getByLabel("Show Quantity", { exact: true }).uncheck();
  await expect(page.getByRole("columnheader", { name: "Qty", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Theme saved");
  await page.getByRole("combobox", { name: "Default theme for Invoice", exact: true }).click();
  await page.getByRole("option", { name: "Professional", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Professional Revision 1" }).click();
  await expect(page.getByLabel("Theme Font family", { exact: true })).toHaveValue("serif");
  await expect(page.getByLabel("Theme Paper size", { exact: true })).toHaveValue("Letter");
  await expect(page.locator('[data-testid="document-sheet"] img')).toBeVisible();
  await page.getByLabel("Theme name", { exact: true }).fill("Renamed professional");
  await page.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(page.getByRole("button", { name: "Renamed professional Revision 2" })).toBeVisible();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Renamed professional copy Revision 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete theme", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Renamed professional copy Revision 1" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("actual multi-page PDF uses saved Letter landscape layout and visibility", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Theme name", { exact: true }).fill("PDF layout");
  await page
    .getByLabel("Theme logo", { exact: true })
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
  await expect(page.locator('[data-testid="document-sheet"] img')).toBeVisible();
  await page.getByLabel("Theme Paper size", { exact: true }).selectOption("Letter");
  await page.getByLabel("Theme Orientation", { exact: true }).selectOption("landscape");
  await page.getByLabel("Theme Font family", { exact: true }).selectOption("mono");
  await page.getByLabel("Theme Table appearance", { exact: true }).selectOption("striped");
  await page.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.goto("/?print=1&long=1");
  await expect(page.locator(".doc-sheet")).toHaveCSS("font-family", '"Courier New", monospace');
  const overflow = await page
    .locator(".doc-sheet")
    .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(overflow).toBe(false);
  const pdf = await page.pdf({
    path: "work/theme-letter-landscape.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  const raw = pdf.toString("latin1");
  expect(raw.startsWith("%PDF-")).toBe(true);
  expect(raw).toMatch(/\/Subtype\s*\/Image/);
  expect(raw).toMatch(/\/MediaBox\s*\[0 0 792 612\]/);
  expect((raw.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThan(1);
  await page.screenshot({ path: "work/theme-multi-page-preview.png", fullPage: false });
});
test("print action opens the same sheet and view-only members cannot save", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.print = () => {
      throw new Error("Top-level print must not be used");
    };
  });
  await page.getByRole("button", { name: "Print / Save as PDF", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Print preview opened");
  await page.goto("/?readonly=1");
  await expect(page.getByRole("button", { name: "Save theme", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Default theme for Invoice", { exact: true })).toBeDisabled();
});

test("statement preview uses statement columns and shared branding", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("Theme preview document", { exact: true })
    .selectOption("customer_statement");
  await expect(
    page.getByRole("heading", { name: "Customer statement", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Balance", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Qty", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-testid="document-sheet"] a')).toHaveCount(0);
});

test("default A4 portrait PDF has the expected paper dimensions", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Theme name", { exact: true }).fill("A4 portrait");
  await page.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.goto("/?print=1");
  const pdf = await page.pdf({
    path: "work/theme-a4-portrait.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  const box = /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString("latin1"));
  expect(box).not.toBeNull();
  expect(Number(box![1])).toBeGreaterThan(594);
  expect(Number(box![1])).toBeLessThan(597);
  expect(Number(box![2])).toBeGreaterThan(841);
  expect(Number(box![2])).toBeLessThan(843);
});
