import { describe, expect, it } from "vitest";
import {
  buildPayrollAccrualJournalLines,
  sumAccrualDebits,
  type PayrollAccrualSettingsAccounts,
} from "@/lib/payroll/payroll-accrual-lines";

const settings: PayrollAccrualSettingsAccounts = {
  salaryExpenseAccountId: "salary-exp",
  netPayLiabilityAccountId: "net-liab",
  deductionLiabilityAccountId: "ded-liab",
  employerExpenseAccountId: "er-exp",
  employerLiabilityAccountId: "er-liab",
};

describe("buildPayrollAccrualJournalLines", () => {
  it("balances a simple gross / deduction / net accrual", () => {
    const lines = buildPayrollAccrualJournalLines(
      [
        { kind: "earning", amountMinor: 100_000n, expenseAccountId: null, liabilityAccountId: null },
        { kind: "deduction", amountMinor: 20_000n, expenseAccountId: null, liabilityAccountId: null },
      ],
      settings,
      80_000n,
    );
    const debit = sumAccrualDebits(lines);
    const credit = lines.reduce((s, l) => s + l.creditMinor, 0n);
    expect(debit).toBe(credit);
    expect(debit).toBe(100_000n);
    expect(lines.find((l) => l.accountId === "net-liab")?.creditMinor).toBe(80_000n);
    expect(lines.find((l) => l.accountId === "ded-liab")?.creditMinor).toBe(20_000n);
  });

  it("uses per-component expense accounts for earnings", () => {
    const lines = buildPayrollAccrualJournalLines(
      [
        {
          kind: "earning",
          amountMinor: 50_000n,
          expenseAccountId: "bonus-exp",
          liabilityAccountId: null,
        },
        {
          kind: "earning",
          amountMinor: 50_000n,
          expenseAccountId: "salary-exp",
          liabilityAccountId: null,
        },
      ],
      settings,
      100_000n,
    );
    expect(lines.find((l) => l.accountId === "bonus-exp")?.debitMinor).toBe(50_000n);
    expect(lines.find((l) => l.accountId === "salary-exp")?.debitMinor).toBe(50_000n);
  });

  it("posts employer contribution expense and liability", () => {
    const lines = buildPayrollAccrualJournalLines(
      [
        { kind: "earning", amountMinor: 100_000n, expenseAccountId: null, liabilityAccountId: null },
        {
          kind: "employer_contribution",
          amountMinor: 12_000n,
          expenseAccountId: null,
          liabilityAccountId: null,
        },
      ],
      settings,
      100_000n,
    );
    expect(lines.find((l) => l.accountId === "er-exp")?.debitMinor).toBe(12_000n);
    expect(lines.find((l) => l.accountId === "er-liab")?.creditMinor).toBe(12_000n);
    const debit = sumAccrualDebits(lines);
    const credit = lines.reduce((s, l) => s + l.creditMinor, 0n);
    expect(debit).toBe(credit);
  });
});
