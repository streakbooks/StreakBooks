import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { validateStagingTarget } from "../scripts/lib/staging-target.mjs";

/**
 * Read-only release gates for the existing Firm & Clients onboarding module.
 * Never run against production. All tests require an explicitly provisioned
 * staging firm with at least one linked client and onboarding checklist.
 * They do not approve work, write settings, or generate notifications.
 */
const stagingHost = process.env.E2E_EXPECTED_STAGING_HOST;
const primaryEmail = process.env.E2E_EMAIL;
const primaryPassword = process.env.E2E_PASSWORD;
const restrictedEmail = process.env.E2E_FIRM_RESTRICTED_EMAIL;
const restrictedPassword = process.env.E2E_FIRM_RESTRICTED_PASSWORD;
const taskCanary = process.env.E2E_FIRM_TASK_CSV_CANARY;
const hasRestricted = Boolean(
  restrictedEmail && restrictedPassword && taskCanary &&
    restrictedEmail !== primaryEmail,
);

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth?redirect=" + encodeURIComponent("/firm"));
  expect(new URL(page.url()).hostname).toBe(stagingHost);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(
    (url) => url.hostname === stagingHost && url.pathname === "/firm",
    { timeout: 30_000 },
  );
  await expect(page.getByRole("heading", { name: "Firm & clients" })).toBeVisible();
}

async function openOnboarding(page: Page) {
  const onboarding = page.getByRole("tab", { name: "Onboarding", exact: true });
  await expect(onboarding).toBeVisible();
  await onboarding.click();
  const reporting = page.getByRole("region", {
    name: "Advanced onboarding operational reports",
  });
  await expect(reporting).toBeVisible();
  await expect(reporting.getByRole("button", { name: "Refresh reports" })).toBeVisible();
  return reporting;
}

test.describe("Firm onboarding release gates — dedicated staging only", () => {
  test.beforeAll(() => {
    if (
      process.env.E2E_STAGING_ENABLED !== "true" ||
      process.env.E2E_FIRM_ONBOARDING_ENABLED !== "true" ||
      !process.env.E2E_BASE_URL || !primaryEmail || !primaryPassword
    ) {
      throw new Error(
        "Explicit staging + onboarding activation and dedicated credentials are required.",
      );
    }
    validateStagingTarget({
      stagingUrl: process.env.E2E_BASE_URL,
      expectedHost: stagingHost,
      productionUrl: process.env.E2E_PRODUCTION_URL,
    });
  });

  test("authorized practice shows onboarding, workload and report controls", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await signIn(page, primaryEmail!, primaryPassword!);
    const report = await openOnboarding(page);
    await expect(page.getByRole("region", {
      name: "Onboarding progress dashboard",
    })).toBeVisible();
    await expect(page.getByRole("region", {
      name: "Staff onboarding workload and task queue",
    })).toBeVisible();
    await expect(report.getByRole("combobox", {
      name: "Filter onboarding report by client",
    })).toBeVisible();
    await expect(report.getByRole("combobox", {
      name: "Filter overdue ageing",
    })).toBeVisible();
    await expect(report.getByRole("button", {
      name: "Export filtered tasks (CSV)",
    })).toBeVisible();
    await expect(report.getByRole("button", {
      name: "Export observed trends (CSV)",
    })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("overdue-age, historical period and completion filters are keyboard-operable", async ({
    page,
  }) => {
    await signIn(page, primaryEmail!, primaryPassword!);
    const report = await openOnboarding(page);
    const age = report.getByRole("combobox", { name: "Filter overdue ageing" });
    await age.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "1–7 days overdue" })).toBeVisible();
    await page.getByRole("option", { name: "1–7 days overdue" }).click();
    await expect(age).toContainText("1–7 days overdue");

    const completion = report.getByRole("combobox", {
      name: "Filter open and completed onboarding tasks",
    });
    await completion.click();
    await page.getByRole("option", { name: "Include completed tasks" }).click();
    await expect(completion).toContainText("Include completed tasks");

    const window = report.getByRole("combobox", { name: "Historical reporting window" });
    await window.click();
    await page.getByRole("option", { name: "60 days" }).click();
    await expect(window).toContainText("60 days");
  });

  test("CSV export neutralizes the pre-provisioned formula canary", async ({ page }) => {
    test.skip(
      !taskCanary || !/^[\s]*[=+\-@]/u.test(taskCanary),
      "Seed an authorized staging task named E2E_FIRM_TASK_CSV_CANARY starting with a formula character.",
    );
    await signIn(page, primaryEmail!, primaryPassword!);
    const report = await openOnboarding(page);
    const exportButton = report.getByRole("button", {
      name: "Export filtered tasks (CSV)",
    });
    await expect(exportButton).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^firm-onboarding-operations-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile(await download.path(), "utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Days overdue");
    expect(csv).toContain("'" + taskCanary);
    // Staging task can contain real customer-adjacent data; don't print CSV in errors/logs.
  });

  test("mobile reports and filters stay keyboard-accessible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, primaryEmail!, primaryPassword!);
    const report = await openOnboarding(page);
    await expect(report.getByRole("combobox", {
      name: "Filter overdue ageing",
    })).toBeVisible();
    await expect(report.getByRole("button", {
      name: "Export filtered tasks (CSV)",
    })).toBeVisible();
    const age = report.getByRole("combobox", { name: "Filter overdue ageing" });
    await age.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "8–30 days overdue" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(age).toBeFocused();
  });

  test("onboarding reporting region has no serious accessibility violations", async ({
    page,
  }) => {
    await signIn(page, primaryEmail!, primaryPassword!);
    await openOnboarding(page);
    const results = await new AxeBuilder({ page })
      .include('[aria-label="Advanced onboarding operational reports"]')
      .analyze();
    expect(
      results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => ({ id: v.id, impact: v.impact })),
    ).toEqual([]);
  });

  test("a second, restricted firm colleague cannot see another client's task canary", async ({
    browser,
  }: { browser: Browser }) => {
    test.skip(
      !hasRestricted,
      "Use two distinct staging users, a shared firm and a restricted client canary.",
    );
    const one = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const two = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    try {
      const authorized = await one.newPage();
      await signIn(authorized, primaryEmail!, primaryPassword!);
      const firstReport = await openOnboarding(authorized);
      await expect(firstReport.getByText(taskCanary!, { exact: true })).toBeVisible();

      const restricted = await two.newPage();
      await signIn(restricted, restrictedEmail!, restrictedPassword!);
      const secondReport = await openOnboarding(restricted);
      await expect(secondReport.getByText(taskCanary!, { exact: true })).toHaveCount(0);
    } finally {
      await one.close();
      await two.close();
    }
  });
});
