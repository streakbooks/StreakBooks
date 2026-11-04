import { expect, test } from "@playwright/test";

test("search, clear and CSV export use exactly the visible records", async ({ page }) => {
  await page.goto("/sales/invoices");
  await page.getByRole("searchbox", { name: "Search invoices" }).fill("Northfield");
  await expect(page.getByRole("cell", { name: "River & Co", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Northfield Media", exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain("Northfield Media");
  expect(csv).not.toContain("River & Co");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.getByRole("cell", { name: "River & Co", exact: true })).toBeVisible();
});

test("shared appearance and selection controls update the active list", async ({ page }) => {
  await page.goto("/sales/invoices");
  await page.getByRole("button", { name: "Choose table columns" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Customer", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Customer", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Choose row density" }).click();
  await page.getByRole("menuitemradio", { name: "Compact", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Spacing: compact" })).toBeVisible();
  await page.getByRole("button", { name: "Select records", exact: true }).click();
  await expect(page.getByRole("region", { name: "Bulk actions", exact: true })).toContainText(
    "2 selected",
  );
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("region", { name: "Bulk actions", exact: true })).toHaveCount(0);
});

test("module overflow preserves native URLs, active context and keyboard access", async ({
  page,
  context,
}) => {
  await page.goto("/sales/invoices");
  const nav = page.getByRole("navigation", { name: "Sales sections" });
  await expect(nav.getByRole("link", { name: "Invoices", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("button", { name: "More sales sections" }).click();
  const statements = page.getByRole("menuitem", { name: "Statements", exact: true });
  await expect(statements).toHaveAttribute("href", "/sales/statements");
  const tabReady = context.waitForEvent("page");
  await statements.click({ modifiers: ["Control"] });
  const tab = await tabReady;
  await expect(tab).toHaveURL(/sales\/statements/);
  await tab.close();
  await page.keyboard.press("Escape");
  await nav.getByRole("button", { name: "More sales sections" }).click();
  await page.getByRole("menuitem", { name: "Recurring", exact: true }).click();
  await expect(page).toHaveURL(/sales\/recurring/);
  await expect(nav.getByRole("button", { name: "More sales sections: Recurring" })).toBeVisible();
});

test("CSV preview handles quoted commas, escaped quotes and multiline cells", async ({ page }) => {
  await page.goto("/sales/invoices");
  const preview = page.getByRole("region", { name: "CSV preview" });
  await expect(preview).toContainText("2 data rows");
  await expect(preview.getByRole("cell", { name: "River, Co", exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: 'Quoted "note"', exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "Line 1 Line 2", exact: true })).toBeVisible();
});

test("errors recover and empty states never advertise a missing action", async ({ page }) => {
  await page.goto("/sales/invoices");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Records reloaded" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unavailable action" })).toHaveCount(0);
});

for (const width of [320, 768, 1440]) {
  test(`viewport ${width}: list and long modal remain contained and keyboard usable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/sales/invoices");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: "New invoice", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New invoice" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.height).toBeLessThanOrEqual(800);
    await dialog.getByLabel("Field 14", { exact: true }).fill("Still editable");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "New invoice", exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });
}

for (const mode of ["light", "dark"]) {
  for (const palette of [
    "classic",
    "sapphire",
    "rose",
    "amethyst",
    "emerald",
    "teal",
    "champagne",
    "graphite",
    "custom",
  ]) {
    test(`theme ${palette} ${mode}: content and controls render without viewport overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.addInitScript(
        ({ mode, palette }) => {
          localStorage.setItem("linkbooks-theme", mode);
          localStorage.setItem("linkbooks-theme-palette", palette);
          localStorage.setItem(
            "linkbooks-theme-custom",
            JSON.stringify({
              primary: "#777777",
              sidebar: "#777777",
              lightBackground: "#ffffff",
              darkBackground: "#101010",
            }),
          );
        },
        { mode, palette },
      );
      await page.goto("/sales/invoices");
      await expect(page.locator("html")).toHaveAttribute("data-linkbooks-palette", palette);
      expect(await page.locator("html").evaluate((el) => el.classList.contains("dark"))).toBe(
        mode === "dark",
      );
      await expect(page.getByRole("heading", { name: "Invoices", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
}

test("system appearance follows the browser and preserves palette across reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("linkbooks-theme", "system");
    localStorage.setItem("linkbooks-theme-palette", "emerald");
  });
  await page.goto("/sales/invoices");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-linkbooks-palette", "emerald");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("batch payment distinguishes a failed query from an empty ledger and supports retry", async ({
  page,
}) => {
  await page.goto("/?flow=batch&bills=error");
  await expect(page.getByRole("alert")).toContainText("Could not load bills to pay");
  await expect(page.getByText("Nothing to pay", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Northfield", exact: true })).toBeVisible();
});

test("batch payment keeps posting disabled when payment accounts cannot load", async ({ page }) => {
  await page.goto("/?flow=batch&accounts=error");
  await expect(page.getByRole("alert")).toContainText("Could not load payment accounts");
  await page.getByRole("checkbox", { name: "Pay BILL-100" }).check();
  await expect(page.getByRole("button", { name: "Pay selected", exact: true })).toBeDisabled();
});

test("genuinely empty batch has the explicit empty state", async ({ page }) => {
  await page.goto("/?flow=batch&bills=empty");
  await expect(page.getByText("Nothing to pay", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay selected", exact: true })).toBeDisabled();
});

test("unavailable portal checkout shows instructions without asking for a payment amount", async ({
  page,
}) => {
  await page.goto("/?flow=portal&checkout=instructions");
  await expect(page.getByText("Pay by bank transfer", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue to payment", exact: true })).toHaveCount(
    0,
  );
});

test("portal sandbox is explicit and invalid amounts cannot initiate payment", async ({ page }) => {
  await page.goto("/?flow=portal&checkout=sandbox");
  await expect(page.getByText("Sandbox payment", { exact: true })).toBeVisible();
  const button = page.getByRole("button", { name: "Review sandbox payment", exact: true });
  const amount = page.getByLabel("Amount", { exact: true });
  await amount.fill("13");
  await expect(button).toBeDisabled();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("exceeds");
  await amount.fill("12");
  await expect(button).toBeEnabled();
  await expect(page.getByText("No funds are collected.", { exact: false })).toBeVisible();
});

test("incomplete portal settlement never offers a configured provider checkout", async ({
  page,
}) => {
  await page.goto("/?flow=portal&checkout=stripe&settlement=missing");
  await expect(page.getByText("Pay by bank transfer", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveCount(0);
});

test("bill supplier drawer preserves unsaved input and remains contained on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?flow=bill");
  await page.getByRole("textbox", { name: "Unsaved bill note" }).fill("Unsaved work");
  await page.getByRole("button", { name: "Show supplier summary" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Northfield");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("textbox", { name: "Unsaved bill note" })).toHaveValue(
    "Unsaved work",
  );
});

test.describe("touch input", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
  test("primary actions retain a 44px touch target", async ({ page }) => {
    await page.goto("/sales/invoices");
    const button = page.getByRole("button", { name: "New invoice", exact: true });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
});

test("required-query recovery retries failures without reloading successful data", async ({
  page,
}) => {
  await page.goto("/?flow=query-error");
  await expect(page.getByRole("alert")).toContainText("Required data unavailable");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Failed retries: 2; successful retries: 0");
});

test("practice colleague selection searches authorized records and keeps the selected value", async ({
  page,
}) => {
  await page.goto("/?flow=staff");
  const choose = page.getByRole("combobox", { name: "Assign colleague", exact: true });
  await expect(choose).toBeVisible();
  await choose.click();
  await page.getByRole("searchbox").fill("Maya");
  await page.getByRole("searchbox").press("ArrowDown");
  await page.getByRole("searchbox").press("Enter");
  await expect(choose).toContainText("Maya River");
});

test("view-only practice workspace does not offer membership or assignment mutations", async ({
  page,
}) => {
  await page.goto("/?flow=staff&readonly=true");
  await expect(page.getByRole("button", { name: "Add colleague", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Assign colleague", exact: true })).toHaveCount(
    0,
  );
});
