import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const path = "work/banking-local-api-session.json";
type Fixture = {
  api_url: string;
  anon_key: string;
  company_id: string;
  other_company_id: string;
  reader: { email: string; password: string; access_token: string };
  bank_id: string;
  bank_gl_id: string;
  offset_account_id: string;
  transaction_ids: string[];
  owner: { id: string; email: string; password: string; access_token: string };
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
async function signIn(
  page: Page,
  id: string,
  user: Pick<Fixture["owner"], "email" | "password"> = fixture.owner,
) {
  await page.goto(
    "/auth?redirect=" + encodeURIComponent("/banking/transactions?transactionId=" + id),
    { timeout: 120_000 },
  );
  await page.locator("#signin-email").fill(user.email);
  await page.locator("#signin-password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/banking\/transactions/, { timeout: 90_000 });
}
async function openCode(page: Page, id: string) {
  await signIn(page, id);
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
  const audits = await api(
    `audit_events?company_id=eq.${fixture.company_id}&entity_id=eq.${id}&action=eq.bank_transaction.coded&select=id`,
  );
  expect(audits).toHaveLength(1);
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

test("retry after a lost feedback response reuses the committed request instead of duplicating feedback", async ({
  page,
}) => {
  const id = await transaction(13200);
  await openCode(page, id);
  await page.getByText("Supporting history and preferences", { exact: true }).click();
  let dropped = 0;
  await page.route("**/_serverFn/**", async (route) => {
    const body = route.request().postData() ?? "";
    if (
      dropped < 2 &&
      route.request().method() === "POST" &&
      body.includes(id) &&
      body.includes("rejected")
    ) {
      dropped += 1;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect.poll(() => dropped).toBe(2);
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  const path = `bank_coding_feedback?company_id=eq.${fixture.company_id}&bank_transaction_id=eq.${id}&select=id,request_id,state`;
  const committed = await api(path);
  expect(committed).toHaveLength(1);
  expect(committed[0].state).toBe("rejected");
  await retry.click();
  await expect(
    page.getByText("Last feedback: rejected (selection only).", { exact: true }),
  ).toBeVisible();
  expect(await api(path)).toEqual(committed);
});

test("switching real organisations discards prior-company coding evidence and persists the active company", async ({
  page,
}) => {
  const id = await transaction(13100);
  await openCode(page, id);
  const first = "Organisation: Isolated Coding Memory Readiness. Switch organisation";
  const second = "Organisation: Isolated Empty Switch Target. Switch organisation";
  await page.getByRole("button", { name: first, exact: true }).click();
  await page.getByRole("menuitem", { name: "Isolated Empty Switch Target", exact: true }).click();
  await expect(page.getByRole("button", { name: second, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Use suggestion", exact: true })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await api(`profiles?id=eq.${fixture.owner.id}&select=last_company_id`))[0].last_company_id,
    )
    .toBe(fixture.other_company_id);
  await page.reload();
  await expect(page.getByRole("button", { name: second, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Use suggestion", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: second, exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Isolated Coding Memory Readiness", exact: true })
    .click();
  await expect(page.getByRole("button", { name: first, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      async () =>
        (await api(`profiles?id=eq.${fixture.owner.id}&select=last_company_id`))[0].last_company_id,
    )
    .toBe(fixture.company_id);
});

for (const width of [1280, 375]) {
  test(`real read-only member retains inspection without financial controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const id = await transaction(13400);
    await signIn(page, id, fixture.reader);
    await expect(page.getByRole("heading", { name: "For review", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Readiness Cloud Hosting", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Code", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Post", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Match", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Code selected", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /More actions for transaction/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Manage", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Preview transaction Readiness Cloud Hosting",
        exact: true,
      }),
    ).toBeVisible();
  });
}

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

test("confirmed reset survives lost responses, preserves journals and only forgets earlier learning (real local API)", async ({
  page,
}) => {
  const id = await transaction(14600);
  await openCode(page, id);
  const eventPath = `bank_coding_events?company_id=eq.${fixture.company_id}&select=id,journal_id`;
  const journalPath = `journals?company_id=eq.${fixture.company_id}&select=id,status,reversed_by_journal_id`;
  const eventsBefore = await api(eventPath);
  const journalsBefore = await api(journalPath);
  const resetAuditsPath = `audit_events?company_id=eq.${fixture.company_id}&action=eq.bank_coding_memory.reset&select=id`;
  const auditCountBefore = (await api(resetAuditsPath)).length;
  await page.getByText("Supporting history and preferences", { exact: true }).click();
  const resetButton = page.getByRole("button", { name: "Reset learned preference", exact: true });
  await resetButton.click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await api(
      `bank_coding_memory_resets?company_id=eq.${fixture.company_id}&bank_transaction_id=eq.${id}&select=id`,
    ),
  ).toHaveLength(0);
  let dropped = 0;
  await page.route("**/_serverFn/**", async (route) => {
    const body = route.request().postData() ?? "";
    if (
      dropped < 2 &&
      route.request().method() === "POST" &&
      body.includes(id) &&
      body.includes("requestId")
    ) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      dropped += 1;
      await route.abort("failed");
    } else await route.continue();
  });
  await resetButton.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Reset preference", exact: true }).click();
  await expect.poll(() => dropped).toBe(2);
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  const receiptPath = `bank_coding_memory_resets?company_id=eq.${fixture.company_id}&bank_transaction_id=eq.${id}&select=id,request_id,history_id,through_event_no`;
  const receipts = await api(receiptPath);
  expect(receipts).toHaveLength(1);
  const identity = { _company_id: fixture.company_id, _bank_transaction_id: id };
  expect(await api("rpc/get_bank_coding_memory", "POST", identity)).toEqual([]);
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use suggestion", exact: true })).toHaveCount(0);
  expect(await api(receiptPath)).toEqual(receipts);
  expect(
    (await api(eventPath)).sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)),
  ).toEqual(eventsBefore.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)));
  expect(
    (await api(journalPath)).sort((a: { id: string }, b: { id: string }) =>
      a.id.localeCompare(b.id),
    ),
  ).toEqual(
    journalsBefore.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)),
  );
  expect(await api(resetAuditsPath)).toHaveLength(auditCountBefore + 1);
  await page.reload();
  await page.getByRole("button", { name: "Code", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Use suggestion", exact: true })).toHaveCount(0);
  // Use the authoritative posting/linking flow to teach a fresh approval.
  const fresh = await transaction(14900);
  const journal = await api("rpc/post_journal", "POST", {
    payload: {
      company_id: fixture.company_id,
      journal_date: new Date().toISOString().slice(0, 10),
      currency_code: "GBP",
      fx_rate_to_base: 1,
      source_type: "bank_transaction",
      source_id: fresh,
      idempotency_key: "local-readiness:" + fresh,
      lines: [
        { account_id: fixture.bank_gl_id, debit_minor: 0, credit_minor: 14900 },
        { account_id: fixture.offset_account_id, debit_minor: 14900, credit_minor: 0 },
      ],
    },
  });
  const lines = await api(
    `journal_lines?company_id=eq.${fixture.company_id}&journal_id=eq.${journal}&account_id=eq.${fixture.bank_gl_id}&select=id`,
  );
  await api("reconciliation_links", "POST", {
    company_id: fixture.company_id,
    bank_transaction_id: fresh,
    journal_line_id: lines[0].id,
  });
  await api(`bank_transactions?id=eq.${fresh}`, "PATCH", { status: "matched" });
  const memory = await api("rpc/get_bank_coding_memory", "POST", identity);
  expect(memory).toHaveLength(1);
  expect(memory[0].times_used).toBe(1);
  expect(memory[0].last_reset_at).toBeTruthy();
  await api("rpc/reset_bank_coding_memory_preference", "POST", {
    ...identity,
    _history_id: receipts[0].history_id,
    _request_id: receipts[0].request_id,
  });
  expect(await api("rpc/get_bank_coding_memory", "POST", identity)).toEqual(memory);
  await page.reload();
  await page.getByRole("button", { name: "Code", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Use suggestion", exact: true })).toBeVisible();
  await page.getByText("Supporting history and preferences", { exact: true }).click();
  await expect(page.getByText(/Learning since reset on/)).toBeVisible();
});
