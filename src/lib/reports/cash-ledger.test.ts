import { describe, it, expect } from "vitest";
import { cashLedger } from "./cash-ledger";
import { cashProfitLoss } from "./cash-profit-loss";
import { cashStandardFacts } from "./cash-standard";
import { buildReportDocument } from "./report-document";
import { standardSettingsSchema, encodeStandardSettings } from "./standard-settings";
import { cashInputFixture, arId, apId, taxId } from "./__fixtures__/cash-facts";
import { bankId, revenueId, expenseId, reportingFactsFixture } from "./__fixtures__/facts";

const period = { from: "0001-01-01", to: "2026-11-30" };
const net = (rows: ReturnType<typeof cashLedger>, id: string) =>
  rows.filter((r) => r.accountId === id).reduce((s, r) => s + r.debit - r.credit, 0n);
function sheet(input = cashInputFixture(), to = "2026-11-30") {
  const base = {
    ...reportingFactsFixture(),
    accounts: input.accounts,
    from: to.slice(0, 4) + "-01-01",
    to,
  };
  const settings = standardSettingsSchema.parse({ basis: "cash" });
  const facts = cashStandardFacts(base, input, settings, "balance-sheet");
  return {
    facts,
    doc: buildReportDocument(facts, {
      name: "Cash Balance Sheet",
      reportId: "balance-sheet",
      config: { settings: encodeStandardSettings(settings) },
    }),
  };
}
describe("balanced cash ledger and Balance Sheet", () => {
  it("replaces trade controls with settled net/tax and preserves the accounting equation", () => {
    const rows = cashLedger(cashInputFixture(), period);
    expect(net(rows, bankId)).toBe(1200n);
    expect(net(rows, taxId)).toBe(-200n);
    expect(net(rows, arId)).toBe(0n);
    expect(net(rows, apId)).toBe(0n);
    expect(net(rows, revenueId)).toBe(-5000n);
    expect(net(rows, expenseId)).toBe(4000n);
    expect(rows.reduce((s, r) => s + r.debit - r.credit, 0n)).toBe(0n);
    const { doc } = sheet();
    expect(doc.basis).toBe("cash");
    expect(doc.summary?.find((r) => r.label === "Assets")?.value).toBe("12.00");
    expect(doc.summary?.find((r) => r.label === "Liabilities")?.value).toBe("2.00");
    expect(doc.summary?.find((r) => r.label === "Equity")?.value).toBe("10.00");
  });
  it("splits prior cash earnings from current-year cash earnings", () => {
    const input = cashInputFixture();
    input.journals.find((j) => j.id === "invoice-journal")!.date = "2025-10-15";
    input.journals.find((j) => j.id === "receipt-journal")!.date = "2025-11-02";
    const { facts, doc } = sheet(input);
    expect(
      facts.standardColumns?.[0]?.bsPrior.find((r) => r.account_id === revenueId)?.credit_minor,
    ).toBe("5000");
    expect(doc.summary?.find((r) => r.label === "Current year earnings")?.value).toBe("-40.00");
    expect(doc.summary?.find((r) => r.label === "Equity")?.value).toBe("10.00");
  });
  it("includes opening equity, loans and capital purchases without expensing principal or assets", () => {
    const input = cashInputFixture();
    const equity = "77777777-7777-4777-8777-777777777777",
      asset = "88888888-8888-4888-8888-888888888888",
      loan = "99999999-9999-4999-8999-999999999999";
    for (const [id, type] of [
      [equity, "equity"],
      [asset, "asset"],
      [loan, "liability"],
    ] as const)
      input.accounts.push({
        ...input.accounts[0]!,
        id,
        code: id,
        name: id,
        account_type: type,
        subtype: type,
        account_kind: type,
        system_key: null,
      });
    const template = input.journals[0]!;
    for (const [id, date, sourceType, debit, credit, amount] of [
      ["opening", "2025-01-01", "opening_balance", bankId, equity, 10000n],
      ["loan", "2026-11-04", "other", bankId, loan, 5000n],
      ["capital", "2026-11-05", "other", asset, bankId, 2000n],
    ] as const)
      input.journals.push({
        ...template,
        id,
        date,
        sourceType,
        sourceId: id,
        lines: [
          { accountId: debit, debit: amount, credit: 0n },
          { accountId: credit, debit: 0n, credit: amount },
        ],
      });
    const rows = cashLedger(input, period);
    expect(net(rows, bankId)).toBe(14200n);
    expect(net(rows, asset)).toBe(2000n);
    expect(net(rows, loan)).toBe(-5000n);
    expect(cashProfitLoss(input, period).reduce((s, r) => s + r.credit - r.debit, 0n)).toBe(1000n);
    expect(sheet(input).doc.summary?.find((r) => r.label === "Assets")?.value).toBe("162.00");
  });
  it("cancels exact cash void pairs in the cumulative Balance Sheet", () => {
    const input = cashInputFixture(),
      original = input.journals.find((j) => j.id === "payment-journal")!;
    input.payments.find((p) => p.id === "payment")!.voidJournalId = "void";
    input.journals.push({
      ...original,
      id: "void",
      date: "2026-12-05",
      sourceType: "reversal",
      sourceId: null,
      reverses: original.id,
      lines: original.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
    });
    expect(net(cashLedger(input, period), expenseId)).toBe(4000n);
    const rows = cashLedger(input, { ...period, to: "2026-12-31" });
    expect(net(rows, expenseId)).toBe(0n);
    expect(net(rows, bankId)).toBe(6000n);
    expect(sheet(input, "2026-12-31").doc.summary?.find((r) => r.label === "Equity")?.value).toBe(
      "50.00",
    );
  });
});
