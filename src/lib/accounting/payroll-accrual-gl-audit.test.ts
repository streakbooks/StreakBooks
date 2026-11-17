import { describe, expect, it } from "vitest";
import {
  auditPayrollAccrualTieOut,
  type PayrollAuditRun,
  type PayrollAuditSettings,
  type PayrollAuditEmployee,
  type PayrollAuditSourceLine,
  type PayrollAuditComponent,
  type PayrollAuditJournal,
  type PayrollAuditGlLine,
} from "./payroll-accrual-gl-audit";
const company = "company-a";
const run: PayrollAuditRun = {
  id: "run-1",
  company_id: company,
  run_number: "PAY-001",
  status: "posted",
  currency: "GBP",
  payment_date: "2026-11-06",
  net_minor: "800",
  accrual_journal_id: "j-1",
  posting_idempotency_key: "payroll-run:run-1:accrual",
};
const settings: PayrollAuditSettings = {
  company_id: company,
  salary_expense_account_id: "salary",
  deduction_liability_account_id: "deduction",
  employer_expense_account_id: "employer-expense",
  employer_liability_account_id: "employer-liability",
  net_pay_liability_account_id: "net-pay",
};
const employees: PayrollAuditEmployee[] = [
  { id: "re-1", company_id: company, run_id: "run-1", status: "included" },
  { id: "re-2", company_id: company, run_id: "run-1", status: "excluded" },
];
const sources: PayrollAuditSourceLine[] = [
  {
    id: "s-1",
    company_id: company,
    run_employee_id: "re-1",
    component_type_id: "bonus",
    kind: "earning",
    amount_minor: "1000",
  },
  {
    id: "s-2",
    company_id: company,
    run_employee_id: "re-1",
    component_type_id: null,
    kind: "deduction",
    amount_minor: "200",
  },
  {
    id: "s-3",
    company_id: company,
    run_employee_id: "re-1",
    component_type_id: null,
    kind: "employer_contribution",
    amount_minor: "100",
  },
];
const components: PayrollAuditComponent[] = [
  {
    id: "bonus",
    company_id: company,
    expense_account_id: "bonus-expense",
    liability_account_id: null,
  },
];
const journal: PayrollAuditJournal = {
  id: "j-1",
  company_id: company,
  status: "posted",
  source_type: "payroll",
  source_id: "run-1",
  idempotency_key: "payroll-run:run-1:accrual",
  journal_date: "2026-11-06",
  currency_code: "GBP",
  reversed_by_journal_id: null,
};
const gl: PayrollAuditGlLine[] = [
  {
    id: "l-1",
    company_id: company,
    journal_id: "j-1",
    line_no: 1,
    account_id: "bonus-expense",
    debit_minor: "1000",
    credit_minor: "0",
  },
  {
    id: "l-2",
    company_id: company,
    journal_id: "j-1",
    line_no: 2,
    account_id: "deduction",
    debit_minor: "0",
    credit_minor: "200",
  },
  {
    id: "l-3",
    company_id: company,
    journal_id: "j-1",
    line_no: 3,
    account_id: "employer-expense",
    debit_minor: "100",
    credit_minor: "0",
  },
  {
    id: "l-4",
    company_id: company,
    journal_id: "j-1",
    line_no: 4,
    account_id: "employer-liability",
    debit_minor: "0",
    credit_minor: "100",
  },
  {
    id: "l-5",
    company_id: company,
    journal_id: "j-1",
    line_no: 5,
    account_id: "net-pay",
    debit_minor: "0",
    credit_minor: "800",
  },
];
const audit = (
  r = run,
  st = settings,
  emp = employees,
  src = sources,
  comp = components,
  j = journal,
  lines = gl,
) => auditPayrollAccrualTieOut(company, r, st, emp, src, comp, j, lines);

describe("Accounting payroll source-to-GL reconciliation", () => {
  it("matches the exact posted accrual and preserves per-account debit and credit sides", () => {
    const result = audit();
    expect(result.status).toBe("matched");
    expect(result.expectedDebitMinor).toBe("1100");
    expect(result.postedCreditMinor).toBe("1100");
    expect(result.accounts).toHaveLength(5);
    expect(result.accounts.every((x) => x.matched)).toBe(true);
  });
  it("detects missing and incorrect posted payroll source metadata", () => {
    expect(audit({ ...run, accrual_journal_id: "other" }).status).toBe("exceptions");
    expect(
      audit(run, settings, employees, sources, components, { ...journal, source_type: "manual" })
        .status,
    ).toBe("exceptions");
    expect(
      audit(run, settings, employees, sources, components, { ...journal, source_id: "other" })
        .status,
    ).toBe("exceptions");
    expect(audit({ ...run, posting_idempotency_key: "bad" }).status).toBe("exceptions");
    expect(
      audit(run, settings, employees, sources, components, {
        ...journal,
        reversed_by_journal_id: "r-1",
      }).status,
    ).toBe("exceptions");
  });
  it("detects wrong run currency, date and posting status", () => {
    expect(audit({ ...run, status: "draft" }).status).toBe("exceptions");
    expect(
      audit(run, settings, employees, sources, components, { ...journal, currency_code: "JPY" })
        .status,
    ).toBe("exceptions");
    expect(
      audit(run, settings, employees, sources, components, {
        ...journal,
        journal_date: "2026-11-05",
      }).status,
    ).toBe("exceptions");
  });
  it("rejects missing or changed payroll component mappings", () => {
    expect(audit(run, settings, employees, sources, []).status).toBe("exceptions");
    expect(
      audit(run, settings, employees, sources, [
        { ...components[0]!, expense_account_id: "other" },
      ]).issues.join(" "),
    ).toMatch(/discrepancy/);
    expect(audit(run, { ...settings, employer_expense_account_id: null }).issues.join(" ")).toMatch(
      /employer contribution account mapping/,
    );
  });
  it("matches SQL builder semantics without netting opposite sides for one account", () => {
    const st = { ...settings, deduction_liability_account_id: "bonus-expense" };
    const adjusted = gl.map((x) =>
      x.account_id === "deduction" ? { ...x, account_id: "bonus-expense" } : x,
    );
    expect(audit(run, st, employees, sources, components, journal, adjusted).status).toBe(
      "matched",
    );
    expect(
      audit(run, st, employees, sources, components, journal, adjusted).accounts.filter(
        (x) => x.accountId === "bonus-expense",
      ),
    ).toHaveLength(2);
  });
  it("detects altered or removed posted ledger lines", () => {
    expect(
      audit(run, settings, employees, sources, components, journal, gl.slice(0, 4)).status,
    ).toBe("exceptions");
    expect(
      audit(run, settings, employees, sources, components, journal, [
        { ...gl[0]!, debit_minor: "1010" },
        ...gl.slice(1),
      ]).issues.join(" "),
    ).toMatch(/discrepancy/);
  });
  it("rejects other-company/duplicate source or GL evidence", () => {
    expect(
      audit(run, settings, employees, [
        { ...sources[0]!, company_id: "other" },
        ...sources.slice(1),
      ]).status,
    ).toBe("exceptions");
    expect(
      audit(run, settings, employees, sources, components, journal, [
        { ...gl[0]!, journal_id: "other" },
        ...gl.slice(1),
      ]).status,
    ).toBe("exceptions");
    expect(
      audit(run, settings, employees, sources, components, journal, [
        ...gl,
        { ...gl[0]!, line_no: 6 },
      ]).issues.join(" "),
    ).toMatch(/duplicated/);
  });
  it("handles exclusions, zero lines, valid paid runs and exact large text amounts", () => {
    const million = "9007199254740993";
    const exactRun = { ...run, status: "paid", net_minor: million };
    const exactSources = [
      { ...sources[0]!, amount_minor: million },
      {
        ...sources[1]!,
        amount_minor: "0",
      },
    ];
    const exactGl = [
      { ...gl[0]!, debit_minor: million },
      { ...gl[4]!, line_no: 2, credit_minor: million },
    ];
    expect(
      audit(exactRun, settings, employees, exactSources, components, journal, exactGl).status,
    ).toBe("matched");
    expect(
      audit(exactRun, settings, employees, exactSources, components, journal, exactGl)
        .expectedDebitMinor,
    ).toBe(million);
  });
  it("does not silently round unsafe numeric JSON or accept invalid amounts", () => {
    expect(
      audit(run, settings, employees, [
        { ...sources[0]!, amount_minor: Number.MAX_SAFE_INTEGER + 1 },
        ...sources.slice(1),
      ]).status,
    ).toBe("exceptions");
    expect(
      audit(run, settings, employees, sources, components, journal, [
        { ...gl[0]!, debit_minor: "-3" },
        ...gl.slice(1),
      ]).status,
    ).toBe("exceptions");
  });
});
