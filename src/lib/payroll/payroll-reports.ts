import {
  PAYROLL_REPORT_JOURNAL_FOOTNOTE,
  PAYROLL_REPORT_STATUS_FOOTNOTE,
} from "@/lib/payroll/payroll-report-scope";
import type { PayrollRunJournalSummary } from "@/lib/payroll/payments.functions";
import type {
  PayrollEmployeeRow,
  PayrollPayScheduleRow,
  PayrollPayslipRow,
  PayrollRunEmployeeRow,
  PayrollRunLineRow,
  PayrollRunRow,
} from "@/lib/payroll/types";

export const PAYROLL_REPORT_IDS = [
  "payroll_summary",
  "payroll_register",
  "employee_earnings",
  "employee_deductions",
  "employer_payroll_cost",
  "payroll_liabilities",
  "payroll_payment_status",
  "payroll_journal_reconciliation",
  "employee_payroll_history",
  "payroll_expense_by_department",
] as const;

export type PayrollReportId = (typeof PAYROLL_REPORT_IDS)[number];

export type PayrollReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type PayrollReportRow = Record<string, string | number>;

export type PayrollReportDefinition = {
  id: PayrollReportId;
  title: string;
  description: string;
};

export const PAYROLL_REPORT_DEFINITIONS: readonly PayrollReportDefinition[] = [
  {
    id: "payroll_summary",
    title: "Payroll Summary",
    description: "Run-level totals for gross pay, deductions, net pay and employer cost.",
  },
  {
    id: "payroll_register",
    title: "Payroll Register",
    description: "Employee pay lines per run with gross, deductions and net.",
  },
  {
    id: "employee_earnings",
    title: "Employee Earnings",
    description: "Earning components aggregated by employee and pay component.",
  },
  {
    id: "employee_deductions",
    title: "Employee Deductions",
    description: "Deduction components aggregated by employee and pay component.",
  },
  {
    id: "employer_payroll_cost",
    title: "Employer Payroll Cost",
    description: "Employer contributions and total employer cost by employee.",
  },
  {
    id: "payroll_liabilities",
    title: "Payroll Liabilities",
    description: "Net pay and deduction liabilities from posted pay totals.",
  },
  {
    id: "payroll_payment_status",
    title: "Payroll Payment Status",
    description: "Payslip net pay versus amounts paid and outstanding balance.",
  },
  {
    id: "payroll_journal_reconciliation",
    title: "Payroll Journal Reconciliation",
    description: "Compare run totals to accrual journal debits and credits.",
  },
  {
    id: "employee_payroll_history",
    title: "Employee Payroll History",
    description: "Chronological pay history for each employee in the period.",
  },
  {
    id: "payroll_expense_by_department",
    title: "Payroll Expense by Department",
    description: "Gross earnings and employer cost grouped by department.",
  },
];

export type PayrollReportEmployeeSlice = {
  run: PayrollRunRow;
  runEmployee: PayrollRunEmployeeRow;
  employee: PayrollEmployeeRow;
  payslip: PayrollPayslipRow | null;
  scheduleName: string;
};

export type PayrollReportFacts = {
  currency: string;
  dateFrom: string;
  dateTo: string;
  slices: PayrollReportEmployeeSlice[];
  linesByRunEmployeeId: Map<string, PayrollRunLineRow[]>;
  journalsByRunId: Map<string, PayrollRunJournalSummary[]>;
};

export type PayrollReportResult = {
  reportId: PayrollReportId;
  title: string;
  footnotes: string[];
  columns: PayrollReportColumn[];
  rows: PayrollReportRow[];
  totals: PayrollReportRow | null;
};

function sumField(rows: PayrollReportRow[], key: string): number {
  return rows.reduce((s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
}

function employeeLabel(employee: PayrollEmployeeRow): string {
  return `${employee.employee_number} — ${employee.first_name} ${employee.last_name}`.trim();
}

function journalDebitCredit(journals: PayrollRunJournalSummary[]): {
  debitMinor: number;
  creditMinor: number;
} {
  let debitMinor = 0;
  let creditMinor = 0;
  for (const j of journals) {
    for (const line of j.lines) {
      debitMinor += line.debit_minor;
      creditMinor += line.credit_minor;
    }
  }
  return { debitMinor, creditMinor };
}

export function buildPayrollSummaryReport(facts: PayrollReportFacts): PayrollReportResult {
  const byRun = new Map<string, PayrollRunRow>();
  for (const s of facts.slices) byRun.set(s.run.id, s.run);

  const rows: PayrollReportRow[] = [...byRun.values()]
    .sort(
      (a, b) =>
        b.period_end.localeCompare(a.period_end) || a.run_number.localeCompare(b.run_number),
    )
    .map((run) => ({
      runId: run.id,
      runNumber: run.run_number,
      period: `${run.period_start} – ${run.period_end}`,
      paymentDate: run.payment_date,
      status: run.status,
      grossMinor: run.gross_minor,
      deductionsMinor: run.deductions_minor,
      netMinor: run.net_minor,
      employerCostMinor: run.employer_cost_minor,
      currency: run.currency,
    }));

  return {
    reportId: "payroll_summary",
    title: "Payroll Summary",
    footnotes: [PAYROLL_REPORT_STATUS_FOOTNOTE],
    columns: [
      { key: "runNumber", label: "Run" },
      { key: "period", label: "Period" },
      { key: "paymentDate", label: "Payment date" },
      { key: "status", label: "Status" },
      { key: "grossMinor", label: "Gross", align: "right" },
      { key: "deductionsMinor", label: "Deductions", align: "right" },
      { key: "netMinor", label: "Net pay", align: "right" },
      { key: "employerCostMinor", label: "Employer cost", align: "right" },
    ],
    rows,
    totals: {
      runNumber: "Total",
      grossMinor: sumField(rows, "grossMinor"),
      deductionsMinor: sumField(rows, "deductionsMinor"),
      netMinor: sumField(rows, "netMinor"),
      employerCostMinor: sumField(rows, "employerCostMinor"),
    },
  };
}

export function buildPayrollRegisterReport(facts: PayrollReportFacts): PayrollReportResult {
  const rows: PayrollReportRow[] = facts.slices
    .filter((s) => s.runEmployee.status === "included")
    .sort(
      (a, b) =>
        b.run.period_end.localeCompare(a.run.period_end) ||
        a.run.run_number.localeCompare(b.run.run_number) ||
        employeeLabel(a.employee).localeCompare(employeeLabel(b.employee)),
    )
    .map((s) => ({
      runId: s.run.id,
      runNumber: s.run.run_number,
      periodEnd: s.run.period_end,
      employee: employeeLabel(s.employee),
      department: s.employee.department ?? "",
      grossMinor: s.runEmployee.gross_minor,
      deductionsMinor: s.runEmployee.deductions_minor,
      netMinor: s.runEmployee.net_minor,
      employerCostMinor: s.runEmployee.employer_cost_minor,
    }));

  return {
    reportId: "payroll_register",
    title: "Payroll Register",
    footnotes: [PAYROLL_REPORT_STATUS_FOOTNOTE],
    columns: [
      { key: "runNumber", label: "Run" },
      { key: "periodEnd", label: "Period end" },
      { key: "employee", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "grossMinor", label: "Gross", align: "right" },
      { key: "deductionsMinor", label: "Deductions", align: "right" },
      { key: "netMinor", label: "Net pay", align: "right" },
      { key: "employerCostMinor", label: "Employer cost", align: "right" },
    ],
    rows,
    totals: {
      runNumber: "Total",
      grossMinor: sumField(rows, "grossMinor"),
      deductionsMinor: sumField(rows, "deductionsMinor"),
      netMinor: sumField(rows, "netMinor"),
      employerCostMinor: sumField(rows, "employerCostMinor"),
    },
  };
}

function aggregateComponentLines(
  facts: PayrollReportFacts,
  kind: "earning" | "deduction" | "employer_contribution",
): PayrollReportResult {
  const map = new Map<
    string,
    { employee: string; code: string; name: string; amountMinor: number }
  >();
  for (const slice of facts.slices) {
    if (slice.runEmployee.status !== "included") continue;
    const lines = facts.linesByRunEmployeeId.get(slice.runEmployee.id) ?? [];
    for (const line of lines) {
      if (line.kind !== kind) continue;
      const key = `${slice.employee.id}:${line.code}:${line.name}`;
      const cur = map.get(key) ?? {
        employee: employeeLabel(slice.employee),
        code: line.code,
        name: line.name,
        amountMinor: 0,
      };
      cur.amountMinor += line.amount_minor;
      map.set(key, cur);
    }
  }
  const rows: PayrollReportRow[] = [...map.values()]
    .sort(
      (a, b) =>
        String(a.employee).localeCompare(String(b.employee)) ||
        String(a.code).localeCompare(String(b.code)),
    )
    .map((r) => ({ ...r }));

  const title =
    kind === "earning"
      ? "Employee Earnings"
      : kind === "deduction"
        ? "Employee Deductions"
        : "Employer Payroll Cost";
  const reportId =
    kind === "earning"
      ? "employee_earnings"
      : kind === "deduction"
        ? "employee_deductions"
        : "employer_payroll_cost";

  return {
    reportId,
    title,
    footnotes: [PAYROLL_REPORT_STATUS_FOOTNOTE],
    columns: [
      { key: "employee", label: "Employee" },
      { key: "code", label: "Code" },
      { key: "name", label: "Component" },
      { key: "amountMinor", label: "Amount", align: "right" },
    ],
    rows,
    totals: { employee: "Total", amountMinor: sumField(rows, "amountMinor") },
  };
}

export function buildEmployeeEarningsReport(facts: PayrollReportFacts): PayrollReportResult {
  return aggregateComponentLines(facts, "earning");
}

export function buildEmployeeDeductionsReport(facts: PayrollReportFacts): PayrollReportResult {
  return aggregateComponentLines(facts, "deduction");
}

export function buildEmployerPayrollCostReport(facts: PayrollReportFacts): PayrollReportResult {
  const byEmployee = new Map<
    string,
    {
      employee: string;
      department: string;
      employerContributionsMinor: number;
      employerCostMinor: number;
    }
  >();
  for (const s of facts.slices) {
    if (s.runEmployee.status !== "included") continue;
    const label = employeeLabel(s.employee);
    const cur = byEmployee.get(label) ?? {
      employee: label,
      department: s.employee.department ?? "",
      employerContributionsMinor: 0,
      employerCostMinor: 0,
    };
    cur.employerContributionsMinor += s.runEmployee.employer_minor;
    cur.employerCostMinor += s.runEmployee.employer_cost_minor;
    byEmployee.set(label, cur);
  }
  const aggregated: PayrollReportRow[] = [...byEmployee.values()].sort((a, b) =>
    String(a["employee"]).localeCompare(String(b["employee"])),
  );

  return {
    reportId: "employer_payroll_cost",
    title: "Employer Payroll Cost",
    footnotes: [PAYROLL_REPORT_STATUS_FOOTNOTE],
    columns: [
      { key: "employee", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "employerContributionsMinor", label: "Employer contributions", align: "right" },
      { key: "employerCostMinor", label: "Total employer cost", align: "right" },
    ],
    rows: aggregated,
    totals: {
      employee: "Total",
      employerContributionsMinor: sumField(aggregated, "employerContributionsMinor"),
      employerCostMinor: sumField(aggregated, "employerCostMinor"),
    },
  };
}

export function buildPayrollLiabilitiesReport(facts: PayrollReportFacts): PayrollReportResult {
  let netPayMinor = 0;
  let deductionsMinor = 0;
  let employerLiabilitiesMinor = 0;
  for (const s of facts.slices) {
    if (s.runEmployee.status !== "included") continue;
    netPayMinor += s.runEmployee.net_minor;
    deductionsMinor += s.runEmployee.deductions_minor;
    employerLiabilitiesMinor += s.runEmployee.employer_minor;
  }
  const rows: PayrollReportRow[] = [
    { liability: "Net pay payable", amountMinor: netPayMinor },
    { liability: "Deduction liabilities", amountMinor: deductionsMinor },
    { liability: "Employer contribution liabilities", amountMinor: employerLiabilitiesMinor },
  ];
  return {
    reportId: "payroll_liabilities",
    title: "Payroll Liabilities",
    footnotes: [
      PAYROLL_REPORT_STATUS_FOOTNOTE,
      "Liabilities are derived from included employee run totals, not from the general ledger.",
    ],
    columns: [
      { key: "liability", label: "Liability" },
      { key: "amountMinor", label: "Amount", align: "right" },
    ],
    rows,
    totals: { liability: "Total", amountMinor: sumField(rows, "amountMinor") },
  };
}

export function buildPayrollPaymentStatusReport(facts: PayrollReportFacts): PayrollReportResult {
  const rows: PayrollReportRow[] = facts.slices
    .filter((s) => s.payslip && s.runEmployee.status === "included")
    .sort(
      (a, b) =>
        b.run.payment_date.localeCompare(a.run.payment_date) ||
        employeeLabel(a.employee).localeCompare(employeeLabel(b.employee)),
    )
    .map((s) => {
      const payslip = s.payslip!;
      const outstanding =
        payslip.payment_status === "paid" ? 0 : s.runEmployee.net_minor - payslip.amount_paid_minor;
      return {
        runNumber: s.run.run_number,
        payslipNumber: payslip.payslip_number,
        employee: employeeLabel(s.employee),
        paymentDate: s.run.payment_date,
        netMinor: s.runEmployee.net_minor,
        paidMinor: payslip.amount_paid_minor,
        outstandingMinor: Math.max(0, outstanding),
        paymentStatus: payslip.payment_status,
      };
    });

  return {
    reportId: "payroll_payment_status",
    title: "Payroll Payment Status",
    footnotes: [PAYROLL_REPORT_STATUS_FOOTNOTE],
    columns: [
      { key: "runNumber", label: "Run" },
      { key: "payslipNumber", label: "Payslip" },
      { key: "employee", label: "Employee" },
      { key: "paymentDate", label: "Payment date" },
      { key: "netMinor", label: "Net pay", align: "right" },
      { key: "paidMinor", label: "Paid", align: "right" },
      { key: "outstandingMinor", label: "Outstanding", align: "right" },
      { key: "paymentStatus", label: "Status" },
    ],
    rows,
    totals: {
      runNumber: "Total",
      netMinor: sumField(rows, "netMinor"),
      paidMinor: sumField(rows, "paidMinor"),
      outstandingMinor: sumField(rows, "outstandingMinor"),
    },
  };
}

export function buildPayrollJournalReconciliationReport(
  facts: PayrollReportFacts,
): PayrollReportResult {
  const rows: PayrollReportRow[] = [];
  const seenRuns = new Set<string>();
  for (const slice of facts.slices) {
    if (seenRuns.has(slice.run.id)) continue;
    seenRuns.add(slice.run.id);
    const run = slice.run;
    if (!run.accrual_journal_id) {
      rows.push({
        runNumber: run.run_number,
        periodEnd: run.period_end,
        status: run.status,
        runGrossMinor: run.gross_minor,
        runNetMinor: run.net_minor,
        journalDebitMinor: 0,
        journalCreditMinor: 0,
        balanced: "No journal",
      });
      continue;
    }
    const journals = facts.journalsByRunId.get(run.id) ?? [];
    const { debitMinor, creditMinor } = journalDebitCredit(journals);
    const balanced = debitMinor === creditMinor ? "Yes" : "No";
    rows.push({
      runNumber: run.run_number,
      periodEnd: run.period_end,
      status: run.status,
      runGrossMinor: run.gross_minor,
      runNetMinor: run.net_minor,
      journalDebitMinor: debitMinor,
      journalCreditMinor: creditMinor,
      balanced,
    });
  }
  rows.sort((a, b) => String(b["periodEnd"]).localeCompare(String(a["periodEnd"])));

  return {
    reportId: "payroll_journal_reconciliation",
    title: "Payroll Journal Reconciliation",
    footnotes: [PAYROLL_REPORT_JOURNAL_FOOTNOTE],
    columns: [
      { key: "runNumber", label: "Run" },
      { key: "periodEnd", label: "Period end" },
      { key: "status", label: "Status" },
      { key: "runGrossMinor", label: "Run gross", align: "right" },
      { key: "runNetMinor", label: "Run net", align: "right" },
      { key: "journalDebitMinor", label: "Journal debits", align: "right" },
      { key: "journalCreditMinor", label: "Journal credits", align: "right" },
      { key: "balanced", label: "Balanced" },
    ],
    rows,
    totals: null,
  };
}

export function buildEmployeePayrollHistoryReport(facts: PayrollReportFacts): PayrollReportResult {
  const rows: PayrollReportRow[] = facts.slices
    .filter((s) => s.runEmployee.status === "included")
    .sort(
      (a, b) =>
        employeeLabel(a.employee).localeCompare(employeeLabel(b.employee)) ||
        b.run.period_end.localeCompare(a.run.period_end),
    )
    .map((s) => ({
      employee: employeeLabel(s.employee),
      runNumber: s.run.run_number,
      periodEnd: s.run.period_end,
      grossMinor: s.runEmployee.gross_minor,
      deductionsMinor: s.runEmployee.deductions_minor,
      netMinor: s.runEmployee.net_minor,
      runId: s.run.id,
    }));

  return {
    reportId: "employee_payroll_history",
    title: "Employee Payroll History",
    footnotes: [PAYROLL_REPORT_STATUS_FOOTNOTE],
    columns: [
      { key: "employee", label: "Employee" },
      { key: "runNumber", label: "Run" },
      { key: "periodEnd", label: "Period end" },
      { key: "grossMinor", label: "Gross", align: "right" },
      { key: "deductionsMinor", label: "Deductions", align: "right" },
      { key: "netMinor", label: "Net pay", align: "right" },
    ],
    rows,
    totals: {
      employee: "Total",
      grossMinor: sumField(rows, "grossMinor"),
      deductionsMinor: sumField(rows, "deductionsMinor"),
      netMinor: sumField(rows, "netMinor"),
    },
  };
}

export function buildPayrollExpenseByDepartmentReport(
  facts: PayrollReportFacts,
): PayrollReportResult {
  const map = new Map<
    string,
    { grossMinor: number; employerCostMinor: number; headcount: Set<string> }
  >();
  for (const s of facts.slices) {
    if (s.runEmployee.status !== "included") continue;
    const dept = (s.employee.department?.trim() || "Unassigned").trim();
    const cur = map.get(dept) ?? {
      grossMinor: 0,
      employerCostMinor: 0,
      headcount: new Set<string>(),
    };
    cur.grossMinor += s.runEmployee.gross_minor;
    cur.employerCostMinor += s.runEmployee.employer_cost_minor;
    cur.headcount.add(s.employee.id);
    map.set(dept, cur);
  }
  const rows: PayrollReportRow[] = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([department, v]) => ({
      department,
      employees: v.headcount.size,
      grossMinor: v.grossMinor,
      employerCostMinor: v.employerCostMinor,
      totalCostMinor: v.grossMinor + v.employerCostMinor,
    }));

  return {
    reportId: "payroll_expense_by_department",
    title: "Payroll Expense by Department",
    footnotes: [PAYROLL_REPORT_STATUS_FOOTNOTE],
    columns: [
      { key: "department", label: "Department" },
      { key: "employees", label: "Employees", align: "right" },
      { key: "grossMinor", label: "Gross earnings", align: "right" },
      { key: "employerCostMinor", label: "Employer cost", align: "right" },
      { key: "totalCostMinor", label: "Total payroll cost", align: "right" },
    ],
    rows,
    totals: {
      department: "Total",
      employees: sumField(rows, "employees"),
      grossMinor: sumField(rows, "grossMinor"),
      employerCostMinor: sumField(rows, "employerCostMinor"),
      totalCostMinor: sumField(rows, "totalCostMinor"),
    },
  };
}

export function runPayrollReport(
  reportId: PayrollReportId,
  facts: PayrollReportFacts,
): PayrollReportResult {
  switch (reportId) {
    case "payroll_summary":
      return buildPayrollSummaryReport(facts);
    case "payroll_register":
      return buildPayrollRegisterReport(facts);
    case "employee_earnings":
      return buildEmployeeEarningsReport(facts);
    case "employee_deductions":
      return buildEmployeeDeductionsReport(facts);
    case "employer_payroll_cost":
      return buildEmployerPayrollCostReport(facts);
    case "payroll_liabilities":
      return buildPayrollLiabilitiesReport(facts);
    case "payroll_payment_status":
      return buildPayrollPaymentStatusReport(facts);
    case "payroll_journal_reconciliation":
      return buildPayrollJournalReconciliationReport(facts);
    case "employee_payroll_history":
      return buildEmployeePayrollHistoryReport(facts);
    case "payroll_expense_by_department":
      return buildPayrollExpenseByDepartmentReport(facts);
    default: {
      const _exhaustive: never = reportId;
      throw new Error(`Unknown payroll report: ${String(_exhaustive)}`);
    }
  }
}

export type PayrollReportFilters = {
  dateFrom: string;
  dateTo: string;
  employeeId: string | null;
  department: string | null;
  payScheduleId: string | null;
};

export function scheduleNameMap(schedules: PayrollPayScheduleRow[]): Map<string, string> {
  return new Map(schedules.map((s) => [s.id, s.name]));
}
