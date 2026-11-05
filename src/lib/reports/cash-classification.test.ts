import { describe, expect, it } from "vitest";
import { cashInputFixture, arId, apId, taxId } from "./__fixtures__/cash-facts";
import { bankId, expenseId, revenueId } from "./__fixtures__/facts";
import { cashProfitLoss, type CashJournal, type CashPnlInput } from "./cash-profit-loss";
import { cashLedger } from "./cash-ledger";
import {
  cashClassificationExceptions,
  cashJournalEvidenceSnapshot,
  type CashClassificationPolicy,
  type CashOpeningEvidence,
} from "./cash-classification";
import { traceCashInventory, type CashInventoryEvidence } from "./cash-inventory";
const period = { from: "2026-11-01", to: "2026-11-30" };
function empty() {
  const input = cashInputFixture();
  input.journals = [];
  input.payments = [];
  input.allocations = [];
  return input;
}
function account(
  input: CashPnlInput,
  id: string,
  type: "asset" | "liability" | "equity",
  kind: string,
) {
  input.accounts.push({
    ...input.accounts[0]!,
    id,
    account_type: type,
    account_kind: kind,
    subtype: kind,
    system_key: null,
    is_control: false,
  });
}
function journal(
  input: CashPnlInput,
  id: string,
  date: string,
  sourceType: string,
  lines: Array<[string, bigint, bigint]>,
  sourceId: string | null = null,
) {
  const j: CashJournal = {
    id,
    companyId: input.companyId,
    date,
    number: id,
    sourceType,
    sourceId,
    currency: "GBP",
    rate: "1",
    reverses: null,
    lines: lines.map(([accountId, debit, credit], i) => ({
      accountId,
      debit,
      credit,
      lineId: `${id}-${i}`,
    })),
  };
  input.journals.push(j);
  return j;
}
function policy(
  input: CashPnlInput,
  source: string,
  target: string,
  kind: CashClassificationPolicy["kind"],
  proof: CashJournal[],
) {
  const p: CashClassificationPolicy = {
    id: `policy-${source}`,
    companyId: input.companyId,
    sourceAccountId: source,
    recognitionAccountId: target,
    kind,
    version: 1,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    status: "approved",
    policyNote: "Verified source classification from original records",
    evidenceReference: "Original supporting documents",
    evidenceJournalIds: proof.map((j) => j.id),
    evidenceJournalSnapshots: proof.map(cashJournalEvidenceSnapshot),
    approvedBy: "reviewer",
    approvedAt: "2026-11-01T00:00:00Z",
  };
  (input.classificationPolicies ??= []).push(p);
  return p;
}
const total = (input: CashPnlInput, id: string, p = period) =>
  cashProfitLoss(input, p)
    .filter((e) => e.accountId === id)
    .reduce((s, e) => s + e.debit - e.credit, 0n);
function exception(fn: () => unknown) {
  try {
    fn();
    throw new Error("Expected classification exception");
  } catch (e) {
    const rows = cashClassificationExceptions(e);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.missingEvidence.length).toBeGreaterThan(0);
    return rows[0]!;
  }
}
describe("verified cash classifications", () => {
  it("requires explicit evidence rather than an account name or arbitrary target", () => {
    const i = empty();
    account(i, "prepaid", "asset", "prepaid");
    journal(i, "cash", "2026-11-02", "bank_transaction", [
      ["prepaid", 100n, 0n],
      [bankId, 0n, 100n],
    ]);
    const e = exception(() => cashProfitLoss(i, period));
    expect(e.amountMinor).toBe("100");
    expect(e.sourceAccountId).toBe("prepaid");
    expect(e.period).toEqual(period);
    expect(
      cashClassificationExceptions(
        new Error(String("CASH_CLASSIFICATION_EXCEPTION:") + JSON.stringify({ exceptions: [e] })),
      ),
    ).toEqual([e]);
  });
  it.each(["prepaid", "inventory"] as const)(
    "recognizes paid %s once and excludes subsequent noncash consumption",
    (kind) => {
      const i = empty();
      account(i, "asset", "asset", kind);
      const pay = journal(i, "pay", "2026-11-02", "bank_transaction", [
        ["asset", 100n, 0n],
        [bankId, 0n, 100n],
      ]);
      policy(i, "asset", expenseId, kind, [pay]);
      journal(i, "use", "2026-11-20", "manual", [
        [expenseId, 40n, 0n],
        ["asset", 0n, 40n],
      ]);
      expect(total(i, expenseId)).toBe(100n);
      expect(total(i, expenseId, { from: "2026-12-01", to: "2026-12-31" })).toBe(0n);
      expect(i.journals[0]!.lines[0]!.accountId).toBe("asset");
    },
  );
  it("recognizes deferred cash receipts without repeating liability releases", () => {
    const i = empty();
    account(i, "deferred", "liability", "deferred_revenue");
    const receipt = journal(i, "receipt", "2026-11-02", "bank_transaction", [
      [bankId, 100n, 0n],
      ["deferred", 0n, 100n],
    ]);
    policy(i, "deferred", revenueId, "deferred", [receipt]);
    journal(i, "release", "2026-11-15", "manual", [
      ["deferred", 30n, 0n],
      [revenueId, 0n, 30n],
    ]);
    expect(total(i, revenueId)).toBe(-100n);
    expect(cashLedger(i, period).reduce((s, e) => s + e.debit - e.credit, 0n)).toBe(0n);
  });
  it("rejects changed, foreign-tenant and future support", () => {
    for (const change of ["drift", "tenant", "future"]) {
      const i = empty();
      account(i, "prepaid", "asset", "prepaid");
      const pay = journal(i, "pay", "2026-11-02", "bank_transaction", [
        ["prepaid", 100n, 0n],
        [bankId, 0n, 100n],
      ]);
      const p = policy(i, "prepaid", expenseId, "prepaid", [pay]);
      if (change === "drift") {
        pay.lines[0]!.debit = 101n;
        pay.lines[1]!.credit = 101n;
      }
      if (change === "tenant") p.companyId = "foreign";
      if (change === "future") pay.date = "2026-12-01";
      if (change === "future") {
        journal(i, "earlier", "2026-11-02", "bank_transaction", [
          ["prepaid", 20n, 0n],
          [bankId, 0n, 20n],
        ]);
      }
      exception(() => cashProfitLoss(i, period));
    }
  });
  it("settles wages, deductions and employer taxes independently and excludes unpaid payroll", () => {
    const i = empty();
    for (const id of ["wages", "deductions", "employer"])
      account(i, id, "liability", "payroll_liability");
    const accrual = journal(i, "accrual", "2026-10-31", "payroll", [
      [expenseId, 120n, 0n],
      ["wages", 0n, 80n],
      ["deductions", 0n, 20n],
      ["employer", 0n, 20n],
    ]);
    policy(i, "wages", expenseId, "payroll_wages", [accrual]);
    policy(i, "deductions", expenseId, "payroll_deductions", [accrual]);
    policy(i, "employer", expenseId, "payroll_employer_tax", [accrual]);
    expect(total(i, expenseId)).toBe(0n);
    journal(i, "wagepay", "2026-11-02", "bank_transaction", [
      ["wages", 80n, 0n],
      [bankId, 0n, 80n],
    ]);
    journal(i, "taxpay", "2026-12-02", "bank_transaction", [
      ["deductions", 20n, 0n],
      ["employer", 20n, 0n],
      [bankId, 0n, 40n],
    ]);
    expect(total(i, expenseId)).toBe(80n);
    expect(total(i, expenseId, { from: "2026-12-01", to: "2026-12-31" })).toBe(40n);
    journal(i, "overpay", "2026-11-20", "bank_transaction", [
      ["wages", 1n, 0n],
      [bankId, 0n, 1n],
    ]);
    exception(() => cashProfitLoss(i, period));
  });
  it("requires payroll reversals to be evidenced and does not duplicate reversed accruals", () => {
    const i = empty();
    account(i, "wages", "liability", "payroll_liability");
    const accrual = journal(i, "accrual", "2026-10-30", "payroll", [
      [expenseId, 100n, 0n],
      ["wages", 0n, 100n],
    ]);
    const p = policy(i, "wages", expenseId, "payroll_wages", [accrual]);
    const reverse = journal(i, "reverse", "2026-10-31", "payroll", [
      ["wages", 100n, 0n],
      [expenseId, 0n, 100n],
    ]);
    journal(i, "pay", "2026-11-01", "bank_transaction", [
      ["wages", 10n, 0n],
      [bankId, 0n, 10n],
    ]);
    exception(() => cashProfitLoss(i, period));
    p.evidenceJournalIds.push(reverse.id);
    p.evidenceJournalSnapshots.push(cashJournalEvidenceSnapshot(reverse));
    exception(() => cashProfitLoss(i, period));
  });
});
function opening(mode: CashOpeningEvidence["mode"] = "recognize_on_settlement") {
  const i = cashInputFixture();
  account(i, "equity", "equity", "equity");
  i.journals = i.journals.filter((j) => !["invoice-journal", "bill-journal"].includes(j.id));
  const j = journal(i, "opening", "2026-09-30", "opening_balance", [
    [arId, 12000n, 0n],
    [apId, 0n, 9600n],
    [taxId, 0n, 400n],
    ["equity", 0n, 2000n],
  ]);
  i.openingEvidence = (
    [
      ["invoice", "sales_invoice", arId, 12000n, revenueId, 10000n, 2000n],
      ["bill", "purchase_bill", apId, 9600n, expenseId, 8000n, 1600n],
    ] as const
  ).map(([id, kind, control, gross, target, net, tax]) => ({
    id: `proof-${id}`,
    companyId: i.companyId,
    documentId: id,
    sourceKind: kind,
    postedJournalId: j.id,
    controlAccountId: control,
    equityAccountId: "equity",
    currency: "GBP",
    grossMinor: gross,
    components: [
      { accountId: target, amountMinor: net },
      { accountId: taxId, amountMinor: tax },
    ],
    mode,
    version: 1,
    effectiveFrom: j.date,
    effectiveTo: null,
    status: "approved",
    policyNote: "Verified historical outstanding document recognition",
    evidenceReference: "Historical original document",
    approvedBy: "reviewer",
    approvedAt: "2026-11-01",
    sourceJournalSnapshot: cashJournalEvidenceSnapshot(j),
  }));
  return i;
}
describe("imported opening document recognition", () => {
  it("recognizes verified historical AR/AP only when each payment occurs", () => {
    const i = opening();
    expect(total(i, revenueId)).toBe(-5000n);
    expect(total(i, expenseId)).toBe(4000n);
    const lines = cashLedger(i, { from: "2026-01-01", to: period.to });
    expect(lines.reduce((s, e) => s + e.debit - e.credit, 0n)).toBe(0n);
    expect(
      lines
        .filter((e) => e.accountId === arId || e.accountId === apId)
        .reduce((s, e) => s + e.debit - e.credit, 0n),
    ).toBe(0n);
    expect(total(i, revenueId, { from: "2026-09-01", to: "2026-09-30" })).toBe(0n);
  });
  it("does not recognize previously cash-recognized historical receipts twice", () => {
    const i = opening("already_recognized");
    expect(total(i, revenueId)).toBe(0n);
    expect(total(i, expenseId)).toBe(0n);
    expect(
      cashLedger(i, { from: "2026-01-01", to: period.to }).reduce(
        (s, e) => s + e.debit - e.credit,
        0n,
      ),
    ).toBe(0n);
  });
  it("reports missing or drifted opening evidence explicitly", () => {
    const i = opening();
    i.openingEvidence = [];
    exception(() => cashProfitLoss(i, period));
    const j = opening();
    j.openingEvidence![0]!.sourceJournalSnapshot.lines[0]!.debit_minor = "1";
    exception(() => cashProfitLoss(j, period));
  });
});

function stock() {
  const i = cashInputFixture();
  account(i, "stock", "asset", "inventory");
  const bill = i.journals.find((j) => j.id === "bill-journal")!;
  bill.lines.find((l) => l.accountId === expenseId)!.accountId = "stock";
  policy(i, "stock", expenseId, "inventory", [bill]);
  const sale = journal(i, "sale-cost", "2026-11-10", "inventory_adjustment", [
    [expenseId, 4000n, 0n],
    ["stock", 0n, 4000n],
  ]);
  const evidence: CashInventoryEvidence = {
    id: "sale-proof",
    companyId: i.companyId,
    purchaseDocumentId: "bill",
    purchaseJournalId: bill.id,
    inventoryAccountId: "stock",
    movementJournalId: sale.id,
    movementKind: "sale",
    costMinor: 4000n,
    reversesEvidenceId: null,
    evidenceReference: "Verified sale stock cost",
    policyNote: "Exact original purchase cost consumed by sale",
    status: "approved",
    version: 1,
    approvedBy: "reviewer",
    approvedAt: "2026-11-11",
    purchaseJournalSnapshot: cashJournalEvidenceSnapshot(bill),
    movementJournalSnapshot: cashJournalEvidenceSnapshot(sale),
  };
  i.inventoryEvidence = [evidence];
  return { i, bill, sale, evidence };
}
const trace = (i: CashPnlInput) =>
  traceCashInventory(i, cashLedger(i, { from: "0001-01-01", to: period.to }), period, ["stock"]);
describe("verified inventory cash-paid cost trace", () => {
  it.each([1n, 2n])(
    "traces partial/full purchase cash without adding accrual COGS (%s)",
    (multiple) => {
      const { i } = stock();
      for (const p of i.payments.filter((p) => p.side === "expense")) p.amount *= multiple;
      for (const a of i.allocations.filter((a) => a.documentId === "bill")) a.amount *= multiple;
      for (const l of i.journals.find((j) => j.id === "payment-journal")!.lines) {
        l.debit *= multiple;
        l.credit *= multiple;
      }
      const before = structuredClone(i);
      expect(total(i, expenseId)).toBe(4000n * multiple);
      const s = trace(i).sources[0]!;
      expect(s.cashPaidCostSoldMinor).toBe(String(2000n * multiple));
      expect(s.paidCostUnconsumedMinor).toBe(String(2000n * multiple));
      expect(i).toEqual(before);
    },
  );
  it("requires complete movement evidence and detects changed source snapshots", () => {
    const { i, evidence } = stock();
    i.inventoryEvidence = [];
    exception(() => trace(i));
    i.inventoryEvidence = [evidence];
    evidence.costMinor = 3999n;
    exception(() => trace(i));
    evidence.costMinor = 4000n;
    evidence.movementJournalSnapshot!.lines[0]!.debit_minor = "3999";
    exception(() => trace(i));
  });
  it("returns the original paid cost slices on a customer inventory return", () => {
    const { i, bill, evidence } = stock();
    const returned = journal(i, "customer-return", "2026-11-20", "inventory_adjustment", [
      ["stock", 2000n, 0n],
      [expenseId, 0n, 2000n],
    ]);
    i.inventoryEvidence!.push({
      ...evidence,
      id: "return-proof",
      movementJournalId: returned.id,
      movementKind: "customer_return",
      costMinor: 2000n,
      reversesEvidenceId: evidence.id,
      purchaseJournalSnapshot: cashJournalEvidenceSnapshot(bill),
      movementJournalSnapshot: cashJournalEvidenceSnapshot(returned),
    });
    const s = trace(i).sources[0]!;
    expect(s.soldCostMinor).toBe("2000");
    expect(s.cashPaidCostSoldMinor).toBe("1000");
    expect(s.paidCostUnconsumedMinor).toBe("3000");
    expect(total(i, expenseId)).toBe(4000n);
  });
  it("keeps unpaid sold stock out of the cash-paid cost metric", () => {
    const { i } = stock();
    i.payments = i.payments.filter((p) => p.side !== "expense");
    i.allocations = i.allocations.filter((a) => a.documentId !== "bill");
    i.journals = i.journals.filter((j) => j.id !== "payment-journal");
    expect(trace(i).sources[0]!.cashPaidCostSoldMinor).toBe("0");
    expect(total(i, expenseId)).toBe(0n);
  });
});

it("traces supplier returns and refunds without repeating purchase expense", () => {
  const { i, bill, evidence } = stock();
  const returned = journal(
    i,
    "supplier-credit",
    "2026-11-15",
    "purchase_credit_note",
    [
      [apId, 2400n, 0n],
      ["stock", 0n, 2000n],
      [taxId, 0n, 400n],
    ],
    "supplier-credit",
  );
  const refund = journal(i, "supplier-refund", "2026-11-20", "other", [
    [bankId, 1200n, 0n],
    [apId, 0n, 1200n],
  ]);
  i.refunds.push({
    id: "supplier-refund",
    companyId: i.companyId,
    side: "expense",
    journalId: refund.id,
    voidJournalId: null,
    currency: "GBP",
    rate: "1",
    amount: 1200n,
    uses: [
      {
        id: "credit-use",
        kind: "purchase_credit_note",
        documentId: "supplier-credit",
        amount: 1200n,
      },
    ],
  });
  i.inventoryEvidence!.push({
    ...evidence,
    id: "supplier-return-proof",
    movementJournalId: returned.id,
    movementKind: "supplier_return",
    costMinor: 2000n,
    reversesEvidenceId: null,
    purchaseJournalSnapshot: cashJournalEvidenceSnapshot(bill),
    movementJournalSnapshot: cashJournalEvidenceSnapshot(returned),
  });
  const s = trace(i).sources[0]!;
  expect(total(i, expenseId)).toBe(3000n);
  expect(s.cashPaidCostSoldMinor).toBe("2000");
  expect(s.paidCostUnconsumedMinor).toBe("1000");
  expect(s.supplierRefundMinor).toBe("1000");
  expect(s.returnedPaidCostMinor).toBe("0");
  expect(s.paidCostMinor).toBe("3000");
});
it("retains exact paid-cost rounding across periods and approved policy versions", () => {
  const { i } = stock();
  const old = i.classificationPolicies![0]!;
  i.classificationPolicies!.push({
    ...old,
    id: "revised-policy",
    version: 2,
    effectiveFrom: "2026-12-01",
  });
  const p = i.payments.find((p) => p.side === "expense")!;
  const original = i.journals.find((j) => j.id === p.journalId)!;
  const second = journal(
    i,
    "second-payment",
    "2026-12-02",
    "supplier_payment",
    original.lines.map((l) => [l.accountId, l.debit, l.credit]),
    "second-payment",
  );
  i.payments.push({ ...p, id: "second-payment", journalId: second.id });
  i.allocations.push({
    ...i.allocations.find((a) => a.documentId === "bill")!,
    id: "second-allocation",
    paymentId: "second-payment",
  });
  expect(total(i, expenseId)).toBe(4000n);
  expect(total(i, expenseId, { from: "2026-12-01", to: "2026-12-31" })).toBe(4000n);
  const result = traceCashInventory(
    i,
    cashLedger(i, { from: "0001-01-01", to: "2026-12-31" }),
    { from: "2026-12-01", to: "2026-12-31" },
    ["stock"],
  );
  expect(result.sources[0]!.cashPaidCostSoldMinor).toBe("4000");
  expect(result.movements.reduce((s, m) => s + BigInt(m.deltaPaidCostSoldMinor), 0n)).toBe(2000n);
});
it("excludes conversion P&L only through an explicitly verified equity policy", () => {
  const i = empty();
  account(i, "equity", "equity", "equity");
  const j = journal(i, "conversion", "2026-11-01", "opening_balance", [
    [bankId, 100n, 0n],
    [revenueId, 0n, 100n],
  ]);
  exception(() => cashLedger(i, period));
  policy(i, revenueId, "equity", "conversion", [j]);
  const lines = cashLedger(i, period);
  expect(lines.some((e) => e.accountId === revenueId)).toBe(false);
  expect(lines.reduce((s, e) => s + e.debit - e.credit, 0n)).toBe(0n);
});
it("permits verified balance-sheet treatment without inventing income or expense", () => {
  const i = empty();
  account(i, "deposit", "asset", "current_asset");
  account(i, "capital", "equity", "equity");
  const j = journal(i, "verified-capital", "2026-11-01", "manual", [
    ["deposit", 100n, 0n],
    ["capital", 0n, 100n],
  ]);
  exception(() => cashLedger(i, period));
  policy(i, "deposit", "deposit", "balance_sheet", [j]);
  expect(cashLedger(i, period).reduce((s, e) => s + e.debit - e.credit, 0n)).toBe(0n);
  expect(total(i, expenseId)).toBe(0n);
});
