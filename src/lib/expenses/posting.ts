/** Pure helpers for expense claim accrual journals (EM-06a). */

export type ExpenseAccrualLineInput = {
  accountId: string;
  description: string;
  netMinor: number;
  taxMinor: number;
};

export type BuiltJournalLine = {
  accountId: string;
  debitMinor: number;
  creditMinor: number;
  description: string;
};

export function buildEmployeePaidAccrualLines(input: {
  lines: ExpenseAccrualLineInput[];
  claimNumber: string;
  payableAccountId: string;
  inputTaxAccountId: string | null;
  headerTotalMinor: number;
}): { ok: true; lines: BuiltJournalLine[] } | { ok: false; error: string } {
  if (!input.payableAccountId) {
    return { ok: false, error: "Employee payable account is required." };
  }
  if (input.lines.length === 0) {
    return { ok: false, error: "Claim has no lines to post." };
  }

  const journalLines: BuiltJournalLine[] = [];
  let debitTotal = 0;
  let taxTotal = 0;

  for (const line of input.lines) {
    if (line.netMinor < 0 || line.taxMinor < 0) {
      return { ok: false, error: "Line amounts must be non-negative." };
    }
    if (line.netMinor > 0) {
      journalLines.push({
        accountId: line.accountId,
        debitMinor: line.netMinor,
        creditMinor: 0,
        description: line.description || input.claimNumber,
      });
      debitTotal += line.netMinor;
    }
    taxTotal += line.taxMinor;
  }

  if (taxTotal > 0) {
    if (!input.inputTaxAccountId) {
      return { ok: false, error: "Input tax account is not configured." };
    }
    journalLines.push({
      accountId: input.inputTaxAccountId,
      debitMinor: taxTotal,
      creditMinor: 0,
      description: `Input tax on ${input.claimNumber}`,
    });
    debitTotal += taxTotal;
  }

  if (debitTotal <= 0) {
    return { ok: false, error: "Claim has nothing to post." };
  }
  if (debitTotal !== input.headerTotalMinor) {
    return {
      ok: false,
      error: `Claim line totals do not match header total (${debitTotal} vs ${input.headerTotalMinor}).`,
    };
  }

  journalLines.push({
    accountId: input.payableAccountId,
    debitMinor: 0,
    creditMinor: debitTotal,
    description: `Employee payable ${input.claimNumber}`,
  });

  return { ok: true, lines: journalLines };
}
