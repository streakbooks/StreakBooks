import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const path = "work/banking-local-api-session.json";
type Fixture = {
  api_url: string;
  anon_key: string;
  company_id: string;
  bank_id: string;
  transaction_ids: string[];
  owner: { email: string; password: string; access_token: string };
};
const fixture = JSON.parse(readFileSync(path, "utf8")) as Fixture;
if (
  new URL(fixture.api_url).hostname !== "127.0.0.1" &&
  new URL(fixture.api_url).hostname !== "localhost"
)
  throw new Error("Only the explicit localhost fixture is supported");
async function api(route: string, method = "GET", data?: unknown) {
  const response = await fetch(fixture.api_url + "/rest/v1/" + route, {
    method,
    headers: {
      apikey: fixture.anon_key,
      Authorization: `Bearer ${fixture.owner.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  expect(response.ok, `Local fixture API ${route.split("?")[0]}`).toBe(true);
  return response.status === 204 ? null : response.json();
}
async function transaction(amount: number) {
  const id = randomUUID();
  await api("bank_transactions", "POST", {
    id,
    company_id: fixture.company_id,
    bank_account_id: fixture.bank_id,
    txn_date: new Date().toISOString().slice(0, 10),
    amount_minor: -amount,
    description: "Readiness Cloud Hosting",
    external_id: "readiness-" + id,
  });
  fixture.transaction_ids.push(id);
  writeFileSync(path, JSON.stringify(fixture), { mode: 0o600 });
  return id;
}
async function openCode(page: Page, id: string) {
  await page.goto(
    "/auth?redirect=" + encodeURIComponent("/banking/transactions?transactionId=" + id),
    { timeout: 120_000 },
  );
  await page.locator("#signin-email").fill(fixture.owner.email);
  await page.locator("#signin-password").fill(fixture.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/banking\/transactions/, { timeout: 90_000 });
  await page.getByRole("button", { name: "Code", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Use suggestion", exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

test("signed-in Banking → feedback → authoritative posting → persisted learning (real local API)", async ({
  page,
  context,
}) => {
  const id = await transaction(12500);
  await openCode(page, id);
  await page.getByText("Supporting history and preferences", { exact: true }).click();
  await page.getByRole("button", { name: "Disable preference", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use suggestion", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Re-enable preference", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use suggestion", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(
    page.getByText("Last feedback: rejected (selection only).", { exact: true }),
  ).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("link", { name: "View latest posting" }).click({ modifiers: ["Control"] });
  const popup = await popupPromise;
  await popup.waitForURL(/\/banking\/journal\//);
  await expect(popup.getByRole("heading", { name: /Journal/ }).first()).toBeVisible({
    timeout: 60_000,
  });
  await popup.close();
  const use = page.getByRole("button", { name: "Use suggestion", exact: true });
  await use.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Fully allocated", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Post", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByRole("button", { name: "Code", exact: true })).toHaveCount(0, {
    timeout: 30_000,
  });
  const events = (await api(
    `bank_coding_events?company_id=eq.${fixture.company_id}&bank_transaction_id=eq.${id}&select=id,journal_id`,
  )) as Array<{ id: string; journal_id: string }>;
  expect(events).toHaveLength(1);
  const feedback = (await api(
    `bank_coding_feedback?company_id=eq.${fixture.company_id}&bank_transaction_id=eq.${id}&journal_id=eq.${events[0]!.journal_id}&select=state`,
  )) as Array<{ state: string }>;
  expect(feedback).toEqual([{ state: "accepted" }]);
  const lines = (await api(
    `journal_lines?company_id=eq.${fixture.company_id}&journal_id=eq.${events[0]!.journal_id}&select=debit_minor,credit_minor`,
  )) as Array<{ debit_minor: number; credit_minor: number }>;
  expect(
    lines.reduce((sum, line) => sum + Number(line.debit_minor) - Number(line.credit_minor), 0),
  ).toBe(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Code", exact: true })).toHaveCount(0);
});

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 375, height: 667 },
]) {
  test(`signed-in Coding Memory at ${viewport.width}px (real local API, keyboard)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const id = await transaction(viewport.width + 10000);
    await openCode(page, id);
    const use = page.getByRole("button", { name: "Use suggestion", exact: true });
    await use.focus();
    await expect(use).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.getByText("Supporting history and preferences", { exact: true }).click();
    await expect(page.getByRole("link", { name: "View latest posting" })).toBeVisible();
  });
}
