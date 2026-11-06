import { parsePayrollPercentageBps, parsePayrollSalaryMinor } from "@/lib/payroll/salary-input";
import { toCsv } from "@/lib/sales/csv";
import { readPayrollCsvRecords } from "@/lib/payroll/employee-csv-records";
import { isValidPayrollDateOnly } from "@/lib/payroll/calendar-date";
import { todayLocalDateOnly } from "@/lib/payroll/local-date";
export { isValidPayrollDateOnly } from "@/lib/payroll/calendar-date";
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  PAYMENT_METHODS,
  type PayrollEmployeeRow,
  type PayrollEmploymentType,
  type PayrollEmployeeStatus,
  type PayrollPaymentMethod,
} from "@/lib/payroll/types";
import { assertPaymentMethod } from "@/lib/payroll/settings-draft";

function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return (options as readonly string[]).includes(value);
}

export type PayrollEmployeeDraft = {
  id?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  status: PayrollEmployeeStatus;
  hireDate: string;
  terminationDate: string;
  department: string;
  designation: string;
  employmentType: PayrollEmploymentType;
  workLocation: string;
  payrollCountryCode: string;
  payrollCurrency: string;
  payScheduleId: string;
  salaryStructureId: string;
  paymentMethod: PayrollPaymentMethod;
  notes: string;
};

export type ParsedResult =
  { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

export function emptyEmployeeDraft(
  countryCode: string,
  currencyCode: string,
): PayrollEmployeeDraft {
  return {
    employeeNumber: "",
    firstName: "",
    lastName: "",
    email: "",
    status: "active",
    hireDate: todayLocalDateOnly(),
    terminationDate: "",
    department: "",
    designation: "",
    employmentType: "salaried",
    workLocation: "",
    payrollCountryCode: countryCode,
    payrollCurrency: currencyCode,
    payScheduleId: "",
    salaryStructureId: "",
    paymentMethod: "bank_transfer",
    notes: "",
  };
}

export function employeeDraftFromRow(row: PayrollEmployeeRow): PayrollEmployeeDraft {
  return {
    id: row.id,
    employeeNumber: row.employee_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email ?? "",
    status: row.status,
    hireDate: row.hire_date,
    terminationDate: row.termination_date ?? "",
    department: row.department ?? "",
    designation: row.designation ?? "",
    employmentType: row.employment_type,
    workLocation: row.work_location ?? "",
    payrollCountryCode: row.payroll_country_code,
    payrollCurrency: row.payroll_currency,
    payScheduleId: row.pay_schedule_id ?? "",
    salaryStructureId: row.salary_structure_id ?? "",
    paymentMethod: assertPaymentMethod(row.payment_method),
    notes: row.notes ?? "",
  };
}

export function parsePayrollEmployeeDraft(draft: PayrollEmployeeDraft): ParsedResult {
  const first = draft.firstName.trim();
  const last = draft.lastName.trim();
  if (!first || first.length > 80) return { ok: false, error: "First name is required." };
  if (!last || last.length > 80) return { ok: false, error: "Last name is required." };

  const emailRaw = draft.email.trim().toLowerCase();
  if (emailRaw && (emailRaw.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw))) {
    return { ok: false, error: "Enter a valid email address or leave it blank." };
  }

  if (!isValidPayrollDateOnly(draft.hireDate)) {
    return { ok: false, error: "Hire date must be a valid YYYY-MM-DD calendar date." };
  }

  const term = draft.terminationDate.trim();
  if (term && !isValidPayrollDateOnly(term)) {
    return { ok: false, error: "Termination date must be a valid YYYY-MM-DD calendar date." };
  }
  if (term && term < draft.hireDate) {
    return { ok: false, error: "Termination date cannot be before hire date." };
  }

  if (!isOneOf(draft.status, EMPLOYEE_STATUSES)) {
    return { ok: false, error: "Choose a valid employee status." };
  }
  if (draft.status === "terminated" && !term) {
    return { ok: false, error: "Termination date is required when status is terminated." };
  }

  if (!isOneOf(draft.employmentType, EMPLOYMENT_TYPES)) {
    return { ok: false, error: "Choose a valid employment type." };
  }

  const country = draft.payrollCountryCode.trim().toUpperCase();
  const currency = draft.payrollCurrency.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    return { ok: false, error: "Payroll country must be a 2-letter code." };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: "Payroll currency must be a 3-letter code." };
  }

  if (!isOneOf(draft.paymentMethod, PAYMENT_METHODS)) {
    return { ok: false, error: "Choose a valid payment method." };
  }

  const number = draft.employeeNumber.trim();
  if (number && (number.length < 1 || number.length > 40)) {
    return { ok: false, error: "Employee ID must be between 1 and 40 characters." };
  }

  return {
    ok: true,
    value: {
      id: draft.id ?? null,
      employee_number: number || null,
      first_name: first,
      last_name: last,
      email: emailRaw || null,
      status: draft.status,
      hire_date: draft.hireDate,
      termination_date: term || null,
      department: draft.department.trim() || null,
      designation: draft.designation.trim() || null,
      employment_type: draft.employmentType,
      work_location: draft.workLocation.trim() || null,
      payroll_country_code: country,
      payroll_currency: currency,
      pay_schedule_id: draft.payScheduleId || null,
      salary_structure_id: draft.salaryStructureId || null,
      payment_method: draft.paymentMethod,
      notes: draft.notes.trim() || null,
    },
  };
}

export type PaymentDetailsDraft = {
  accountName: string;
  bankName: string;
  accountNumber: string;
  sortCode: string;
  iban: string;
  bic: string;
  clearAccountNumber: boolean;
  clearSortCode: boolean;
  clearIban: boolean;
  clearBic: boolean;
};

export function emptyPaymentDetailsDraft(): PaymentDetailsDraft {
  return {
    accountName: "",
    bankName: "",
    accountNumber: "",
    sortCode: "",
    iban: "",
    bic: "",
    clearAccountNumber: false,
    clearSortCode: false,
    clearIban: false,
    clearBic: false,
  };
}

export function parsePaymentDetailsDraft(draft: PaymentDetailsDraft): ParsedResult {
  const payload: Record<string, unknown> = {
    account_name: draft.accountName.trim() || null,
    bank_name: draft.bankName.trim() || null,
  };

  if (draft.clearAccountNumber) payload["account_number"] = null;
  else if (draft.accountNumber.trim()) {
    const acct = draft.accountNumber.trim().replace(/[\s-]/g, "").toUpperCase();
    if (!/^[0-9A-Z]{4,34}$/.test(acct)) {
      return { ok: false, error: "Account number must be 4–34 letters or digits." };
    }
    payload["account_number"] = acct;
  }

  if (draft.clearSortCode) payload["sort_code"] = null;
  else if (draft.sortCode.trim()) {
    const digits = draft.sortCode.trim().replace(/[\s-]/g, "");
    if (!/^\d{6}$/.test(digits)) {
      return { ok: false, error: "Sort code must be 6 digits." };
    }
    payload["sort_code"] = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  }

  if (draft.clearIban) payload["iban"] = null;
  else if (draft.iban.trim()) {
    payload["iban"] = draft.iban.trim().replace(/\s/g, "").toUpperCase();
  }

  if (draft.clearBic) payload["bic"] = null;
  else if (draft.bic.trim()) {
    const bic = draft.bic.trim().replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
      return { ok: false, error: "BIC/SWIFT format is invalid." };
    }
    payload["bic"] = bic;
  }

  return { ok: true, value: payload };
}

export type SalaryStructureLineDraft = {
  componentTypeId: string;
  amount: string;
  rate: string;
  percentage: string;
  isRecurring: boolean;
  sortOrder: string;
};

export type SalaryStructureDraft = {
  id?: string;
  name: string;
  description: string;
  isActive: boolean;
  lines: SalaryStructureLineDraft[];
};

export function parseSalaryStructureLineDraft(
  line: SalaryStructureLineDraft,
  currencyCode: string,
): ParsedResult {
  if (!line.componentTypeId) return { ok: false, error: "Each line needs a pay component." };
  const sortOrder = Number(line.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
    return { ok: false, error: "Sort order must be a whole number between 0 and 100000." };
  }
  let amountMinor = 0n;
  let rateMinor = 0n;
  let percentageBps = 0;
  try {
    amountMinor = parsePayrollSalaryMinor(line.amount, currencyCode, "Fixed salary amount");
    rateMinor = parsePayrollSalaryMinor(line.rate, currencyCode, "Salary rate");
    percentageBps = parsePayrollPercentageBps(line.percentage);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Enter valid salary line amounts.",
    };
  }
  return {
    ok: true,
    value: {
      component_type_id: line.componentTypeId,
      amount_minor: Number(amountMinor),
      rate_minor: Number(rateMinor),
      percentage_bps: percentageBps,
      is_recurring: line.isRecurring,
      sort_order: sortOrder,
    },
  };
}

export function parseSalaryStructureDraft(
  draft: SalaryStructureDraft,
  currencyCode: string,
): ParsedResult {
  const name = draft.name.trim();
  if (!name || name.length > 120) {
    return { ok: false, error: "Salary structure name is required." };
  }
  const lines: Record<string, unknown>[] = [];
  for (const line of draft.lines) {
    if (!line.componentTypeId) continue;
    const parsed = parseSalaryStructureLineDraft(line, currencyCode);
    if (!parsed.ok) return parsed;
    lines.push(parsed.value);
  }
  return {
    ok: true,
    value: {
      id: draft.id ?? null,
      name,
      description: draft.description.trim() || null,
      is_active: draft.isActive,
      lines,
    },
  };
}

export type SalaryAssignLineDraft = {
  componentTypeId: string;
  amount: string;
  rate: string;
  percentage: string;
  isRecurring: boolean;
  notes: string;
};

export type SalaryAssignDraft = {
  structureId: string;
  effectiveFrom: string;
  changeReason: string;
  customLines: SalaryAssignLineDraft[];
};

export function parseSalaryAssignDraft(
  draft: SalaryAssignDraft,
  currencyCode: string,
): ParsedResult {
  if (!isValidPayrollDateOnly(draft.effectiveFrom)) {
    return { ok: false, error: "Effective from date must be a valid YYYY-MM-DD calendar date." };
  }
  const structureId = draft.structureId.trim();
  const customLines: Record<string, unknown>[] = [];
  for (const line of draft.customLines) {
    if (!line.componentTypeId) continue;
    const parsed = parseSalaryStructureLineDraft(
      {
        componentTypeId: line.componentTypeId,
        amount: line.amount,
        rate: line.rate,
        percentage: line.percentage,
        isRecurring: line.isRecurring,
        sortOrder: "100",
      },
      currencyCode,
    );
    if (!parsed.ok) return parsed;
    customLines.push({
      ...parsed.value,
      notes: line.notes.trim() || null,
    });
  }
  if (!structureId && customLines.length === 0) {
    return { ok: false, error: "Choose a salary structure or add custom salary lines." };
  }
  return {
    ok: true,
    value: {
      structure_id: structureId || null,
      effective_from: draft.effectiveFrom,
      change_reason: draft.changeReason.trim() || null,
      lines: customLines,
    },
  };
}

const CSV_HEADERS = [
  "Employee number",
  "First name",
  "Last name",
  "Email",
  "Status",
  "Hire date",
  "Termination date",
  "Department",
  "Designation",
  "Employment type",
  "Work location",
  "Payroll country",
  "Payroll currency",
  "Payment method",
] as const;

export function payrollEmployeesToCsv(employees: PayrollEmployeeRow[]): string {
  return toCsv(
    [...CSV_HEADERS],
    employees.map((e) => [
      e.employee_number,
      e.first_name,
      e.last_name,
      e.email ?? "",
      e.status,
      e.hire_date,
      e.termination_date ?? "",
      e.department ?? "",
      e.designation ?? "",
      e.employment_type,
      e.work_location ?? "",
      e.payroll_country_code,
      e.payroll_currency,
      e.payment_method,
    ]),
  );
}

/** Parse the employee export format safely before any server writes occur. */
export function parsePayrollEmployeesCsv(
  csvText: string,
  defaults: { country: string; currency: string },
): { ok: true; drafts: PayrollEmployeeDraft[] } | { ok: false; error: string } {
  const parsedCsv = readPayrollCsvRecords(csvText);
  if (!parsedCsv.ok) return parsedCsv;
  const records = parsedCsv.records;
  if (records.length < 2) {
    return { ok: false, error: "CSV must include a header row and at least one employee." };
  }
  const header = records[0]!.cells.map((h) => h.toLowerCase());
  const distinct = header.filter((h) => h !== "");
  if (distinct.length !== new Set(distinct).size) {
    return { ok: false, error: "CSV contains duplicate column headings." };
  }
  const idx = (name: string) => header.indexOf(name.toLowerCase());
  const required = ["First name", "Last name", "Hire date"] as const;
  for (const label of required) {
    if (idx(label) < 0) return { ok: false, error: `CSV is missing required column: ${label}.` };
  }
  const drafts: PayrollEmployeeDraft[] = [];
  const usedIds = new Set<string>();
  for (const row of records.slice(1)) {
    const cells = row.cells;
    if (cells.length !== header.length) {
      return {
        ok: false,
        error: `Line ${row.line}: expected ${header.length} CSV columns but found ${cells.length}.`,
      };
    }
    const get = (label: string) => {
      const i = idx(label);
      // Reverse the CSV writer's spreadsheet-formula prefix only for
      // formula-like cells. Preserve legitimate names beginning with an apostrophe.
      const value = i >= 0 ? (cells[i] ?? "") : "";
      const marker = value.charAt(1);
      const escaped = value.startsWith("'") &&
        (["=", "+", "-", "@"].includes(marker) || marker.charCodeAt(0) === 9 ||
          marker.charCodeAt(0) === 13);
      return escaped ? value.slice(1) : value;
    };
    const draft: PayrollEmployeeDraft = {
      ...emptyEmployeeDraft(
        get("Payroll country") || defaults.country,
        get("Payroll currency") || defaults.currency,
      ),
      employeeNumber: get("Employee number"),
      firstName: get("First name"),
      lastName: get("Last name"),
      email: get("Email"),
      status: (get("Status") || "active") as PayrollEmployeeDraft["status"],
      hireDate: get("Hire date"),
      terminationDate: get("Termination date"),
      department: get("Department"),
      designation: get("Designation"),
      employmentType: (get("Employment type") ||
        "salaried") as PayrollEmployeeDraft["employmentType"],
      workLocation: get("Work location"),
      paymentMethod: (get("Payment method") ||
        "bank_transfer") as PayrollEmployeeDraft["paymentMethod"],
    };
    const validated = parsePayrollEmployeeDraft(draft);
    if (!validated.ok) return { ok: false, error: `Line ${row.line}: ${validated.error}` };
    const number = draft.employeeNumber.trim();
    if (number) {
      if (usedIds.has(number)) {
        return { ok: false, error: `Line ${row.line}: Employee ID ${number} appears more than once.` };
      }
      usedIds.add(number);
    }
    drafts.push(draft);
  }
  return { ok: true, drafts };
}
