import { describe, expect, it } from "vitest";
import {
  reviewPayrollPaymentGl, type PaymentAuditPayment,
  type PaymentAuditAllocation, type PaymentAuditPayslip,
  type PaymentAuditRun, type PaymentAuditJournal, type PaymentAuditGlLine,
  type PaymentAuditAccount,
} from "./payroll-payment-gl-audit";
const company = "c1";
const payment: PaymentAuditPayment = {
  id: "pay1", company_id: company, payment_date: "2026-11-06",
  amount_minor: "1000", unallocated_minor: "200", currency: "GBP",
  clearing_account_id: "cash", journal_id: "j1", status: "posted",
  idempotency_key: null, reversal_journal_id: null,
};
const original: PaymentAuditJournal = {
  id: "j1", company_id: company, status: "posted", source_type: "payroll",
  source_id: "pay1", idempotency_key: "payroll-payment:pay1:post",
  journal_date: "2026-11-06", currency_code: "GBP", reverses_journal_id: null,
  reversed_by_journal_id: null,
};
const allocations: PaymentAuditAllocation[] = [{
  id: "a1", company_id: company, payment_id: "pay1", payslip_id: "ps1",
  run_id: "r1", run_employee_id: "re1", amount_minor: "800",
}];
const payslips: PaymentAuditPayslip[] = [
  { id: "ps1", company_id: company, run_id: "r1", run_employee_id: "re1" },
];
const runs: PaymentAuditRun[] = [{
  id: "r1", company_id: company, status: "paid", accrual_journal_id: "accrual-j",
}];
const lines: PaymentAuditGlLine[] = [
  { id: "l1", company_id: company, journal_id: "j1", line_no: 1,
    account_id: "net", debit_minor: "1000", credit_minor: "0" },
  { id: "l2", company_id: company, journal_id: "j1", line_no: 2,
    account_id: "cash", debit_minor: "0", credit_minor: "1000" },
];
const accounts: PaymentAuditAccount[] = [
  { id: "net", company_id: company, code: "2100", name: "Net pay liability" },
  { id: "cash", company_id: company, code: "1000", name: "Cash" },
];
const opts = (o: {
  payment?: PaymentAuditPayment; allocations?: PaymentAuditAllocation[];
  payslips?: PaymentAuditPayslip[]; runs?: PaymentAuditRun[];
  original?: PaymentAuditJournal; reversal?: PaymentAuditJournal | null;
  lines?: PaymentAuditGlLine[]; reversalLines?: PaymentAuditGlLine[];
  accounts?: PaymentAuditAccount[]; netAccount?: string | null;
} = {}) => reviewPayrollPaymentGl(
  company, o.payment ?? payment, o.allocations ?? allocations,
  o.payslips ?? payslips, o.runs ?? runs,
  o.original ?? original, o.reversal ?? null,
  o.lines ?? lines, o.reversalLines ?? [], o.accounts ?? accounts,
  o.netAccount === undefined ? "net" : o.netAccount,
);
const reversal: PaymentAuditJournal = {
  ...original, id: "jr", source_type: "reversal", source_id: "pay1",
  idempotency_key: "payroll-payment:pay1:reverse",
  reverses_journal_id: original.id, reversed_by_journal_id: null,
};
const reversalLines: PaymentAuditGlLine[] = [
  { ...lines[0]!, id: "rl1", journal_id: reversal.id, debit_minor: "0", credit_minor: "1000" },
  { ...lines[1]!, id: "rl2", journal_id: reversal.id, debit_minor: "1000", credit_minor: "0" },
];

describe("Payroll payment / net-pay liability to GL audit", () => {
  it("flags correctly posted but partly unallocated payment as attention, not a completed liability settlement", () => {
    const a = opts();
    expect(a.state).toBe("attention");
    expect(a.allocatedMinor).toBe("800");
    expect(a.unallocatedMinor).toBe("200");
    expect(a.originalTotals).toEqual({ debitMinor: "1000", creditMinor: "1000" });
    expect(a.accounts.every(x => x.matched)).toBe(true);
  });
  it("matches fully allocated, balanced, active payment", () => {
    expect(opts({ payment: { ...payment, unallocated_minor: "0" },
      allocations: [{ ...allocations[0]!, amount_minor: "1000" }],
    }).state).toBe("matched");
  });
  it("validates allocation, payslip and run links", () => {
    expect(opts({ allocations: [{ ...allocations[0]!, amount_minor: "801" }] }).issues.join(" "))
      .toMatch(/Allocated plus unallocated/);
    expect(opts({ payslips: [{ ...payslips[0]!, run_id: "other" }] }).state).toBe("exceptions");
    expect(opts({ runs: [{ ...runs[0]!, accrual_journal_id: null }] }).state).toBe("exceptions");
    expect(opts({ allocations: [...allocations, { ...allocations[0]!, id: "a2" }] }).state).toBe("exceptions");
  });
  it("detects original journal source, idempotency and currency mismatches", () => {
    expect(opts({ original: { ...original, source_id: "other" } }).state).toBe("exceptions");
    expect(opts({ original: { ...original, idempotency_key: "wrong" } }).state).toBe("exceptions");
    expect(opts({ original: { ...original, currency_code: "JPY" } }).state).toBe("exceptions");
  });
  it("rejects wrong GL account, amount, line count and duplicate evidence", () => {
    expect(opts({ lines: [{ ...lines[0]!, account_id: "other" }, lines[1]!] }).state).toBe("exceptions");
    expect(opts({ lines: [{ ...lines[0]!, debit_minor: "1001" }, lines[1]!] }).state).toBe("exceptions");
    expect(opts({ lines: lines.slice(0, 1) }).state).toBe("exceptions");
    expect(opts({ lines: [lines[0]!, { ...lines[1]!, line_no: 1 }] }).state).toBe("exceptions");
  });
  it("rejects cross-company accounts or missing original liability account", () => {
    expect(opts({ accounts: [{ ...accounts[0]!, company_id: "other" }, accounts[1]!] }).state).toBe("exceptions");
    expect(opts({ netAccount: null }).state).toBe("exceptions");
  });
  it("validates exact currency minor units and avoids JS rounding", () => {
    const huge = "9007199254740993";
    const a = opts({
      payment: { ...payment, amount_minor: huge, unallocated_minor: "0" },
      allocations: [{ ...allocations[0]!, amount_minor: huge }],
      lines: [
        { ...lines[0]!, debit_minor: huge },
        { ...lines[1]!, credit_minor: huge },
      ],
    });
    expect(a.state).toBe("matched");
    expect(a.paymentMinor).toBe(huge);
    expect(opts({ payment: { ...payment, amount_minor: Number.MAX_SAFE_INTEGER + 1 } }).state).toBe("exceptions");
    expect(opts({ lines: [{ ...lines[0]!, debit_minor: "10.75" }, lines[1]!] }).state).toBe("exceptions");
  });
  it("accepts a correctly reversed payment and original journal reciprocal link", () => {
    const p = { ...payment, status: "reversed", reversal_journal_id: "jr" };
    const o = { ...original, reversed_by_journal_id: "jr" };
    const a = opts({ payment: p, original: o, reversal, reversalLines });
    expect(a.state).toBe("reversed");
    expect(a.reversalTotals).toEqual({ debitMinor: "1000", creditMinor: "1000" });
  });
  it("fails closed if reversal is absent, unposted or has mismatched amounts", () => {
    const p = { ...payment, status: "reversed", reversal_journal_id: "jr" };
    const o = { ...original, reversed_by_journal_id: "jr" };
    expect(opts({ payment: p, original: o }).state).toBe("exceptions");
    expect(opts({ payment: p, original: o,
      reversal: { ...reversal, status: "draft" }, reversalLines }).state).toBe("exceptions");
    expect(opts({ payment: p, original: o, reversal,
      reversalLines: [{ ...reversalLines[0]!, credit_minor: "999" }, reversalLines[1]!] }).state).toBe("exceptions");
  });
  it("rejects an active payment where an unexpected reversal exists", () => {
    expect(opts({ original: { ...original, reversed_by_journal_id: "jr" } }).state).toBe("exceptions");
  });
  it("correctly handles liability and clearing account being identical: debit and credit remain separate", () => {
    const a = opts({ payment: { ...payment, clearing_account_id: "net", unallocated_minor: "0" },
      allocations: [{ ...allocations[0]!, amount_minor: "1000" }],
      lines: [{ ...lines[0]! }, { ...lines[1]!, account_id: "net" }] });
    expect(a.state).toBe("matched");
    expect(a.accounts).toHaveLength(2);
  });
});
