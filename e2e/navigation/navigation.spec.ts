import { expect, test } from "@playwright/test";

test("all reporting subsection destinations are native addressable tabs", async ({ page }) => {
  await page.goto("/reports?tab=home");
  const tabs = page.getByRole("tablist", { name: "Reporting modules" });
  await expect(tabs.getByRole("tab")).toHaveCount(11);
  for (const label of ["Reporting home", "Standard reports", "Custom reports", "Management reports",
    "Report packs", "Adviser", "Drafts & review", "Published", "Archived",
    "Scheduled delivery", "Templates"]) {
    const link = tabs.getByRole("tab", { name: label });
    await expect(link).toHaveAttribute("href", /\/reports\?[^ ]*tab=/);
  }
  await tabs.getByRole("tab", { name: "Published", exact: true }).click();
  await expect(page).toHaveURL(/tab=published/);
  await expect(tabs.getByRole("tab", { name: "Published", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(tabs.getByRole("tab", { name: "Published", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("Ctrl-click and middle-click open independently without navigating the source", async ({ page, context }) => {
  await page.goto("/accounting?tab=coa");
  const journal = page.getByRole("tab", { name: "Journals" });
  await expect(journal).toHaveAttribute("href", /tab=journals/);
  const origin = page.url();
  const popupReady = context.waitForEvent("page");
  await journal.click({ modifiers: ["Control"] });
  const popup = await popupReady;
  await expect(popup).toHaveURL(/tab=journals/);
  await expect(popup.getByTestId("active-accounting-tab")).toHaveText("journals");
  expect(page.url()).toBe(origin);
  await popup.close();

  const middleClickPopup = context.waitForEvent("page");
  await journal.click({ button: "middle" });
  const middle = await middleClickPopup;
  await expect(middle).toHaveURL(/tab=journals/);
  expect(page.url()).toBe(origin);
  await middle.close();
});

test("browser contextmenu remains native and copying a URL never requires a custom widget", async ({ page }) => {
  await page.goto("/files");
  const folder = page.getByRole("link", { name: "Folder A" });
  await expect(folder).toHaveAttribute("href", /folder=folder-a/);
  const notCancelled = await folder.evaluate((element) => element.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
  ));
  expect(notCancelled).toBe(true);
  await folder.click();
  await expect(page.getByTestId("active-folder")).toHaveText("folder-a");
  await page.reload();
  await expect(page.getByTestId("active-folder")).toHaveText("folder-a");
  await page.goBack();
  await expect(page.getByTestId("active-folder")).toHaveText("root");
});

test("report pack deep links preserve identity and exclude invalid record references", async ({ page, context }) => {
  await page.goto("/reports?tab=packs");
  const pack = page.getByRole("link", { name: "Open report pack" });
  const newTab = context.waitForEvent("page");
  await pack.click({ modifiers: ["Control"] });
  const opened = await newTab;
  await expect(opened.getByTestId("active-report-pack")).toHaveText("deafcafe-1111-4111-8111-aabc12345678");
  await opened.reload();
  await expect(opened.getByTestId("active-report-pack")).toHaveText("deafcafe-1111-4111-8111-aabc12345678");
  await opened.close();
  await page.goto("/reports?tab=packs&pack=not-valid");
  await expect(page.getByTestId("active-report-pack")).toHaveText("none");
});

test("keyboard arrow, Home and End keys navigate hyperlink tabs", async ({ page }) => {
  await page.goto("/accounting?tab=coa");
  const tabs = page.getByRole("tablist", { name: "Accounting tabs" });
  const first = tabs.getByRole("tab", { name: "Chart of accounts" });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("active-accounting-tab")).toHaveText("journals");
  await page.keyboard.press("End");
  await expect(page.getByTestId("active-accounting-tab")).toHaveText("fx");
  await page.keyboard.press("Home");
  await expect(page.getByTestId("active-accounting-tab")).toHaveText("coa");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("active-accounting-tab")).toHaveText("fx");
});
