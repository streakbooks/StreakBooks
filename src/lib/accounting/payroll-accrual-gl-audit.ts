/** Payroll source-to-posted-GL accrual audit. Read-only; mirrors SQL post_payroll_run. */
export type PayrollAuditRun = {
  id: string; company_id: string; run_number: string; status: string;
  currency: string; payment_date: string; net_minor: number | string;
  accrual_journal_id: string | null; posting_idempotency_key: string | null;
};
export type PayrollAuditSettings = {
  company_id: string;
  salary_expense_account_id: string | null;
  deduction_liability_account_id: string | null;
  employer_expense_account_id: string | null;
  employer_liability_account_id: string | null;
  net_pay_liability_account_id: string | null;
};
export type PayrollAuditEmployee = {
  id: string; company_id: string; run_id: string; status: string;
};
export type PayrollAuditSourceLine = {
  id: string; company_id: string; run_employee_id: string;
  component_type_id: string | null;
  kind: string; amount_minor: number | string;
};
export type PayrollAuditComponent = {
  id: string; company_id: string; expense_account_id: string | null;
  liability_account_id: string | null;
};
export type PayrollAuditJournal = {
  id: string; company_id: string; status: string; source_type: string;
  source_id: string | null; idempotency_key: string | null;
  currency_code: string; journal_date: string;
  reversed_by_journal_id: string | null;
};
export type PayrollAuditGlLine = {
  id: string; company_id: string; journal_id: string;
  account_id: string; line_no: number;
  debit_minor: number | string; credit_minor: number | string;
};
export type PayrollAuditAccountRow = {
  accountId: string; side: "debit" | "credit";
  expectedMinor: string; postedMinor: string; matched: boolean;
  accountCode?: string | undefined; accountName?: string | undefined;
};
export type PayrollAccrualTieOutResult = {
  status: "matched" | "exceptions";
  runId: string; journalId: string; currency: string;
  sourceLineCount: number; ledgerLineCount: number;
  expectedDebitMinor: string; expectedCreditMinor: string;
  postedDebitMinor: string; postedCreditMinor: string;
  accounts: PayrollAuditAccountRow[];
  issues: string[];
};

function unsignedMinor(value: number | string, label: string): bigint {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(label + " must be a non-negative exact integer in minor units.");
}
function add(map: Map<string, bigint>, account: string, side: "debit" | "credit", minor: bigint) {
  if (!account || minor <= 0n) return;
  const key = account + "|" + side;
  map.set(key, (map.get(key) ?? 0n) + minor);
}
function totals(map: Map<string, bigint>): { debit: bigint; credit: bigint } {
  let debit = 0n;
  let credit = 0n;
  for (const [key, minor] of map) {
    if (key.endsWith("|debit")) debit += minor;
    else credit += minor;
  }
  return { debit, credit };
}
/**
 * Compare original payroll included run-lines and account defaults/overrides
 * against posted journal_lines. Does not verify net-pay payment allocation,
 * payroll tax compliance, other GL entries, or cross-currency valuation.
 */
export function auditPayrollAccrualTieOut(
  companyId: string,
  run: PayrollAuditRun,
  settings: PayrollAuditSettings,
  employees: readonly PayrollAuditEmployee[],
  sourceLines: readonly PayrollAuditSourceLine[],
  components: readonly PayrollAuditComponent[],
  journal: PayrollAuditJournal,
  glLines: readonly PayrollAuditGlLine[],
): PayrollAccrualTieOutResult {
  const issues: string[] = [];
  if (run.company_id !== companyId || journal.company_id !== companyId || settings.company_id !== companyId) {
    issues.push("Payroll run, settings or journal belongs to a different organisation.");
  }
  if (!["posted", "paid", "complete"].includes(run.status)) {
    issues.push("The payroll run is not in a posted or settled state.");
  }
  if (!run.accrual_journal_id || run.accrual_journal_id !== journal.id) {
    issues.push("Payroll accrual journal link differs from the run.");
  }
  if (journal.status !== "posted" || journal.reversed_by_journal_id) {
    issues.push("Payroll accrual journal is not an active posted journal.");
  }
  if (journal.source_type !== "payroll" || journal.source_id !== run.id) {
    issues.push("Journal source is not this payroll run.");
  }
  const key = "payroll-run:" + run.id + ":accrual";
  if (journal.idempotency_key !== key || run.posting_idempotency_key !== key) {
    issues.push("Payroll posting idempotency keys differ from the expected run key.");
  }
  for (const [name, id] of Object.entries({
    salaryExpense: settings.salary_expense_account_id,
    deductionLiability: settings.deduction_liability_account_id,
    employerExpense: settings.employer_expense_account_id,
    employerLiability: settings.employer_liability_account_id,
    netPayLiability: settings.net_pay_liability_account_id,
  })) {
    if (!id) issues.push("Payroll " + name + " default GL account is not configured.");
  }
  if (!run.currency || journal.currency_code !== run.currency) {
    issues.push("Payroll run and journal currencies do not match.");
  }
  if (!run.payment_date || journal.journal_date !== run.payment_date) {
    issues.push("Payroll journal date differs from the run payment date.");
  }

  const componentsById = new Map<string, PayrollAuditComponent>();
  for (const component of components) {
    if (!component.id || component.company_id !== companyId || componentsById.has(component.id)) {
      issues.push("Payroll component evidence is duplicated or belongs to another organisation.");
    }
    componentsById.set(component.id, component);
  }
  const includedIds = new Set<string>();
  const employeeIds = new Set<string>();
  for (const employee of employees) {
    if (!employee.id || employeeIds.has(employee.id) ||
        employee.company_id !== companyId || employee.run_id !== run.id) {
      issues.push("Payroll employee evidence is duplicated or belongs to a different run.");
    }
    employeeIds.add(employee.id);
    if (employee.status === "included") includedIds.add(employee.id);
    else if (!["excluded", "error"].includes(employee.status)) {
      issues.push("Payroll employee inclusion status is invalid.");
    }
  }
  if (includedIds.size === 0) issues.push("Posted payroll run has no included employees.");

  const expected = new Map<string, bigint>();
  const seenSources = new Set<string>();
  for (const [index, line] of sourceLines.entries()) {
    const label = "Payroll component line " + (index + 1);
    if (!line.id || seenSources.has(line.id) || line.company_id !== companyId ||
        !includedIds.has(line.run_employee_id)) {
      issues.push(label + " is duplicated or does not belong to an included payroll employee.");
    }
    seenSources.add(line.id);
    const component = line.component_type_id ? componentsById.get(line.component_type_id) : undefined;
    if (line.component_type_id && !component) {
      issues.push(label + " refers to an unavailable component mapping.");
    }
    try {
      const minor = unsignedMinor(line.amount_minor, label);
      if (minor === 0n) continue; // SQL source builder skips zero amounts.
      if (line.kind === "earning") {
        const account = component?.expense_account_id ?? settings.salary_expense_account_id;
        if (!account) issues.push(label + " is missing its salary expense account.");
        add(expected, account ?? "", "debit", minor);
      } else if (line.kind === "deduction") {
        const account = component?.liability_account_id ?? settings.deduction_liability_account_id;
        if (!account) issues.push(label + " is missing its deduction liability account.");
        add(expected, account ?? "", "credit", minor);
      } else if (line.kind === "employer_contribution") {
        const expense = component?.expense_account_id ?? settings.employer_expense_account_id;
        const liability = component?.liability_account_id ?? settings.employer_liability_account_id;
        if (!expense || !liability) issues.push(label + " is missing employer contribution account mapping.");
        add(expected, expense ?? "", "debit", minor);
        add(expected, liability ?? "", "credit", minor);
      } else {
        issues.push(label + " has an unknown payroll component type.");
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : label + " has an invalid amount.");
    }
  }
  try {
    const net = unsignedMinor(run.net_minor, "Payroll run net pay");
    if (net > 0n && !settings.net_pay_liability_account_id) {
      issues.push("Payroll net-pay liability account mapping is missing.");
    }
    add(expected, settings.net_pay_liability_account_id ?? "", "credit", net);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Payroll run net pay is invalid.");
  }

  const posted = new Map<string, bigint>();
  const seenGl = new Set<string>();
  const seenNumbers = new Set<number>();
  for (const [index, line] of glLines.entries()) {
    const label = "Payroll ledger line " + (index + 1);
    if (!line.id || seenGl.has(line.id) || line.company_id !== companyId ||
        line.journal_id !== journal.id) {
      issues.push(label + " is duplicated or belongs to another journal or organisation.");
    }
    seenGl.add(line.id);
    if (!Number.isSafeInteger(line.line_no) || line.line_no < 1 || seenNumbers.has(line.line_no)) {
      issues.push(label + " has a missing or duplicate line number.");
    }
    seenNumbers.add(line.line_no);
    if (!line.account_id) issues.push(label + " does not identify an account.");
    try {
      const debit = unsignedMinor(line.debit_minor, label + " debit");
      const credit = unsignedMinor(line.credit_minor, label + " credit");
      if ((debit === 0n && credit === 0n) || (debit > 0n && credit > 0n)) {
        issues.push(label + " must have one non-zero debit or credit side.");
      }
      add(posted, line.account_id, "debit", debit);
      add(posted, line.account_id, "credit", credit);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : label + " has an invalid amount.");
    }
  }
  if (sourceLines.length === 0 || glLines.length < 2) {
    issues.push("Source payroll components or posted GL evidence is missing.");
  }
  const expectedTotals = totals(expected);
  const postedTotals = totals(posted);
  if (expectedTotals.debit === 0n || expectedTotals.debit !== expectedTotals.credit) {
    issues.push("Expected payroll source accrual does not balance.");
  }
  if (postedTotals.debit === 0n || postedTotals.debit !== postedTotals.credit) {
    issues.push("Posted payroll GL accrual does not balance.");
  }
  const rows: PayrollAuditAccountRow[] = [...new Set([...expected.keys(), ...posted.keys()])]
    .sort()
    .map((entry) => {
      const i = entry.lastIndexOf("|");
      const expectedMinor = expected.get(entry) ?? 0n;
      const postedMinor = posted.get(entry) ?? 0n;
      if (expectedMinor !== postedMinor) {
        issues.push("Payroll GL discrepancy for account " + entry.slice(0, i) + " " + entry.slice(i + 1) + ".");
      }
      return {
        accountId: entry.slice(0, i),
        side: entry.slice(i + 1) as "debit" | "credit",
        expectedMinor: expectedMinor.toString(),
        postedMinor: postedMinor.toString(),
        matched: expectedMinor === postedMinor,
      };
    });
  if (rows.length < 2 || expected.size === 0) issues.push("Payroll accrual account evidence is incomplete.");
  return {
    status: issues.length ? "exceptions" : "matched",
    runId: run.id, journalId: journal.id, currency: run.currency,
    sourceLineCount: sourceLines.length, ledgerLineCount: glLines.length,
    expectedDebitMinor: expectedTotals.debit.toString(),
    expectedCreditMinor: expectedTotals.credit.toString(),
    postedDebitMinor: postedTotals.debit.toString(),
    postedCreditMinor: postedTotals.credit.toString(),
    accounts: rows, issues,
  };
}
