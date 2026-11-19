import { expect, test, type Page } from "@playwright/test";
import { FORM_DENSITY } from "../../src/lib/ui/form-density";

async function measure(page: Page, locator: string) {
  return page.locator(locator).first().evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
}

async function assertNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;

for (const viewport of viewports) {
  test(`density acceptance at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?flow=density");

    await expect(page.getByRole("heading", { name: "New bill density", exact: true })).toBeVisible();
    await expect(page.getByLabel("Default line count")).toHaveText("2");

    const supplier = await measure(page, '[data-slot="form-control-shell"][data-width="contact"]');
    const billDate = await measure(page, '[data-slot="form-control-shell"][data-width="date"]');
    const currency = await measure(page, '[data-slot="form-control-shell"][data-width="currency"]');
    const qty = await measure(page, '[data-slot="form-control-shell"][data-width="money"]');
    const supplierInput = await measure(page, 'input[aria-label="Supplier"]');
    const primaryBox = await page
      .getByRole("button", { name: "Save & authorise", exact: true })
      .evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
    const tableInput = await measure(page, 'table[aria-label="Line items"] input');

    if (viewport.width >= 1280) {
      expect(supplier.width).toBeGreaterThanOrEqual(FORM_DENSITY.contactWidthMin - 1);
      expect(supplier.width).toBeLessThanOrEqual(FORM_DENSITY.contactWidthMax + 1);
      expect(billDate.width).toBeLessThanOrEqual(FORM_DENSITY.dateWidthMax + 1);
      expect(currency.width).toBeLessThanOrEqual(160);
      expect(qty.width).toBeLessThanOrEqual(FORM_DENSITY.moneyWidthMax + 1);
    } else {
      expect(supplier.width).toBeLessThanOrEqual(viewport.width);
    }

    expect(supplierInput.height).toBeGreaterThanOrEqual(FORM_DENSITY.controlHeightMin - 1);
    expect(supplierInput.height).toBeLessThanOrEqual(FORM_DENSITY.controlHeightMax + 1);
    expect(primaryBox.height).toBeLessThanOrEqual(FORM_DENSITY.primaryButtonMax + 1);
    expect(tableInput.height).toBeGreaterThanOrEqual(FORM_DENSITY.tableControlHeightMin - 1);
    expect(tableInput.height).toBeLessThanOrEqual(FORM_DENSITY.tableControlHeightMax + 2);

    if (viewport.width >= 1280) {
      const fill = await page.locator('[data-slot="editable-line-item-grid"]').evaluate((grid) => {
        const scroll =
          grid.querySelector('[data-slot="table-scroll"]') ??
          grid.querySelector('[data-slot="line-grid-scroll"]') ??
          grid;
        const table = grid.querySelector("table");
        if (!table) return { gap: 999, scroll: 0, table: 0 };
        const scrollBox = scroll.getBoundingClientRect();
        const tableBox = table.getBoundingClientRect();
        return {
          gap: Math.abs(scrollBox.width - tableBox.width),
          scroll: scrollBox.width,
          table: tableBox.width,
        };
      });
      expect(fill.table).toBeGreaterThan(0);
      expect(fill.gap).toBeLessThanOrEqual(24);
    }

    await assertNoPageOverflow(page);
  });
}
