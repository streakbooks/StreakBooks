// Synthetic posted journals and allocations for isolated tests/browser fixtures only.
import { reportingFactsFixture, bankId, revenueId, expenseId, testCompany } from "./facts";
import type { CashPnlInput, CashJournal } from "../cash-profit-loss";
export const arId = "44444444-4444-4444-8444-444444444444";
export const apId = "55555555-5555-4555-8555-555555555555";
export const taxId = "66666666-6666-4666-8666-666666666666";
export function cashInputFixture(): CashPnlInput {
  const accounts = reportingFactsFixture().accounts;
  const original = accounts[0]!;
  accounts.push({
    ...original,
    id: arId,
    code: "1100",
    name: "Receivables",
    account_type: "asset",
    account_kind: "accounts_receivable",
    subtype: "receivable",
    system_key: "ar",
    is_control: true,
  });
  accounts.push({
    ...original,
    id: apId,
    code: "2000",
    name: "Payables",
    account_type: "liability",
    account_kind: "accounts_payable",
    subtype: "payable",
    system_key: "ap",
    is_control: true,
  });
  accounts.push({
    ...original,
    id: taxId,
    code: "2100",
    name: "Tax",
    account_type: "liability",
    account_kind: "tax",
    subtype: "tax",
    system_key: "tax",
    is_control: true,
  });
  function journal(
    id: string,
    date: string,
    sourceType: string,
    sourceId: string,
    lines: Array<[string, bigint, bigint]>,
  ): CashJournal {
    return {
      id,
      companyId: testCompany,
      date,
      number: id,
      sourceType,
      sourceId,
      currency: "GBP",
      rate: "1",
      reverses: null,
      lines: lines.map(([accountId, debit, credit]) => ({ accountId, debit, credit })),
    };
  }
  return {
    companyId: testCompany,
    baseCurrency: "GBP",
    accounts,
    cashAccountIds: [bankId],
    journals: [
      journal("invoice-journal", "2026-10-15", "sales_invoice", "invoice", [
        [arId, 12000n, 0n],
        [revenueId, 0n, 10000n],
        [taxId, 0n, 2000n],
      ]),
      journal("bill-journal", "2026-10-15", "purchase_bill", "bill", [
        [expenseId, 8000n, 0n],
        [taxId, 1600n, 0n],
        [apId, 0n, 9600n],
      ]),
      journal("receipt-journal", "2026-11-02", "customer_payment", "receipt", [
        [bankId, 6000n, 0n],
        [arId, 0n, 6000n],
      ]),
      journal("payment-journal", "2026-11-03", "supplier_payment", "payment", [
        [apId, 4800n, 0n],
        [bankId, 0n, 4800n],
      ]),
    ],
    payments: [
      {
        id: "receipt",
        companyId: testCompany,
        side: "income",
        journalId: "receipt-journal",
        voidJournalId: null,
        currency: "GBP",
        rate: "1",
        amount: 6000n,
      },
      {
        id: "payment",
        companyId: testCompany,
        side: "expense",
        journalId: "payment-journal",
        voidJournalId: null,
        currency: "GBP",
        rate: "1",
        amount: 4800n,
      },
    ],
    allocations: [
      {
        id: "receipt-allocation",
        companyId: testCompany,
        paymentId: "receipt",
        documentId: "invoice",
        amount: 6000n,
        reversedOn: null,
      },
      {
        id: "payment-allocation",
        companyId: testCompany,
        paymentId: "payment",
        documentId: "bill",
        amount: 4800n,
        reversedOn: null,
      },
    ],
    refunds: [],
  };
}
