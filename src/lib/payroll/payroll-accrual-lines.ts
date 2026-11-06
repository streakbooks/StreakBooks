/** Pure helpers for payroll accrual journal lines (integer minor units, bigint-safe). */

export type PayrollAccrualLineInput = {
  kind: "earning" | "deduction" | "employer_contribution";
  amountMinor: bigint;
  expenseAccountId: string | null;
  liabilityAccountId: string | null;
};

export type PayrollAccrualSettingsAccounts = {
  salaryExpenseAccountId: string;
  netPayLiabilityAccountId: string;
  deductionLiabilityAccountId: string;
  employerExpenseAccountId: string;
  employerLiabilityAccountId: string;
};

export type PayrollAccrualJournalLine = {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
  description: string;
};

function mergeLine(
  map: Map<string, { debit: bigint; credit: bigint }>,
  accountId: string,
  debit: bigint,
  credit: bigint,
) {
  const cur = map.get(accountId) ?? { debit: 0n, credit: 0n };
  map.set(accountId, { debit: cur.debit + debit, credit: cur.credit + credit });
}

/**
 * Build balanced accrual lines from run component lines and settings defaults.
 * Credits net pay as a single liability line from runNetMinor (authoritative run total).
 */
export function buildPayrollAccrualJournalLines(
  lines: PayrollAccrualLineInput[],
  settings: PayrollAccrualSettingsAccounts,
  runNetMinor: bigint,
): PayrollAccrualJournalLine[] {
  const map = new Map<string, { debit: bigint; credit: bigint }>();

  for (const line of lines) {
    const amt = line.amountMinor;
    if (amt <= 0n) continue;
    if (line.kind === "earning") {
      const acct = line.expenseAccountId ?? settings.salaryExpenseAccountId;
      mergeLine(map, acct, amt, 0n);
    } else if (line.kind === "deduction") {
      const acct = line.liabilityAccountId ?? settings.deductionLiabilityAccountId;
      mergeLine(map, acct, 0n, amt);
    } else if (line.kind === "employer_contribution") {
      const exp = line.expenseAccountId ?? settings.employerExpenseAccountId;
      const liab = line.liabilityAccountId ?? settings.employerLiabilityAccountId;
      mergeLine(map, exp, amt, 0n);
      mergeLine(map, liab, 0n, amt);
    }
  }

  if (runNetMinor > 0n) {
    mergeLine(map, settings.netPayLiabilityAccountId, 0n, runNetMinor);
  }

  const out: PayrollAccrualJournalLine[] = [];
  for (const [accountId, { debit, credit }] of map) {
    const netDebit = debit - credit;
    if (netDebit > 0n) {
      out.push({
        accountId,
        debitMinor: netDebit,
        creditMinor: 0n,
        description: "Payroll accrual",
      });
    } else if (netDebit < 0n) {
      out.push({
        accountId,
        debitMinor: 0n,
        creditMinor: -netDebit,
        description: "Payroll accrual",
      });
    }
  }

  const totalDebit = out.reduce((s, l) => s + l.debitMinor, 0n);
  const totalCredit = out.reduce((s, l) => s + l.creditMinor, 0n);
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Payroll accrual lines do not balance: debits ${totalDebit} credits ${totalCredit}`,
    );
  }
  if (totalDebit === 0n) {
    throw new Error("Payroll accrual total cannot be zero");
  }

  return out.sort((a, b) => a.accountId.localeCompare(b.accountId));
}

export function sumAccrualDebits(lines: PayrollAccrualJournalLine[]): bigint {
  return lines.reduce((s, l) => s + l.debitMinor, 0n);
}
