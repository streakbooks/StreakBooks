import { expect, test } from "@playwright/test";

// Component behaviour against in-memory adapters. Database rules are covered by the SQL suites.
test.describe("customer referral", () => {
  test("needs the disclosure before linking and reports bad codes", async ({ page }) => {
    await page.goto("/?view=referral");
    await expect(page.getByRole("heading", { name: "Accountant referral" })).toBeVisible();
    const link = page.getByRole("button", { name: "Link partner" });
    await page.getByLabel("Referral code from your accountant").fill("wrongcode1");
    await expect(link).toBeDisabled();
    await page.getByText("Partner disclosure (version 1)").click();
    await expect(
      page.getByText("Your adviser may be paid a commission by LinkBooks."),
    ).toBeVisible();
    await page.getByLabel(/I have read the partner disclosure/).check();
    await link.click();
    await expect(page.getByText("That referral code is not valid")).toBeVisible();
    await page.getByLabel("Referral code from your accountant").fill("ab12cd34ef56");
    await link.click();
    await expect(page.getByText("Linked to Sharma & Co.")).toBeVisible();
    await expect(page.getByText(/Referred by Sharma & Co on/)).toBeVisible();
  });

  test("prefills a code captured from a partner link", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("linkbooks.referralCode", "AB12CD34EF56"));
    await page.goto("/?view=referral");
    await expect(page.getByLabel("Referral code from your accountant")).toHaveValue("AB12CD34EF56");
  });

  test("stays hidden while the programme is closed", async ({ page }) => {
    await page.goto("/?view=referral&closed");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Accountant referral" })).toHaveCount(0);
  });
});

test.describe("partner portal", () => {
  test("firm admins apply after accepting the terms", async ({ page }) => {
    await page.goto("/?view=partner");
    const apply = page.getByRole("button", { name: "Apply" });
    await page.getByLabel("Contact email").fill("ca@example.invalid");
    await expect(apply).toBeDisabled();
    await page.getByLabel("I accept the partner terms on behalf of this firm.").check();
    await apply.click();
    await expect(page.getByText("LinkBooks is verifying your application.")).toBeVisible();
    await expect(page.getByRole("button", { name: "New referral code" })).toHaveCount(0);
  });

  test("members cannot apply and closed applications are explained", async ({ page }) => {
    await page.goto("/?view=partner&member");
    await expect(page.getByText("A firm owner or admin can apply")).toBeVisible();
    await page.goto("/?view=partner&noterms");
    await expect(page.getByText("not accepting applications yet")).toBeVisible();
  });

  test("approved partners share links and see the ledger", async ({ page }) => {
    await page.goto("/?view=partner&approved");
    await expect(page.getByText(/\/pricing\?ref=AB12CD34EF56/)).toBeVisible();
    await page.getByRole("button", { name: "New referral code" }).click();
    await expect(page.getByText("NEWCODE00001", { exact: true })).toBeVisible();
    await expect(page.getByText(/INR: available ₹42\.33/)).toBeVisible();
    await expect(page.getByRole("cell", { name: /Refund reversal/ })).toBeVisible();
    await expect(page.getByText("Payouts are not enabled yet.", { exact: false })).toBeVisible();
  });
});

test.describe("partner programme administration", () => {
  test("a requester cannot approve their own programme change", async ({ page }) => {
    await page.goto("/?view=partner-admin");
    await expect(
      page.getByText("No commission rule is configured, so no commission accrues."),
    ).toBeVisible();
    await expect(page.getByText(/no window set \(programme closed\)/)).toBeVisible();
    await expect(
      page.getByText("Payouts are disabled. Approved commission stays in the ledger."),
    ).toBeVisible();
    const otherChange = page.getByRole("listitem").filter({ hasText: "Open the programme" });
    await expect(otherChange.getByRole("button", { name: "Approve" })).toBeVisible();
    await page.getByLabel("Window (days, empty closes)").fill("60");
    await page.getByLabel("Reason").first().fill("Rehearsal change");
    await page.getByRole("button", { name: "Request change" }).click();
    await expect(page.getByText("Change requested. Another owner must approve it.")).toBeVisible();
    const ownChange = page.getByRole("listitem").filter({ hasText: "Rehearsal change" });
    await expect(ownChange).toBeVisible();
    await expect(ownChange.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await otherChange.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(/90-day window/)).toBeVisible();
  });

  test("payouts cannot be requested while switched off", async ({ page }) => {
    await page.goto("/?view=partner-admin");
    await expect(
      page.getByRole("button", { name: "Request payout of available balance" }),
    ).toBeDisabled();
  });
});

test.describe("billing analytics", () => {
  test("shows per-currency figures without conversion", async ({ page }) => {
    await page.goto("/?view=analytics");
    await expect(page.getByText("MRR INR")).toBeVisible();
    await expect(page.getByText("₹999.00", { exact: true })).toBeVisible();
    await expect(page.getByText(/ARR ₹11,988\.00/)).toBeVisible();
    await expect(page.getByRole("cell", { name: "INR (2)" })).toBeVisible();
    await expect(page.getByText("saved 25%", { exact: false })).toBeVisible();
    await page.getByLabel("Period").selectOption("365d");
    await expect(page.getByText("MRR INR")).toBeVisible();
  });

  test("explains empty periods and keeps errors visible with retry", async ({ page }) => {
    await page.goto("/?view=analytics&empty");
    await expect(page.getByText("No invoices in this period.")).toBeVisible();
    await expect(page.getByText(/MRR has not been captured yet/)).toBeVisible();
    await page.goto("/?view=analytics&error");
    await expect(page.getByRole("alert")).toContainText("billing.view is required");
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("flags dead webhooks", async ({ page }) => {
    await page.goto("/?view=analytics&dead");
    await expect(page.getByText(/2 dead/)).toHaveClass(/text-destructive/);
  });
});
