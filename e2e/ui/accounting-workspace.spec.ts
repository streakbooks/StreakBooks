import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const viewports = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1280, 720],
  [768, 1024],
  [390, 844],
] as const;

for (const [width, height] of viewports) {
  test(`Accounting keeps tabs and the chart usable at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/accounting");
    const tabs = page.getByRole("tablist", { name: "Accounting views" });
    const chart = page.getByRole("region", { name: "Chart of accounts" });
    await expect(chart).toBeVisible();
    const tabRows = await tabs
      .getByRole("tab")
      .evaluateAll((links) => new Set(links.map((link) => link.getBoundingClientRect().top)).size);
    expect(tabRows).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await expect(page.getByRole("link", { name: "New manual journal" })).toHaveAttribute(
      "href",
      "/accounting/journals/new?mode=post",
    );
    if (width < 840) {
      expect(await chart.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    }
  });
}

test("Accounting tabs retain native URLs and support keyboard navigation and Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/accounting");
  const tabs = page.getByRole("tablist", { name: "Accounting views" });
  const chart = tabs.getByRole("tab", { name: "Chart of accounts" });
  const journals = tabs.getByRole("tab", { name: "Journals", exact: true });
  await chart.focus();
  await chart.press("ArrowRight");
  await expect(journals).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Journals" })).toBeVisible();
  await expect(page).toHaveURL(/tab=journals/);
  await page.goBack();
  await expect(chart).toHaveAttribute("aria-selected", "true");
  await page.goto("/accounting?tab=industry");
  const industry = tabs.getByRole("tab", { name: "Industry library" });
  await expect(industry).toHaveAttribute("aria-selected", "true");
  await expect(industry).toBeInViewport();
  expect(await tabs.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await page.reload();
  await expect(industry).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Accounting tools" }).click();
  await expect(page.getByRole("menuitem", { name: "Recurring journals" })).toHaveAttribute(
    "href",
    "/recurring-journals",
  );
});

test("the chart filters, expands subaccounts and exports the displayed rows", async ({ page }) => {
  await page.goto("/accounting");
  const parent = page.getByRole("button", { name: "1000 Cash subaccounts" });
  const operating = page.getByText("Operating bank", { exact: true });
  await expect(operating).toBeVisible();
  await parent.click();
  await expect(parent).toHaveAttribute("aria-expanded", "false");
  await expect(operating).toHaveCount(0);
  await parent.press("Enter");
  await expect(operating).toBeVisible();

  await expect(page.getByRole("combobox", { name: "Balance", exact: true })).toBeHidden();
  await page.getByText("Advanced chart options").click();
  await expect(page.getByRole("combobox", { name: "Balance", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide year to date" }).click();
  await expect(page.getByRole("button", { name: /Transactions:.*Sort column/ })).toBeVisible();

  await page.getByRole("textbox", { name: "Search", exact: true }).fill("Operating");
  await expect(page.getByRole("status")).toContainText("Showing 1 of 3 accounts");
  await page.getByRole("button", { name: "Chart actions" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export displayed CSV" }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString();
  expect(csv).toContain("Operating bank");
  expect(csv).not.toContain("Petty cash");
});

test("chart search is shareable and survives refresh and Back", async ({ page }) => {
  await page.goto("/accounting?chartQ=Operating&chartClass=asset");
  const search = page.getByRole("textbox", { name: "Search", exact: true });
  await expect(search).toHaveValue("Operating");
  await expect(page.getByRole("combobox", { name: "Class" })).toHaveText("asset");
  await search.fill("1000");
  await expect(page.getByRole("status")).toContainText("Showing 1 of 3 accounts");
  await page.getByRole("tab", { name: "Journals", exact: true }).click();
  await page.getByRole("tab", { name: "Chart of accounts" }).click();
  await expect(search).toHaveValue("1000");
  await page.reload();
  await expect(search).toHaveValue("1000");
  await page.getByRole("tab", { name: "Financial years" }).click();
  await page.goBack();
  await expect(search).toHaveValue("1000");
});

test("read-only users can browse and export the chart without managing accounts", async ({
  page,
}) => {
  await page.goto("/accounting?readonly=true");
  await expect(page.getByRole("region", { name: "Chart of accounts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New account" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Actions for Cash" })).toHaveCount(0);
  await page.getByRole("button", { name: "Chart actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Export all CSV" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Import CSV" })).toHaveCount(0);
});

test("the chart exposes sortable columns and passes automated accessibility checks", async ({
  page,
}) => {
  await page.goto("/accounting");
  const chart = page.getByRole("table", { name: "Ledger accounts" });
  await expect(chart.getByRole("columnheader", { name: /Code/ })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await chart.getByRole("button", { name: /Name:.*Sort column/ }).click();
  await expect(chart.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  const { violations } = await new AxeBuilder({ page })
    .include('[data-slot="list-workspace"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
  ).toEqual([]);
});
