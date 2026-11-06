/**
 * Read-only base-currency GL roll-forward for the configured Payroll net-pay
 * liability account, with in-period source run/payment-to-GL comparison.
 * This is not a bank reconciliation or full lifetime Payroll subledger proof.
 */
export type LiabilityLedgerLine = {
  line_id: string;
  journal_id: string;
  journal_date: string;
  source_type: string;
  source_id: string | null;
  account_id: string;
  debit_minor: bigint | number | string;
  credit_minor: bigint | number | string;
};
export type LiabilitySourceRun = {
  id: string; company_id: string; status: string; payment_date: string;
  currency: string; net_minor: number | string; accrual_journal_id: string | null;
};
export type LiabilitySourcePayment = {
  id: string; company_id: string; status: string; payment_date: string;
  currency: string; amount_minor: number | string; unallocated_minor: number | string;
  journal_id: string | null;
};
export type LiabilityRollforwardIssue = {
  kind: "missing_gl" | "amount_mismatch" | "currency" | "source" | "posting" | "data";
  sourceId: string | null;
  journalId: string | null;
  message: string;
};
export type LiabilityRollforwardResult = {
  status: "matched" | "exceptions" | "attention";
  currency: string; accountId: string; accountCode: string; accountName: string;
  start: string; end: string; lineCount: number; sourceRunCount: number; paymentCount: number;
  openingCreditMinor: string;
  accrualCreditMinor: string;
  paymentDebitMinor: string;
  reversalNetCreditMinor: string;
  otherNetCreditMinor: string;
  closingCreditMinor: string;
  reconstructedClosingCreditMinor: string;
  expectedRunAccrualCreditMinor: string;
  expectedPaymentDebitMinor: string;
  accrualVarianceMinor: string;
  paymentVarianceMinor: string;
  issues: LiabilityRollforwardIssue[];
  warnings: string[];
};
function minor(value: bigint | number | string, label: string): bigint {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(label + " must be an exact non-negative minor-unit integer.");
}
function realDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
type Sum = { debit: bigint; credit: bigint };
function add(map: Map<string, Sum>, id: string, debit: bigint, credit: bigint): void {
  const v = map.get(id) ?? { debit: 0n, credit: 0n };
  v.debit += debit; v.credit += credit;
  map.set(id, v);
}
export function calculatePayrollLiabilityRollforward(
  companyId: string, currency: string, accountId: string, accountCode: string,
  accountName: string, start: string, end: string,
  lines: readonly LiabilityLedgerLine[],
  runs: readonly LiabilitySourceRun[],
  payments: readonly LiabilitySourcePayment[],
): LiabilityRollforwardResult {
  if (!realDay(start) || !realDay(end) || start > end) {
    throw new Error("Select a valid accounting date range.");
  }
  if (!companyId || !accountId || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Payroll liability account or base currency is unavailable.");
  }
  const issues: LiabilityRollforwardIssue[] = [];
  const warnings: string[] = [];
  const issue = (kind: LiabilityRollforwardIssue["kind"], message: string, sourceId: string | null = null, journalId: string | null = null) =>
    issues.push({ kind, message, sourceId, journalId });
  let opening = 0n;
  let periodCredit = 0n;
  let periodDebit = 0n;
  let reversalNet = 0n;
  const journalTotals = new Map<string, Sum>();
  const journalSource = new Map<string, { source_type: string; source_id: string | null; date: string }>();
  const seenLedgerIds = new Set<string>();
  for (const [i, row] of lines.entries()) {
    if (!row.line_id || seenLedgerIds.has(row.line_id)) {
      issue("data", "Ledger evidence contains a missing or duplicated line identity.", null, row.journal_id);
    }
    seenLedgerIds.add(row.line_id);
    if (row.account_id !== accountId) {
      issue("data", "An unexpected account was included in Payroll GL evidence.", null, row.journal_id);
      continue;
    }
    if (!row.journal_id || !realDay(row.journal_date) || row.journal_date > end) {
      issue("data", "Ledger evidence has an invalid journal ID/date or lies after the period.", null, row.journal_id);
      continue;
    }
    const label = "Payroll ledger line " + (i + 1);
    let d: bigint, c: bigint;
    try {
      d = minor(row.debit_minor, label + " debit");
      c = minor(row.credit_minor, label + " credit");
    } catch (err) {
      issue("data", err instanceof Error ? err.message : label + " has invalid amounts.", null, row.journal_id);
      continue;
    }
    if ((d === 0n && c === 0n) || (d > 0n && c > 0n)) {
      issue("posting", label + " must have exactly one debit or credit side.", null, row.journal_id);
    }
     if (row.journal_date < start) opening += c - d;
    else {
      periodCredit += c; periodDebit += d;
      add(journalTotals, row.journal_id, d, c);
      const prior = journalSource.get(row.journal_id);
      if (prior && (prior.source_type !== row.source_type || prior.source_id !== row.source_id || prior.date !== row.journal_date)) {
        issue("data", "Journal source metadata differs between ledger rows.", row.source_id, row.journal_id);
      }
      journalSource.set(row.journal_id, {
        source_type: row.source_type, source_id: row.source_id, date: row.journal_date,
      });
      if (row.source_type === "reversal") reversalNet += c - d;
    }
  }

  const runIds = new Set<string>();
  const accrualJournals = new Set<string>();
  let expectedAccrual = 0n;
  let actualAccrual = 0n;
  for (const run of runs) {
    if (runIds.has(run.id) || run.company_id !== companyId || !run.id) {
      issue("source", "Payroll run evidence is duplicated or belongs to another organisation.", run.id);
    }
    runIds.add(run.id);
    if (!realDay(run.payment_date) || run.payment_date < start || run.payment_date > end ||
        !["posted", "paid", "complete"].includes(run.status)) {
      issue("source", "Payroll run source is outside the requested posted period.", run.id);
    }
    if (run.currency !== currency) {
      issue("currency", "Payroll run is not in company base currency; source amount cannot be compared without FX valuation.", run.id);
      continue;
    }
    let net: bigint;
    try { net = minor(run.net_minor, "Payroll run net pay"); }
    catch (err) { issue("data", err instanceof Error ? err.message : "Invalid Payroll run net pay.", run.id); continue; }
    expectedAccrual += net;
    if (!run.accrual_journal_id) {
      issue("missing_gl", "Posted Payroll run has no accrual journal reference.", run.id);
      continue;
    }
    if (accrualJournals.has(run.accrual_journal_id)) {
      issue("source", "Two active Payroll runs reference the same accrual journal.", run.id, run.accrual_journal_id);
    }
    accrualJournals.add(run.accrual_journal_id);
    const pair = journalTotals.get(run.accrual_journal_id);
    const source = journalSource.get(run.accrual_journal_id);
    if (!pair || !source || source.source_type !== "payroll" || source.source_id !== run.id ||
        source.date !== run.payment_date) {
      issue("missing_gl", "Payroll run accrual does not have a matching posted liability journal in this period.", run.id, run.accrual_journal_id);
      continue;
    }
    const creditNet = pair.credit - pair.debit;
    actualAccrual += creditNet;
    if (creditNet !== net) {
      issue("amount_mismatch", "Payroll run net-pay accrual differs from the configured liability account movement.", run.id, run.accrual_journal_id);
    }
  }

  const paymentIds = new Set<string>();
  const paymentJournals = new Set<string>();
  let expectedPayments = 0n;
  let actualPayments = 0n;
  for (const payment of payments) {
    if (paymentIds.has(payment.id) || payment.company_id !== companyId || !payment.id) {
      issue("source", "Payroll payment evidence is duplicated or belongs to another organisation.", payment.id);
    }
    paymentIds.add(payment.id);
    if (!realDay(payment.payment_date) || payment.payment_date < start || payment.payment_date > end ||
        !["posted", "reversed"].includes(payment.status)) {
      issue("source", "Payroll payment source is outside the requested period or has invalid status.", payment.id);
    }
    if (payment.currency !== currency) {
      issue("currency", "Payroll payment is not in company base currency; source amount cannot be compared without FX valuation.", payment.id);
      continue;
    }
    let amount: bigint, unallocated: bigint;
    try {
      amount = minor(payment.amount_minor, "Payroll payment amount");
      unallocated = minor(payment.unallocated_minor, "Unallocated payment amount");
    } catch (err) { issue("data", err instanceof Error ? err.message : "Invalid Payroll payment amount.", payment.id); continue; }
    if (amount === 0n || unallocated > amount) {
      issue("source", "Payroll payment amount or unallocated balance is invalid.", payment.id);
    }
    if (unallocated > 0n && payment.status === "posted") {
      warnings.push("Payroll payment " + payment.id + " includes unallocated net-pay funds.");
    }
    expectedPayments += amount;
    if (!payment.journal_id) {
      issue("missing_gl", "Posted Payroll payment has no linked journal.", payment.id);
      continue;
    }
    if (paymentJournals.has(payment.journal_id)) {
      issue("source", "Two Payroll payments reference the same journal.", payment.id, payment.journal_id);
    }
    paymentJournals.add(payment.journal_id);
    const pair = journalTotals.get(payment.journal_id);
    const source = journalSource.get(payment.journal_id);
    if (!pair || !source || source.source_type !== "payroll" || source.source_id !== payment.id ||
        source.date !== payment.payment_date) {
      issue("missing_gl", "Payroll payment does not have a matching posted liability journal in this period.", payment.id, payment.journal_id);
      continue;
    }
    const debitNet = pair.debit - pair.credit;
    actualPayments += debitNet;
    if (debitNet !== amount) {
      issue("amount_mismatch", "Payroll payment amount differs from the configured liability account debit.", payment.id, payment.journal_id);
    }
  }

  // A Payroll posting on the account without a matching active source must not
  // be hidden in "other adjustments" or reported as a clean source tie-out.
  for (const [journalId, source] of journalSource) {
    if (source.source_type === "payroll" &&
        !accrualJournals.has(journalId) && !paymentJournals.has(journalId)) {
      issue("source", "Posted Payroll liability movement has no matching in-period active run or payment source.", source.source_id, journalId);
    }
  }
  const sourceNet = actualAccrual - actualPayments;
  const totalPeriodNet = periodCredit - periodDebit;
  // All leftover GL movements are disclosed as a residual, not certified as
  // reconciled Payroll source activity. This can include manual entries,
  // reversal timing and unlinked accruals.
  const otherNet = totalPeriodNet - sourceNet - reversalNet;
  if (otherNet !== 0n) {
    warnings.push("Payroll control account has movements not explained by matched in-period Payroll sources or reversal journals.");
  }
  if (reversalNet !== 0n) {
    warnings.push("Reversal GL movements affect this period; review the original journal period and Payroll source status.");
  }
  const closing = opening + totalPeriodNet;
  const reconstructed = opening + sourceNet + reversalNet + otherNet;
  if (closing !== reconstructed) issue("data", "Period GL arithmetic and source classification do not agree.");

  return {
    status: issues.length ? "exceptions" : warnings.length ? "attention" : "matched",
    currency, accountId, accountCode, accountName, start, end,
    lineCount: lines.length, sourceRunCount: runs.length, paymentCount: payments.length,
    openingCreditMinor: opening.toString(),
    accrualCreditMinor: actualAccrual.toString(),
    paymentDebitMinor: actualPayments.toString(),
    reversalNetCreditMinor: reversalNet.toString(),
    otherNetCreditMinor: otherNet.toString(),
    closingCreditMinor: closing.toString(),
    reconstructedClosingCreditMinor: reconstructed.toString(),
    expectedRunAccrualCreditMinor: expectedAccrual.toString(),
    expectedPaymentDebitMinor: expectedPayments.toString(),
    accrualVarianceMinor: (actualAccrual - expectedAccrual).toString(),
    paymentVarianceMinor: (actualPayments - expectedPayments).toString(),
    issues, warnings,
  };
}
