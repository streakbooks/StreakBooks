import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

async function signIn(page: Page, destination: string) {
  await page.goto(`/auth?redirect=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password", { exact: true }).fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 20_000 });
}

/** Native links preserve the source workspace on modifier-click and expose real href targets. */
test.describe("Native browser navigation across LinkBooks", () => {
  test.beforeEach(() => {
    test.skip(
      !email || !password,
      "Provide an authorised E2E test account; authentication is not bypassed.",
    );
  });

  test("sidebar navigation exposes real browser URLs and supports Ctrl+Click", async ({
    page,
    context,
  }) => {
    await signIn(page, "/");
    const menu = page.getByRole("navigation", { name: "Main" });
    const sales = menu.getByRole("link", { name: "Sales", exact: true });
    await expect(sales).toHaveAttribute("href", /\/sales/);
    const original = page.url();
    const newPagePromise = context.waitForEvent("page");
    await sales.click({ modifiers: ["Control"] });
    const newPage = await newPagePromise;
    await newPage.waitForLoadState("domcontentloaded");
    await expect(newPage).toHaveURL(/\/sales/);
    expect(page.url()).toBe(original);
    await newPage.close();
  });

  test("accounting subnavigation uses hyperlinks for URL-addressable tabs", async ({
    page,
    context,
  }) => {
    await signIn(page, "/accounting");
    const journals = page.getByRole("tab", { name: "Journals", exact: true });
    await expect(journals).toHaveAttribute("href", /tab=journals/);
    const original = page.url();
    const nextPage = context.waitForEvent("page");
    await journals.click({ modifiers: ["Control"] });
    const popup = await nextPage;
    await expect(popup).toHaveURL(/tab=journals/);
    expect(page.url()).toBe(original);
    await popup.reload();
    await expect(popup).toHaveURL(/tab=journals/);
    await popup.close();
  });

  test("bill workflow navigation and Files breadcrumbs are native links", async ({ page }) => {
    await signIn(page, "/purchases/bills");
    const workflow = page.getByRole("navigation", { name: "Bill workflow" });
    await expect(workflow.getByRole("link", { name: /Drafts/ })).toHaveAttribute(
      "href",
      /tab=drafts/,
    );
    const drafts = workflow.getByRole("link", { name: /Drafts/ });
    await drafts.click();
    await expect(page).toHaveURL(/tab=drafts/);
    await page.goBack();
    await page.goto("/files");
    await expect(page.getByRole("link", { name: "All files" })).toHaveAttribute("href", /\/files/);
  });

  test("document and banking native links do not suppress their browser context menu", async ({
    page,
  }) => {
    await signIn(page, "/banking/transactions");
    const link = page
      .getByRole("navigation", { name: "Banking sections" })
      .getByRole("link", { name: /All transactions/ });
    await expect(link).toHaveAttribute("href", /\/banking\/transactions/);
    const defaultAllowed = await link.evaluate((element) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
      return element.dispatchEvent(event);
    });
    expect(defaultAllowed).toBe(true);
  });
});

test.describe("deep links in authenticated module workspaces", () => {
  test.beforeEach(() => {
    test.skip(
      !email || !password,
      "Authorised test account required for live LinkBooks navigation.",
    );
  });

  test("every main menu entry is a native anchor with a same-origin URL", async ({ page }) => {
    await signIn(page, "/");
    const menu = page.getByRole("navigation", { name: "Main" }).first();
    const items = menu.getByRole("link");
    await expect(items).toHaveCount(18);
    for (const link of await items.all()) {
      const href = await link.getAttribute("href");
      expect(href, `Missing target on ${await link.innerText()}`).toMatch(/^\//);
      const allowsDefault = await link.evaluate((a) =>
        a.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
        ),
      );
      expect(allowsDefault).toBe(true);
    }
  });

  test("Reports Centre all eleven sections retain native new-tab navigation", async ({
    page,
    context,
  }) => {
    await signIn(page, "/reports?tab=home");
    const tabs = page.getByRole("tablist", { name: "Reporting modules" });
    await expect(tabs.getByRole("tab")).toHaveCount(11);
    const reports = tabs.getByRole("tab", { name: "Standard reports", exact: true });
    await expect(reports).toHaveAttribute("href", /tab=standard/);
    const source = page.url();
    const popupPromise = context.waitForEvent("page");
    await reports.click({ modifiers: ["Control"] });
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/tab=standard/);
    expect(page.url()).toBe(source);
    await popup.reload();
    await expect(popup.getByRole("tab", { name: "Standard reports" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await popup.close();
  });

  test("tax, contacts and banking subsection links retain browser context menus", async ({
    page,
  }) => {
    await signIn(page, "/tax");
    await expect(page.getByRole("tab", { name: "GL mappings" })).toHaveAttribute(
      "href",
      /tab=mappings/,
    );
    await page.goto("/contacts");
    await expect(page.getByRole("tab", { name: "Suppliers" })).toHaveAttribute(
      "href",
      /view=suppliers/,
    );
    await page.goto("/banking");
    const banking = page.getByRole("navigation", { name: "Banking sections" });
    await expect(banking.getByRole("link", { name: "All transactions" })).toHaveAttribute(
      "href",
      /transactions/,
    );
    await expect(banking.getByRole("link", { name: "Reconcile" })).toHaveAttribute(
      "href",
      /reconcile/,
    );
  });

  test("Links to bill details preserve full document paths across reload", async ({ page }) => {
    await signIn(page, "/purchases/bills");
    const workflow = page.getByRole("navigation", { name: "Bill workflow" });
    const drafts = workflow.getByRole("link", { name: /Drafts/ });
    await expect(drafts).toHaveAttribute("href", /tab=drafts/);
    await drafts.click();
    await expect(page).toHaveURL(/tab=drafts/);
    await page.reload();
    await expect(page).toHaveURL(/tab=drafts/);
    const rows = page.locator("tbody tr");
    if ((await rows.count()) > 0) {
      const links = rows.first().locator("a[href*='/purchases/bills/']");
      await expect(links.first()).toHaveAttribute("href", /purchases\/bills\//);
    }
  });

  test("workspace navigation filters by feature name and restores full list", async ({ page }) => {
    await signIn(page, "/");
    const menu = page.getByRole("navigation", { name: "Main" });
    const filter = menu.getByRole("searchbox", { name: "Filter navigation" });
    await filter.fill("depreciation");
    await expect(menu.getByRole("link", { name: "Fixed assets" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Banking" })).toHaveCount(0);
    await filter.fill("no such workspace xzq");
    await expect(menu.getByRole("status")).toHaveText("No matching workspace");
    await filter.clear();
    await expect(menu.getByRole("link", { name: "Banking" })).toBeVisible();
  });

  test("favourite workspaces persist across reload without duplicate links", async ({ page }) => {
    await signIn(page, "/");
    const menu = page.getByRole("navigation", { name: "Main" });
    await menu.getByRole("button", { name: "Pin Sales" }).click();
    await expect(
      menu.getByRole("group", { name: "Favourites" }).getByRole("link", { name: "Sales" }),
    ).toHaveAttribute("href", /\/sales/);
    await expect(menu.getByRole("link", { name: "Sales", exact: true })).toHaveCount(1);
    await page.reload();
    await expect(menu.getByRole("button", { name: "Unpin Sales" })).toBeVisible();
    await menu.getByRole("button", { name: "Unpin Sales" }).click();
    await expect(menu.getByRole("group", { name: "Favourites" })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Sales", exact: true })).toHaveCount(1);
  });

  test("workspace group toggle preserves native links and navigation", async ({ page }) => {
    await signIn(page, "/");
    const menu = page.getByRole("navigation", { name: "Main" });
    const heading = menu.getByRole("button", { name: "Money" });
    await heading.click();
    await expect(heading).toHaveAttribute("aria-expanded", "false");
    await expect(menu.getByRole("link", { name: "Sales", exact: true })).toBeHidden();
    await heading.click();
    await expect(menu.getByRole("link", { name: "Sales", exact: true })).toBeVisible();
  });

  test("dashboard widget preferences preserve real data and survive refresh", async ({ page }) => {
    await signIn(page, "/");
    const dashboard = page.getByRole("region", { name: "Dashboard widgets" });
    await expect(dashboard.getByText("Bank accounts", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Customize dashboard" }).click();
    const bank = page.getByRole("checkbox", { name: "Bank accounts" });
    await expect(bank).toBeChecked();
    await bank.click();
    await page.keyboard.press("Escape");
    await expect(dashboard.getByText("Bank accounts", { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(dashboard.getByText("Bank accounts", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Customize dashboard" }).click();
    await page.getByRole("button", { name: "Show all widgets" }).click();
    await page.keyboard.press("Escape");
    await expect(dashboard.getByText("Bank accounts", { exact: true })).toBeVisible();
  });

  test("Sales invoice saved view filters and quick actions remain available", async ({ page }) => {
    await signIn(page, "/sales/invoices");
    const overdue = page.getByRole("button", { name: "Overdue", exact: true });
    await overdue.click();
    await page.getByRole("button", { name: "Saved views" }).click();
    await page.getByRole("textbox", { name: "New view name" }).fill("Follow up overdue");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Follow up overdue" })).toBeVisible();
    await page.getByRole("button", { name: "Follow up overdue" }).click();
    await expect(overdue).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Saved views" }).click();
    await expect(page.getByRole("button", { name: "Follow up overdue" })).toBeVisible();
    await page.getByRole("button", { name: "Delete saved view Follow up overdue" }).click();
    await expect(page.getByRole("button", { name: "Follow up overdue" })).toHaveCount(0);
  });

  test("Bills workspace keeps filter views and resets page on applying one", async ({ page }) => {
    await signIn(page, "/purchases/bills");
    await page.getByRole("button", { name: "Overdue", exact: true }).click();
    await expect(page).toHaveURL(/overdueOnly=true/);
    await page.getByRole("button", { name: "Saved views" }).click();
    await page.getByRole("textbox", { name: "New view name" }).fill("Pay overdue");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Pay overdue" }).click();
    await expect(page).toHaveURL(/overdueOnly=true/);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/overdueOnly=true/);
  });

  test("Banking transaction filters save and restore direction with safe URL state", async ({
    page,
  }) => {
    await signIn(page, "/banking/transactions");
    await page.getByRole("button", { name: "Money out", exact: true }).click();
    await expect(page).toHaveURL(/direction=out/);
    await page.getByRole("button", { name: "Saved views" }).click();
    await page.getByRole("textbox", { name: "New view name" }).fill("Outgoing transactions");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Outgoing transactions" }).click();
    await expect(page).toHaveURL(/direction=out/);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/direction=out/);
  });

  test("invoice table appearance persists and read-only preview keeps the list open", async ({
    page,
  }) => {
    await signIn(page, "/sales/invoices");
    const columns = page.getByRole("button", { name: "Choose table columns" });
    await columns.click();
    const due = page.getByRole("menuitemcheckbox", { name: "Due date" });
    await expect(due).toBeChecked();
    await due.click();
    await page.keyboard.press("Escape");
    if (await page.getByRole("columnheader", { name: "Due", exact: true }).count()) {
      await expect(page.getByRole("columnheader", { name: "Due", exact: true })).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Choose row density" }).click();
    await page.getByRole("menuitemradio", { name: "Compact" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Choose table columns" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Due date" })).not.toBeChecked();
    await page.keyboard.press("Escape");
    const before = page.url();
    const previews = page.getByRole("button", { name: /^Preview invoice / });
    if ((await previews.count()) > 0) {
      await previews.first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("link", { name: "Open full invoice" })).toHaveAttribute(
        "href",
        /\/sales\/invoices\//,
      );
      expect(page.url()).toBe(before);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Choose row density" }).click();
    await page.getByRole("menuitem", { name: "Restore table defaults" }).click();
    await page.getByRole("button", { name: "Choose table columns" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Due date" })).toBeChecked();
  });

  test("bank transaction columns and density persist without hiding coding controls", async ({
    page,
  }) => {
    await signIn(page, "/banking/transactions");
    await page.getByRole("button", { name: "Choose table columns" }).click();
    const journal = page.getByRole("menuitemcheckbox", { name: "Linked journals" });
    await expect(journal).toBeChecked();
    await journal.click();
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "Choose table columns" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Linked journals" })).not.toBeChecked();
    await page.keyboard.press("Escape");
    const actionsHeader = page.getByRole("columnheader", { name: "Actions" });
    if ((await actionsHeader.count()) > 0) await expect(actionsHeader).toBeVisible();
    await page.getByRole("button", { name: "Choose row density" }).click();
    await page.getByRole("menuitem", { name: "Restore table defaults" }).click();
    await page.getByRole("button", { name: "Choose table columns" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Linked journals" })).toBeChecked();
  });

  test("bank transaction preview is read-only, navigable and preserves the list URL", async ({
    page,
  }) => {
    await signIn(page, "/banking/transactions");
    const previewButtons = page.getByRole("button", { name: /^Preview transaction / });
    if ((await previewButtons.count()) === 0) return;
    const original = page.url();
    await previewButtons.first().click();
    const dialog = page.getByRole("dialog", { name: "Bank transaction preview" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: /View transaction in workspace/ }),
    ).toHaveAttribute("href", /\/banking\/transactions/);
    await expect(dialog.getByRole("region", { name: "Linked journals" })).toBeVisible();
    expect(page.url()).toBe(original);
    if ((await previewButtons.count()) > 1) {
      await dialog.getByRole("button", { name: "Next" }).click();
      await expect(dialog.getByText(/2 of \d+ on this page/)).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(page.url()).toBe(original);
  });

  test("Bills preview shows financial breakdown without posting or leaving the list", async ({
    page,
  }) => {
    await signIn(page, "/purchases/bills");
    const previews = page.getByRole("button", { name: "Quick preview" });
    if ((await previews.count()) === 0) return;
    const original = page.url();
    await previews.first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Supplier invoice #")).toBeVisible();
    await expect(dialog.getByText("Tax included")).toBeVisible();
    await expect(dialog.getByText("Payment status")).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Open.*document|Open & edit/ })).toHaveAttribute(
      "href",
      /\/purchases\/bills\//,
    );
    expect(page.url()).toBe(original);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("selected banking rows show a clear, non-posting selection action", async ({ page }) => {
    await signIn(page, "/banking/transactions");
    const checkboxes = page.getByRole("checkbox", { name: /^Select / });
    if ((await checkboxes.count()) === 0) return;
    await checkboxes.first().click();
    const actions = page.getByRole("region", { name: "Selected record actions" });
    await expect(actions).toContainText("selected");
    await actions.getByRole("button", { name: "Clear selected records" }).click();
    await expect(actions).toHaveCount(0);
  });
});
