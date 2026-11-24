import { expect, test, type Page } from "@playwright/test";
import { validateStagingTarget } from "../scripts/lib/staging-target.mjs";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const stagingHost = process.env.E2E_EXPECTED_STAGING_HOST;

test.describe("authenticated StreakBooks staging smoke", () => {
  test.beforeAll(() => {
    if (process.env.E2E_STAGING_ENABLED !== "true" || !email || !password) {
      throw new Error("Dedicated staging E2E credentials and explicit activation are required.");
    }
    validateStagingTarget({
      stagingUrl: process.env.E2E_BASE_URL,
      expectedHost: stagingHost,
      productionUrl: process.env.E2E_PRODUCTION_URL,
    });
  });

  async function signIn(page: Page, destination: string) {
    await page.goto("/auth?redirect=" + encodeURIComponent(destination));
    // Verify the destination BEFORE submitting any credentials.
    expect(new URL(page.url()).hostname).toBe(stagingHost);
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(
      (url) => url.hostname === stagingHost && !url.pathname.startsWith("/auth"),
      { timeout: 30_000 },
    );
    await expect(page).not.toHaveURL(/\/auth/);
  }

  test("dedicated staging user authenticates and sees the workspace", async ({ page }) => {
    await signIn(page, "/");
    await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test("Contacts directory exposes filter, column, saved-view and reminder controls", async ({
    page,
  }) => {
    await signIn(page, "/contacts");

    await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Contact follow-up reminders" })).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Choose follow-up owner scope" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^Columns \(/ }).click();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Contact", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("menuitemcheckbox", { name: "City", exact: true })).toBeVisible();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "State / Region", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Advanced contact filters" }).click();
    await expect(page.getByLabel("Billing city", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Billing state / region", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Saved views", exact: true }).click();
    await expect(page.getByLabel("Open a saved contact view")).toBeVisible();
    await expect(page.getByLabel("Save current view as")).toBeVisible();
  });

  test("Contacts cloud columns synchronize between separate signed-in browsers", async ({
    page,
    browser,
  }) => {
    // This test uses the dedicated staging account only. Restore the original
    // preference even if cross-browser verification fails. No financial data changes.
    await signIn(page, "/contacts");
    const columns = page.getByRole("button", { name: /^Columns \(/ });
    await columns.click();
    const city = page.getByRole("menuitemcheckbox", { name: "City", exact: true });
    await expect(city).toBeVisible();
    await expect(page.getByText("Column preferences sync to your account")).toBeVisible();
    const originallyChecked = (await city.getAttribute("aria-checked")) === "true";
    let changed = false;
    try {
      await city.click();
      changed = true;
      await expect(city).toHaveAttribute("aria-checked", String(!originallyChecked));
      await expect(page.getByText("Column preferences sync to your account")).toBeVisible();

      const secondContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
      try {
        const secondPage = await secondContext.newPage();
        await signIn(secondPage, "/contacts");
        await secondPage.getByRole("button", { name: /^Columns \(/ }).click();
        await expect(
          secondPage.getByRole("menuitemcheckbox", { name: "City", exact: true }),
        ).toHaveAttribute("aria-checked", String(!originallyChecked));
      } finally {
        await secondContext.close();
      }
    } finally {
      if (changed) {
        await page.goto("/contacts");
        await columns.click();
        const restore = page.getByRole("menuitemcheckbox", { name: "City", exact: true });
        await expect(restore).toHaveAttribute("aria-checked", String(!originallyChecked));
        await restore.click();
        await expect(restore).toHaveAttribute("aria-checked", String(originallyChecked));
        await expect(page.getByText("Column preferences sync to your account")).toBeVisible();
      }
    }
  });

  test("Smart Action Center exposes opt-in contact reminders to authenticated users", async ({
    page,
  }) => {
    await signIn(page, "/notifications");
    await expect(page.getByRole("heading", { name: "Smart Action Center" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Contact follow-up reminders" })).toBeVisible();
    await page.getByRole("combobox", { name: "Filter by module" }).click();
    await expect(page.getByRole("option", { name: "Contact follow-ups" })).toBeVisible();
  });

  test("Action Center search submits explicitly and preserves shareable filters", async ({
    page,
  }) => {
    await signIn(page, "/notifications");
    const search = page.getByRole("textbox", { name: "Search notifications" });
    await expect(search).toBeVisible();

    // This read-only probe must not match staging financial records. Typing
    // cannot change search params or trigger a new server-side search.
    const probe = "__ACTION_CENTER_SEARCH_E2E_NEVER_MATCH_20261106__";
    await search.fill(probe);
    await expect(page).not.toHaveURL(/q=__ACTION_CENTER_SEARCH_E2E_NEVER_MATCH/);
    await search.press("Enter");
    await expect(page).toHaveURL(/q=__ACTION_CENTER_SEARCH_E2E_NEVER_MATCH/);
    await expect(
      page.getByText("No matching notifications across your accessible history."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(search).toHaveValue("");
    await expect(page).not.toHaveURL(/q=__ACTION_CENTER_SEARCH_E2E_NEVER_MATCH/);

    await page.getByRole("link", { name: "Critical", exact: true }).click();
    await expect(page).toHaveURL(/view=critical/);
    await expect(page.getByRole("link", { name: "Critical", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("Action Center view and category filters support keyboard navigation", async ({ page }) => {
    await signIn(page, "/notifications");
    const critical = page.getByRole("link", { name: "Critical", exact: true });
    await expect(critical).toBeVisible();
    await critical.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/view=critical/);
    await expect(critical).toHaveAttribute("aria-current", "page");

    // These filters change read-only URL state and do not acknowledge or post documents.
    await page.getByRole("combobox", { name: "Filter by module" }).click();
    await page.getByRole("option", { name: "Bill approvals" }).click();
    await expect(page).toHaveURL(/category=bill_approval/);

    await page.getByRole("combobox", { name: "Filter by priority" }).click();
    await page.getByRole("option", { name: "High", exact: true }).click();
    await expect(page).toHaveURL(/priority=high/);
  });

  test("Action Center mobile search and grouping controls remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "/notifications");
    await expect(page.getByRole("heading", { name: "Smart Action Center" })).toBeVisible();
    const search = page.getByRole("textbox", { name: "Search notifications" });
    await expect(search).toBeVisible();
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Filter by module" })).toBeVisible();

    // No staging fixture guarantees inbox rows. Check grouping only when it is
    // rendered, otherwise assert the real empty state rather than invent alerts.
    const group = page.getByRole("button", { name: "Group page by module" });
    const emptyState = page.getByText("No matching notifications across your accessible history.");
    // Wait until the inbox has settled; checking the toggle immediately after
    // navigation could incorrectly interpret pending data as an empty inbox.
    await expect(group.or(emptyState)).toBeVisible({ timeout: 30_000 });
    if (await group.isVisible()) {
      await group.click();
      await expect(group).toHaveAttribute("aria-pressed", "true");
      await group.click();
      await expect(group).toHaveAttribute("aria-pressed", "false");
    } else {
      await expect(emptyState).toBeVisible();
    }
  });

  test("Sales and Purchases show existing permission-controlled filter views", async ({ page }) => {
    await signIn(page, "/sales/invoices");
    await expect(page.getByRole("button", { name: "Saved views" })).toBeVisible();
    await page.goto("/purchases/bills");
    await expect(page.getByRole("button", { name: "Saved views" })).toBeVisible();
    await expect(page).toHaveURL(/\/purchases\/bills/);
  });

  test("Banking search receives keyboard focus without changing financial records", async ({
    page,
  }) => {
    await signIn(page, "/banking/transactions");
    const search = page.getByRole("textbox", { name: "Search bank transactions" });
    await expect(search).toBeVisible();
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    await search.fill("test");
    await page.keyboard.press("/");
    await expect(search).toHaveValue("test/");
    await search.clear();
    await expect(page.getByRole("button", { name: "Saved views" })).toBeVisible();
  });

  test("mobile Banking switches between cards and ledger table", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "/banking/transactions");
    const table = page.getByRole("button", { name: "Switch to transaction table" });
    await expect(table).toBeVisible();
    const cards = page.getByRole("region", { name: "Mobile bank transactions" });
    const empty = page.getByText("No transactions", { exact: true });
    await expect(cards.or(empty).first()).toBeVisible();
    await table.click();
    await expect(page.getByRole("button", { name: "Switch to transaction cards" })).toBeVisible();
    await page.getByRole("button", { name: "Switch to transaction cards" }).click();
    await expect(page.getByRole("button", { name: "Switch to transaction table" })).toBeVisible();
  });

  test("mobile Sales invoices switch between cards and desktop table without posting", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "/sales/invoices");
    const table = page.getByRole("button", { name: "Switch invoices to table view" });
    await expect(table).toBeVisible();
    await table.click();
    await expect(page.getByRole("button", { name: "Switch invoices to cards view" })).toBeVisible();
    await page.getByRole("button", { name: "Switch invoices to cards view" }).click();
    await expect(table).toBeVisible();
    await expect(page.getByRole("button", { name: "Saved views" })).toBeVisible();
  });

  test("mobile Purchases bills switch views while preserving workflow filters", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "/purchases/bills");
    const table = page.getByRole("button", { name: "Switch bills to table view" });
    await expect(table).toBeVisible();
    await table.click();
    await expect(page.getByRole("button", { name: "Switch bills to cards view" })).toBeVisible();
    await page.getByRole("button", { name: "Switch bills to cards view" }).click();
    await expect(table).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Bill workflow" })).toBeVisible();
  });

  test("Dashboard attention and layout controls display real protected workspace", async ({
    page,
  }) => {
    await signIn(page, "/");
    const attention = page.getByRole("region", { name: "Bookkeeping attention centre" });
    await expect(attention).toBeVisible();
    await expect(attention.getByText("Priority work queue")).toBeVisible();
    await attention
      .getByRole("group", { name: "Filter bookkeeping tasks" })
      .getByRole("button", { name: /^Overdue/ })
      .click();
    await expect(
      attention
        .getByRole("group", { name: "Filter bookkeeping tasks" })
        .getByRole("button", { name: /^Overdue/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Dashboard widgets" })).toBeVisible();
    await page.getByRole("button", { name: "Customize dashboard" }).click();
    await expect(
      page.getByRole("button", { name: "Apply Banking dashboard layout" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Reports catalogue retains discovery filters and dates through reload", async ({ page }) => {
    await signIn(page, "/reports?tab=standard&from=2026-01-01&to=2026-01-31");
    const catalogue = page.getByRole("region", { name: "Report catalogue", exact: true });
    await expect(catalogue).toBeVisible();
    await catalogue.getByLabel("Search reports", { exact: true }).fill("profit loss");
    await catalogue.getByLabel("Category", { exact: true }).selectOption("financial_statements");
    await expect(catalogue.getByRole("status")).toHaveText("1 report found");
    await page.reload();
    await expect(catalogue.getByLabel("Search reports", { exact: true })).toHaveValue(
      "profit loss",
    );
    await expect(catalogue.getByLabel("Category", { exact: true })).toHaveValue(
      "financial_statements",
    );
    await catalogue
      .getByRole("link", { name: /Profit and Loss/ })
      .last()
      .click();
    await expect(page).toHaveURL(/from=2026-01-01/);
    await expect(page).toHaveURL(/to=2026-01-31/);
    await expect(page.getByRole("article")).toBeVisible();
  });

  test("posted-ledger P&L accepts an inclusive single-day filter through the authenticated server", async ({
    page,
  }) => {
    await signIn(page, "/reports/profit-and-loss?from=2026-01-01&to=2026-01-31");
    await expect(page.getByRole("article")).toBeVisible();
    await page.getByRole("button", { name: "Customize report", exact: true }).click();
    await page.getByRole("tab", { name: "Filters", exact: true }).click();
    await page.getByRole("button", { name: "Add condition", exact: true }).click();
    await page.getByRole("combobox", { name: "Condition 1 field", exact: true }).click();
    await page.getByRole("option", { name: "Journal date", exact: true }).click();
    await page.getByRole("combobox", { name: "Condition 1 operator", exact: true }).click();
    await page.getByRole("option", { name: "Between", exact: true }).click();
    await page.getByLabel("Condition 1 value 1", { exact: true }).fill("2026-01-15");
    await page.getByLabel("Condition 1 value 2", { exact: true }).fill("2026-01-15");
    await page.getByRole("button", { name: "Apply report settings", exact: true }).click();
    await expect(page.getByRole("article")).toContainText(
      "Journal date between 2026-01-15 to 2026-01-15",
    );
    await page.reload();
    await expect(page.getByRole("article")).toContainText(
      "Journal date between 2026-01-15 to 2026-01-15",
    );
  });

  test("authenticated financial CSV export retains the active statement period", async ({
    page,
  }) => {
    await signIn(page, "/reports/profit-and-loss?from=2026-01-01&to=2026-01-31");
    await expect(page.getByRole("article")).toBeVisible();
    await page.getByRole("button", { name: "Download report", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "CSV data (.csv)", exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe("profit-and-loss-2026-01-31.csv");
    expect(await download.failure()).toBeNull();
    const stream = await download.createReadStream();
    if (!stream) throw new Error("The report download stream is unavailable");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const content = Buffer.concat(chunks).toString("utf8");
    // Do not log financial rows or attach report artifacts to the CI output.
    expect(content.includes("2026-01-01 to 2026-01-31")).toBe(true);
    expect(content.includes("Net profit")).toBe(true);
  });

  test("management report dates follow the Reports Centre without discarding dashboard edits", async ({
    page,
  }) => {
    await signIn(page, "/reports?tab=management&from=2026-01-01&to=2026-01-31");
    await expect(page.getByLabel("Dashboard name", { exact: true })).toBeVisible();
    await page.getByLabel("Dashboard name", { exact: true }).fill("Unsaved reporting review");
    await page.getByLabel("Reporting period from", { exact: true }).fill("2026-01-02");
    await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-01-02");
    await expect(page.getByLabel("Dashboard name", { exact: true })).toHaveValue(
      "Unsaved reporting review",
    );
    await page.getByLabel("To", { exact: true }).fill("2026-01-30");
    await expect(page.getByLabel("Reporting period to", { exact: true })).toHaveValue("2026-01-30");
    await expect(page).toHaveURL(/to=2026-01-30/);
  });

  test("cash P&L switches basis through the authenticated engine and downloads cash-labelled data", async ({
    page,
  }) => {
    await signIn(page, "/reports/profit-and-loss?from=2026-01-01&to=2026-01-31");
    await expect(page.getByRole("article")).toBeVisible();
    await page.getByLabel("Accounting method", { exact: true }).selectOption("cash");
    await expect(page.getByRole("article")).toContainText("Cash basis");
    await page.reload();
    await expect(page.getByLabel("Accounting method", { exact: true })).toHaveValue("cash");
    await expect(page.getByRole("article")).toContainText("Cash basis");
    await page.getByRole("button", { name: "Download report", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "CSV data (.csv)", exact: true }).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    const stream = await download.createReadStream();
    if (!stream) throw new Error("Cash report download stream unavailable");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    // Keep actual financial data out of test output and artifacts.
    expect(Buffer.concat(chunks).toString("utf8").includes("Cash basis")).toBe(true);
    await page.getByLabel("Accounting method", { exact: true }).selectOption("accrual");
    await expect(page.getByRole("article")).toContainText("Accrual basis");
  });
  test("cash Balance Sheet retains basis after reload and exports a cash statement", async ({
    page,
  }) => {
    await signIn(page, "/reports/balance-sheet?to=2026-01-31");
    await expect(page.getByRole("article")).toBeVisible();
    await page.getByLabel("Accounting method", { exact: true }).selectOption("cash");
    await expect(page.getByRole("article")).toContainText("Cash basis");
    await page.reload();
    await expect(page.getByLabel("Accounting method", { exact: true })).toHaveValue("cash");
    await expect(page.getByRole("article")).toContainText("Total assets");
    await page.getByRole("button", { name: "Download report", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "CSV data (.csv)", exact: true }).click();
    expect(await (await pending).failure()).toBeNull();
  });
});
