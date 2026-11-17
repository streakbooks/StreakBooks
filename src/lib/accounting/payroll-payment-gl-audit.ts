/** Read-only Payroll payment / net-pay liability to posted GL evidence review. */
export type PaymentAuditPayment = {
  id: string;
  company_id: string;
  payment_date: string;
  amount_minor: number | string;
  unallocated_minor: number | string;
  currency: string;
  clearing_account_id: string;
  journal_id: string | null;
  status: string;
  idempotency_key: string | null;
  reversal_journal_id: string | null;
};
export type PaymentAuditAllocation = {
  id: string;
  company_id: string;
  payment_id: string;
  payslip_id: string;
  run_id: string;
  run_employee_id: string;
  amount_minor: number | string;
};
export type PaymentAuditPayslip = {
  id: string;
  company_id: string;
  run_id: string;
  run_employee_id: string;
};
export type PaymentAuditRun = {
  id: string;
  company_id: string;
  status: string;
  accrual_journal_id: string | null;
};
export type PaymentAuditJournal = {
  id: string;
  company_id: string;
  status: string;
  source_type: string;
  source_id: string | null;
  idempotency_key: string | null;
  journal_date: string;
  currency_code: string;
  reverses_journal_id: string | null;
  reversed_by_journal_id: string | null;
};
export type PaymentAuditGlLine = {
  id: string;
  company_id: string;
  journal_id: string;
  line_no: number;
  account_id: string;
  debit_minor: number | string;
  credit_minor: number | string;
};
export type PaymentAuditAccount = {
  id: string;
  company_id: string;
  code: string;
  name: string;
};
export type PaymentAuditTotals = {
  debitMinor: string;
  creditMinor: string;
};
export type PaymentAuditResult = {
  state: "matched" | "attention" | "reversed" | "exceptions";
  paymentId: string;
  journalId: string;
  currency: string;
  allocationCount: number;
  originalLineCount: number;
  reversalLineCount: number;
  paymentMinor: string | null;
  allocatedMinor: string | null;
  unallocatedMinor: string | null;
  originalTotals: PaymentAuditTotals;
  reversalTotals: PaymentAuditTotals | null;
  accounts: Array<{
    accountId: string;
    code: string;
    name: string;
    side: "debit" | "credit";
    expectedOriginalMinor: string;
    actualOriginalMinor: string;
    expectedReversalMinor: string | null;
    actualReversalMinor: string | null;
    matched: boolean;
  }>;
  issues: string[];
  warnings: string[];
};
function minor(value: number | string, label: string): bigint {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(label + " must be an exact non-negative minor-unit integer.");
}
function sumSides(
  lines: readonly PaymentAuditGlLine[],
  company: string,
  journal: string,
  issues: string[],
  kind: string,
) {
  const map = new Map<string, bigint>();
  const seenIds = new Set<string>();
  const seenLineNumbers = new Set<number>();
  let debits = 0n;
  let credits = 0n;
  for (const [index, line] of lines.entries()) {
    const label = kind + " line " + (index + 1);
    if (!line.id || seenIds.has(line.id)) issues.push(label + " has a duplicate or missing ID.");
    seenIds.add(line.id);
    if (line.company_id !== company || line.journal_id !== journal)
      issues.push(label + " is cross-organisation or belongs to another journal.");
    if (
      !Number.isSafeInteger(line.line_no) ||
      line.line_no < 1 ||
      seenLineNumbers.has(line.line_no)
    ) {
      issues.push(label + " has an invalid or duplicate line number.");
    }
    seenLineNumbers.add(line.line_no);
    if (!line.account_id) issues.push(label + " has no account.");
    try {
      const debit = minor(line.debit_minor, label + " debit");
      const credit = minor(line.credit_minor, label + " credit");
      if ((debit === 0n && credit === 0n) || (debit !== 0n && credit !== 0n)) {
        issues.push(label + " must have one non-zero debit or credit side.");
      }
      if (debit > 0n)
        map.set(line.account_id + "|debit", (map.get(line.account_id + "|debit") ?? 0n) + debit);
      if (credit > 0n)
        map.set(line.account_id + "|credit", (map.get(line.account_id + "|credit") ?? 0n) + credit);
      debits += debit;
      credits += credit;
    } catch (e) {
      issues.push(e instanceof Error ? e.message : label + " amount invalid.");
    }
  }
  if (lines.length !== 2)
    issues.push(kind + " payment journal must contain exactly two ledger lines.");
  if (debits === 0n || credits === 0n || debits !== credits)
    issues.push(kind + " journal debits and credits do not balance.");
  return { map, debits, credits };
}
/**
 * Verifies a single payment's source allocations and direct GL postings. Does
 * not assert total run or payslip outstanding (other payments may exist).
 * Current account settings can differ from the historical posting settings.
 */
export function reviewPayrollPaymentGl(
  company: string,
  payment: PaymentAuditPayment,
  allocations: readonly PaymentAuditAllocation[],
  payslips: readonly PaymentAuditPayslip[],
  runs: readonly PaymentAuditRun[],
  original: PaymentAuditJournal,
  reversal: PaymentAuditJournal | null,
  originalLines: readonly PaymentAuditGlLine[],
  reversalLines: readonly PaymentAuditGlLine[],
  accounts: readonly PaymentAuditAccount[],
  netPayLiabilityAccountId: string | null,
): PaymentAuditResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const reversed = payment.status === "reversed";
  if (!["posted", "reversed"].includes(payment.status))
    issues.push("Payroll payment status is invalid.");
  if (payment.company_id !== company || original.company_id !== company)
    issues.push("Payment or original journal is from another organisation.");
  if (!payment.id || payment.journal_id !== original.id)
    issues.push("Payment does not link to the selected journal.");
  if (original.reverses_journal_id)
    issues.push("Original Payroll payment journal unexpectedly reverses another journal.");
  if (
    original.status !== "posted" ||
    original.source_type !== "payroll" ||
    original.source_id !== payment.id
  ) {
    issues.push("Original GL journal is not a posted journal sourced from this payment.");
  }
  if (
    payment.currency !== original.currency_code ||
    payment.payment_date !== original.journal_date
  ) {
    issues.push("Payroll payment currency or date differs from its GL journal.");
  }
  const expectedKey = (payment.idempotency_key ?? "payroll-payment:" + payment.id) + ":post";
  if (original.idempotency_key !== expectedKey)
    issues.push("Original GL posting key does not match the payment.");
  if (!payment.clearing_account_id || !netPayLiabilityAccountId)
    issues.push("Payroll liability or clearing-account configuration is missing.");
  if (reversed) {
    if (
      !payment.reversal_journal_id ||
      original.reversed_by_journal_id !== payment.reversal_journal_id
    ) {
      issues.push("Payment reversal ID and the original journal reversal link disagree.");
    }
    if (
      !reversal ||
      reversal.id !== payment.reversal_journal_id ||
      reversal.company_id !== company ||
      reversal.status !== "posted" ||
      reversal.reverses_journal_id !== original.id ||
      reversal.source_type !== "reversal" ||
      reversal.source_id !== original.id ||
      reversal.currency_code !== original.currency_code ||
      reversal.idempotency_key !== "payroll-payment:" + payment.id + ":reverse" ||
      reversal.reversed_by_journal_id
    ) {
      issues.push("Payment reversal journal is missing, not posted or not linked to the original.");
    }
  } else if (payment.reversal_journal_id || original.reversed_by_journal_id || reversal) {
    issues.push("An active payroll payment unexpectedly has a reversal journal.");
  }

  let amount: bigint | null = null;
  let unallocated: bigint | null = null;
  let allocated = 0n;
  try {
    amount = minor(payment.amount_minor, "Payment amount");
    unallocated = minor(payment.unallocated_minor, "Unallocated amount");
    if (amount === 0n) issues.push("Payment amount must be positive.");
  } catch (e) {
    issues.push(e instanceof Error ? e.message : "Payment monetary evidence invalid.");
  }

  const payslipMap = new Map<string, PaymentAuditPayslip>();
  for (const p of payslips) {
    if (!p.id || payslipMap.has(p.id) || p.company_id !== company)
      issues.push("Payslip source evidence is duplicated or from another organisation.");
    payslipMap.set(p.id, p);
  }
  const runMap = new Map<string, PaymentAuditRun>();
  for (const r of runs) {
    if (!r.id || runMap.has(r.id) || r.company_id !== company)
      issues.push("Payroll run source evidence is duplicated or from another organisation.");
    runMap.set(r.id, r);
  }
  const seenAlloc = new Set<string>();
  const seenPayslip = new Set<string>();
  for (const [index, allocation] of allocations.entries()) {
    const label = "Payment allocation " + (index + 1);
    if (
      !allocation.id ||
      seenAlloc.has(allocation.id) ||
      allocation.company_id !== company ||
      allocation.payment_id !== payment.id ||
      seenPayslip.has(allocation.payslip_id)
    ) {
      issues.push(label + " is duplicated, cross-company or references a different payment.");
    }
    seenAlloc.add(allocation.id);
    seenPayslip.add(allocation.payslip_id);
    const payslip = payslipMap.get(allocation.payslip_id);
    if (
      !payslip ||
      payslip.run_id !== allocation.run_id ||
      payslip.run_employee_id !== allocation.run_employee_id
    ) {
      issues.push(label + " does not match its linked payslip and run employee.");
    }
    const run = runMap.get(allocation.run_id);
    if (!run || !run.accrual_journal_id || !["posted", "paid", "complete"].includes(run.status)) {
      issues.push(label + " does not belong to an eligible posted payroll run.");
    }
    try {
      const value = minor(allocation.amount_minor, label);
      if (value === 0n) issues.push(label + " amount must be positive.");
      allocated += value;
    } catch (e) {
      issues.push(e instanceof Error ? e.message : label + " amount invalid.");
    }
  }
  for (const payslip of payslips) {
    if (!seenPayslip.has(payslip.id))
      issues.push("Payslip evidence was returned without a payment allocation.");
  }
  const allocatedRuns = new Set(allocations.map((a) => a.run_id));
  for (const run of runs) {
    if (!allocatedRuns.has(run.id))
      issues.push("Payroll run evidence was returned without a payment allocation.");
  }
  if (amount !== null && unallocated !== null && allocated + unallocated !== amount) {
    issues.push("Allocated plus unallocated minor units do not equal the payment amount.");
  }
  if (unallocated !== null && unallocated > 0n && !reversed) {
    warnings.push(
      "Payment includes unallocated net-pay amounts; investigate liability allocation.",
    );
  }

  const o = sumSides(originalLines, company, original.id, issues, "Original");
  const rev = reversal ? sumSides(reversalLines, company, reversal.id, issues, "Reversal") : null;
  if (!reversed && reversalLines.length)
    issues.push("Unexpected reversal ledger lines for an active payment.");
  if (reversed && !rev) issues.push("Reversed payment has no reversal posting evidence.");
  const expectedOriginal = new Map<string, bigint>();
  const expectedReverse = new Map<string, bigint>();
  if (amount !== null && payment.clearing_account_id && netPayLiabilityAccountId) {
    expectedOriginal.set(netPayLiabilityAccountId + "|debit", amount);
    expectedOriginal.set(payment.clearing_account_id + "|credit", amount);
    expectedReverse.set(netPayLiabilityAccountId + "|credit", amount);
    expectedReverse.set(payment.clearing_account_id + "|debit", amount);
  }
  const accountMap = new Map<string, PaymentAuditAccount>();
  for (const acc of accounts) {
    if (!acc.id || accountMap.has(acc.id) || acc.company_id !== company || !acc.code?.trim()) {
      issues.push("GL account evidence is invalid or belongs to another organisation.");
    }
    accountMap.set(acc.id, acc);
  }
  const keys = [
    ...new Set([
      ...expectedOriginal.keys(),
      ...o.map.keys(),
      ...(reversed ? [...expectedReverse.keys(), ...(rev ? [...rev.map.keys()] : [])] : []),
    ]),
  ].sort();
  const rows = keys.map((key) => {
    const pos = key.lastIndexOf("|");
    const id = key.slice(0, pos);
    const side = key.slice(pos + 1) as "debit" | "credit";
    const account = accountMap.get(id);
    if (!account) issues.push("GL account is missing or not authorised: " + id);
    const expected = expectedOriginal.get(key) ?? 0n;
    const actual = o.map.get(key) ?? 0n;
    const reverseKey = id + "|" + (side === "debit" ? "credit" : "debit");
    const er = reversed ? (expectedReverse.get(reverseKey) ?? 0n) : null;
    const ar = reversed ? (rev?.map.get(reverseKey) ?? 0n) : null;
    const ok = expected === actual && (er === null || er === ar);
    if (!ok) issues.push("GL discrepancy for account " + id + " " + side + ".");
    return {
      accountId: id,
      code: account?.code ?? "",
      name: account?.name ?? "",
      side,
      expectedOriginalMinor: expected.toString(),
      actualOriginalMinor: actual.toString(),
      expectedReversalMinor: er?.toString() ?? null,
      actualReversalMinor: ar?.toString() ?? null,
      matched: ok,
    };
  });
  // Reversal-only unexpected account/side must not escape the account comparison.
  if (rev)
    for (const [key, val] of rev.map) {
      if ((expectedReverse.get(key) ?? 0n) !== val)
        issues.push("Unexpected reversal account/side or amount: " + key + ".");
    }
  if (!rows.length) issues.push("GL payment account evidence is missing.");
  const originalTotals = { debitMinor: o.debits.toString(), creditMinor: o.credits.toString() };
  const reversalTotals = rev
    ? { debitMinor: rev.debits.toString(), creditMinor: rev.credits.toString() }
    : null;
  const state: PaymentAuditResult["state"] = issues.length
    ? "exceptions"
    : reversed
      ? "reversed"
      : warnings.length
        ? "attention"
        : "matched";
  return {
    state,
    paymentId: payment.id,
    journalId: original.id,
    currency: payment.currency,
    allocationCount: allocations.length,
    originalLineCount: originalLines.length,
    reversalLineCount: reversalLines.length,
    paymentMinor: amount?.toString() ?? null,
    allocatedMinor: allocated.toString(),
    unallocatedMinor: unallocated?.toString() ?? null,
    originalTotals,
    reversalTotals,
    accounts: rows,
    issues,
    warnings,
  };
}
