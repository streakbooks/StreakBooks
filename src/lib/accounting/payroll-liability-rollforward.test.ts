import { describe, expect, it } from "vitest";
import {
  calculatePayrollLiabilityRollforward,
  type LiabilityLedgerLine,
  type LiabilitySourceRun,
  type LiabilitySourcePayment,
} from "./payroll-liability-rollforward";

const company = "company-1", account = "net-pay", from = "2026-11-01", to = "2026-11-30";
const opening: LiabilityLedgerLine = {
  line_id: "l0", journal_id: "opening", journal_date: "2026-10-01",
  source_type: "manual", source_id: null, account_id: account,
  debit_minor: 0, credit_minor: 500,
};
const accrual: LiabilityLedgerLine = {
  line_id: "l1", journal_id: "accrual-1", journal_date: "2026-11-06",
  source_type: "payroll", source_id: "run-1", account_id: account,
  debit_minor: 0, credit_minor: 1000,
};
const settlement: LiabilityLedgerLine = {
  line_id: "l2", journal_id: "payment-1", journal_date: "2026-11-10",
  source_type: "payroll", source_id: "pay-1", account_id: account,
  debit_minor: 800, credit_minor: 0,
};
const runs: LiabilitySourceRun[] = [{
  id: "run-1", company_id: company, status: "paid", currency: "GBP",
  payment_date: "2026-11-06", net_minor: "1000", accrual_journal_id: "accrual-1",
}];
const payments: LiabilitySourcePayment[] = [{
  id: "pay-1", company_id: company, status: "posted", currency: "GBP",
  payment_date: "2026-11-10", amount_minor: "800", unallocated_minor: "0",
  journal_id: "payment-1",
}];
const calculate = (
  lines: LiabilityLedgerLine[] = [opening, accrual, settlement],
  runRows: LiabilitySourceRun[] = runs,
  paymentRows: LiabilitySourcePayment[] = payments,
  start = from, end = to,
) => calculatePayrollLiabilityRollforward(
  company, "GBP", account, "2100", "Payroll net pay", start, end,
  lines, runRows, paymentRows,
);
describe("Payroll liability GL roll-forward", () => {
  it("matches opening + source accrual - source payment = closing in base currency", () => {
    const result = calculate();
    expect(result.status).toBe("matched");
    expect(result.openingCreditMinor).toBe("500");
    expect(result.accrualCreditMinor).toBe("1000");
    expect(result.paymentDebitMinor).toBe("800");
    expect(result.closingCreditMinor).toBe("700");
    expect(result.reconstructedClosingCreditMinor).toBe("700");
    expect(result.accrualVarianceMinor).toBe("0");
    expect(result.paymentVarianceMinor).toBe("0");
  });
  it("treats negative net liability as a debit balance, not an invalid negative amount", () => {
    const result = calculate([{ ...opening, credit_minor: 0, debit_minor: 600 }, accrual, settlement]);
    expect(result.status).toBe("matched");
    expect(result.closingCreditMinor).toBe("-400");
  });
  it("rejects source accrual differences from posted GL", () => {
    const result = calculate([opening, { ...accrual, credit_minor: 990 }, settlement]);
    expect(result.status).toBe("exceptions");
    expect(result.issues.some(x => x.kind === "amount_mismatch" && x.sourceId === "run-1")).toBe(true);
    expect(result.accrualVarianceMinor).toBe("-10");
  });
  it("rejects missing source-linked posted journal", () => {
    const result = calculate([opening, settlement]);
    expect(result.status).toBe("exceptions");
    expect(result.issues.some(x => x.kind === "missing_gl")).toBe(true);
    expect(result.expectedRunAccrualCreditMinor).toBe("1000");
    expect(result.accrualVarianceMinor).toBe("-1000");
  });
  it("rejects orphan Payroll posted journals without active run or payment source", () => {
    const result = calculate([opening, accrual, settlement], [], payments);
    expect(result.status).toBe("exceptions");
    expect(result.issues.some(x => x.message.includes("no matching in-period"))).toBe(true);
  });
  it("does not compare non-base-currency raw source amounts to base GL totals", () => {
    const result = calculate([opening, accrual, settlement],
      [{ ...runs[0]!, currency: "JPY" }], payments);
    expect(result.status).toBe("exceptions");
    expect(result.issues.some(x => x.kind === "currency")).toBe(true);
  });
  it("detects duplicate ledger line IDs and duplicate source IDs", () => {
    const result = calculate([opening, accrual, { ...settlement, line_id: accrual.line_id }],
      [runs[0]!, runs[0]!], payments);
    expect(result.status).toBe("exceptions");
    expect(result.issues.some(x => x.message.includes("duplicated line identity"))).toBe(true);
    expect(result.issues.some(x => x.message.includes("run evidence is duplicated"))).toBe(true);
  });
  it("marks unallocated Payroll cash payments as needing attention", () => {
    const result = calculate(undefined, runs, [{ ...payments[0]!, unallocated_minor: "50" }]);
    expect(result.status).toBe("attention");
    expect(result.warnings.some(x => x.includes("unallocated"))).toBe(true);
  });
  it("discloses manual adjustments as residual movements, not proof of source reconciliation", () => {
    const manual: LiabilityLedgerLine = {
      line_id: "l3", journal_id: "manual", journal_date: "2026-11-12",
      source_type: "manual", source_id: null, account_id: account,
      debit_minor: 0, credit_minor: 30,
    };
    const result = calculate([opening, accrual, settlement, manual]);
    expect(result.status).toBe("attention");
    expect(result.otherNetCreditMinor).toBe("30");
    expect(result.warnings.some(x => x.includes("not explained"))).toBe(true);
    expect(result.closingCreditMinor).toBe("730");
  });
  it("classifies reversal movement distinctly and calls out timing effects", () => {
    const reversal: LiabilityLedgerLine = {
      line_id: "l4", journal_id: "rev", journal_date: "2026-11-14",
      source_type: "reversal", source_id: "payment-1", account_id: account,
      debit_minor: 0, credit_minor: 800,
    };
    const result = calculate([opening, accrual, settlement, reversal], runs,
      [{ ...payments[0]!, status: "reversed" }]);
    expect(result.status).toBe("attention");
    expect(result.reversalNetCreditMinor).toBe("800");
    expect(result.closingCreditMinor).toBe("1500");
  });
  it("handles BigInt minor units exactly rather than rounding large balances", () => {
    const big = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
    const result = calculate([
      { ...opening, credit_minor: big, debit_minor: 0n },
      { ...accrual, credit_minor: big },
      { ...settlement, debit_minor: big },
    ], [{ ...runs[0]!, net_minor: big.toString() }],
      [{ ...payments[0]!, amount_minor: big.toString() }]);
    expect(result.status).toBe("matched");
    expect(result.closingCreditMinor).toBe(big.toString());
  });
  it("rejects unsafe JSON numbers and invalid source minor unit strings", () => {
    expect(calculate([{ ...opening, credit_minor: Number.MAX_SAFE_INTEGER + 1 }, accrual, settlement])
      .status).toBe("exceptions");
    expect(calculate(undefined, [{ ...runs[0]!, net_minor: "1000.01" }])
      .issues.some(x => x.kind === "data")).toBe(true);
  });
  it("rejects invalid period, mismatched company, wrong source and missing line identity", () => {
    expect(() => calculate(undefined, runs, payments, "2026-02-30")).toThrow(/valid accounting/);
    expect(() => calculate(undefined, runs, payments, to, from)).toThrow(/valid accounting/);
    expect(calculate(undefined, [{ ...runs[0]!, company_id: "other" }]).status).toBe("exceptions");
    expect(calculate([opening, { ...accrual, source_id: "other" }, settlement]).status).toBe("exceptions");
    expect(calculate([{ ...opening, line_id: "" }, accrual, settlement]).status).toBe("exceptions");
  });
  it("rejects posting GL evidence beyond the end date", () => {
    const result = calculate([opening, { ...accrual, journal_date: "2026-12-06" }, settlement]);
    expect(result.status).toBe("exceptions");
    expect(result.issues.some(x => x.kind === "data")).toBe(true);
  });
});
