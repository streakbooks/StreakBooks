import { describe, expect, it } from "vitest";
import {
  emptyEmployeeDraft,
  isValidPayrollDateOnly,
  parsePayrollEmployeeDraft,
  parsePayrollEmployeesCsv,
  parsePaymentDetailsDraft,
  parseSalaryAssignDraft,
  parseSalaryStructureDraft,
  payrollEmployeesToCsv,
} from "./employee-draft";

describe("payroll employee drafts", () => {
  const base = emptyEmployeeDraft("GB", "GBP");

  it("requires names and hire date", () => {
    expect(parsePayrollEmployeeDraft({ ...base, firstName: "", lastName: "Lee" }).ok).toBe(false);
    expect(parsePayrollEmployeeDraft({ ...base, hireDate: "bad" }).ok).toBe(false);
  });

  it("requires termination date when status is terminated", () => {
    const parsed = parsePayrollEmployeeDraft({
      ...base,
      firstName: "Sam",
      lastName: "Lee",
      status: "terminated",
      terminationDate: "",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/termination/i);
  });

  it("accepts a valid employee draft", () => {
    const parsed = parsePayrollEmployeeDraft({
      ...base,
      firstName: "Alex",
      lastName: "Taylor",
      email: "alex@example.com",
      payrollCountryCode: "au",
      payrollCurrency: "aud",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value["payroll_country_code"]).toBe("AU");
    expect(parsed.value["payroll_currency"]).toBe("AUD");
  });

  it("validates payment details", () => {
    expect(
      parsePaymentDetailsDraft({
        accountName: "Alex Taylor",
        bankName: "Demo Bank",
        accountNumber: "12AB",
        sortCode: "123456",
        iban: "",
        bic: "",
        clearAccountNumber: false,
        clearSortCode: false,
        clearIban: false,
        clearBic: false,
      }).ok,
    ).toBe(true);
    expect(
      parsePaymentDetailsDraft({
        accountName: "",
        bankName: "",
        accountNumber: "!!",
        sortCode: "",
        iban: "",
        bic: "",
        clearAccountNumber: false,
        clearSortCode: false,
        clearIban: false,
        clearBic: false,
      }).ok,
    ).toBe(false);
  });

  it("parses salary structure and assignment drafts", () => {
    const structure = parseSalaryStructureDraft(
      {
        name: "Standard",
        description: "",
        isActive: true,
        lines: [
          {
            componentTypeId: "11111111-1111-1111-1111-111111111111",
            amount: "2500",
            rate: "0",
            percentage: "0",
            isRecurring: true,
            sortOrder: "100",
          },
        ],
      },
      "GBP",
    );
    expect(structure.ok).toBe(true);

    const assign = parseSalaryAssignDraft(
      {
        structureId: "22222222-2222-2222-2222-222222222222",
        effectiveFrom: "2026-04-01",
        changeReason: "Promotion",
        customLines: [],
      },
      "GBP",
    );
    expect(assign.ok).toBe(true);
    if (!assign.ok) return;
    expect(assign.value["effective_from"]).toBe("2026-04-01");
  });

  it("round-trips employee CSV export into import drafts", () => {
    const csv = payrollEmployeesToCsv([
      {
        id: "1",
        company_id: "c",
        contact_id: "k",
        employee_number: "EMP-0001",
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@example.com",
        status: "active",
        hire_date: "2026-01-15",
        termination_date: null,
        department: "Engineering",
        designation: "Engineer",
        employment_type: "salaried",
        work_location: "London",
        payroll_country_code: "GB",
        payroll_currency: "GBP",
        pay_schedule_id: null,
        salary_structure_id: null,
        payment_method: "bank_transfer",
        notes: null,
        archived_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const parsed = parsePayrollEmployeesCsv(csv, { country: "GB", currency: "GBP" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.drafts).toHaveLength(1);
    expect(parsed.drafts[0]?.firstName).toBe("Ada");
    expect(parsed.drafts[0]?.employeeNumber).toBe("EMP-0001");
  });
  it("rejects duplicate employee IDs in an import before writes", () => {
    const result = parsePayrollEmployeesCsv(
      "Employee number,First name,Last name,Hire date\nEMP-1,Ada,Lee,2026-01-01\nEMP-1,Ann,Li,2026-02-01",
      { country: "GB", currency: "GBP" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Line 3.*appears more than once/);
  });

  it("rejects duplicate headings and unsupported payment methods", () => {
    const duplicate = parsePayrollEmployeesCsv(
      "First name,First name,Last name,Hire date\nAda,Ada,Lee,2026-01-01",
      { country: "GB", currency: "GBP" },
    );
    expect(duplicate.ok).toBe(false);
    const unsupported = parsePayrollEmployeesCsv(
      "First name,Last name,Hire date,Payment method\nAda,Lee,2026-01-01,unsupported",
      { country: "GB", currency: "GBP" },
    );
    expect(unsupported.ok).toBe(false);
  });

  it("preserves quoted newlines and reports the true next row line on invalid data", () => {
    const imported = parsePayrollEmployeesCsv(
      'First name,Last name,Hire date,Department\r\nAda,Lee,2026-01-01,"Research\r\nTeam"\r\nAnn,Li,invalid,Accounts',
      { country: "GB", currency: "GBP" },
    );
    expect(imported.ok).toBe(false);
    if (!imported.ok) expect(imported.error).toContain("Line 4:");
  });

  it("round-trips an imported department containing commas and embedded newlines", () => {
    const parsed = parsePayrollEmployeesCsv(
      'First name,Last name,Hire date,Department\r\nAda,Lee,2026-01-01,"Research,\r\nTeam"',
      { country: "GB", currency: "GBP" },
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.drafts[0]?.department).toBe("Research,\nTeam");
  });

  it("rejects invalid calendar dates but accepts leap days", () => {
    expect(isValidPayrollDateOnly("2024-02-29")).toBe(true);
    expect(isValidPayrollDateOnly("2026-02-29")).toBe(false);
    expect(isValidPayrollDateOnly("2026-02-30")).toBe(false);
    expect(isValidPayrollDateOnly("0000-01-01")).toBe(false);
    expect(isValidPayrollDateOnly("2026-13-01")).toBe(false);
    expect(parsePayrollEmployeeDraft({
      ...base,
      firstName: "Dana",
      lastName: "Lee",
      hireDate: "2026-02-30",
    }).ok).toBe(false);
    expect(parsePayrollEmployeeDraft({
      ...base,
      firstName: "Dana",
      lastName: "Lee",
      hireDate: "2024-02-29",
      terminationDate: "2025-02-29",
    }).ok).toBe(false);
  });

  it("rejects wrong-width CSV rows and manual employee payment methods", () => {
    const extraColumn = parsePayrollEmployeesCsv(
      "First name,Last name,Hire date\nAda,Lee,2026-01-01,unexpected",
      { country: "GB", currency: "GBP" },
    );
    expect(extraColumn.ok).toBe(false);
    if (!extraColumn.ok) expect(extraColumn.error).toMatch(/Line 2.*expected 3 CSV columns/);
    const manual = parsePayrollEmployeesCsv(
      "First name,Last name,Hire date,Payment method\nAda,Lee,2026-01-01,manual",
      { country: "GB", currency: "GBP" },
    );
    expect(manual.ok).toBe(false);
  });

  it("keeps legitimate apostrophes while reversing escaped spreadsheet prefixes", () => {
    const parsed = parsePayrollEmployeesCsv(
      "First name,Last name,Hire date\n'Annie,Lee,2026-01-01\n'=FORMULA,Lee,2026-01-02",
      { country: "GB", currency: "GBP" },
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.drafts[0]?.firstName).toBe("'Annie");
    expect(parsed.drafts[1]?.firstName).toBe("=FORMULA");
  });

  it("rejects impossible dates for salary version changes", () => {
    const baseAssignment = {
      structureId: "22222222-2222-2222-2222-222222222222",
      effectiveFrom: "2026-02-30",
      changeReason: "Salary review",
      customLines: [],
    };
    expect(parseSalaryAssignDraft(baseAssignment, "GBP").ok).toBe(false);
    expect(parseSalaryAssignDraft({
      ...baseAssignment,
      effectiveFrom: "0000-01-01",
    }, "GBP").ok).toBe(false);
    expect(parseSalaryAssignDraft({
      ...baseAssignment,
      effectiveFrom: "2024-02-29",
    }, "GBP").ok).toBe(true);
  });

  it("refuses invalid salary amounts, rates and percentages before server writes", () => {
    const structure = {
      name: "Salary review",
      description: "",
      isActive: true,
      lines: [{
        componentTypeId: "11111111-1111-1111-1111-111111111111",
        amount: "123.456",
        rate: "0",
        percentage: "0",
        isRecurring: true,
        sortOrder: "100",
      }],
    };
    const fraction = parseSalaryStructureDraft(structure, "GBP");
    expect(fraction.ok).toBe(false);
    if (!fraction.ok) expect(fraction.error).toMatch(/decimal places/);

    const invalidPct = parseSalaryStructureDraft({
      ...structure,
      lines: [{ ...structure.lines[0]!, amount: "100", percentage: "unknown" }],
    }, "GBP");
    expect(invalidPct.ok).toBe(false);
    if (!invalidPct.ok) expect(invalidPct.error).toMatch(/percentage/i);

    const invalidRate = parseSalaryStructureDraft({
      ...structure,
      lines: [{ ...structure.lines[0]!, amount: "100", rate: "-12" }],
    }, "GBP");
    expect(invalidRate.ok).toBe(false);

    const valid = parseSalaryStructureDraft({
      ...structure,
      lines: [{ ...structure.lines[0]!, amount: "100.25", rate: "0", percentage: "12.34" }],
    }, "GBP");
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      const lines = valid.value["lines"] as Array<Record<string, number>>;
      expect(lines[0]?.amount_minor).toBe(10025);
      expect(lines[0]?.percentage_bps).toBe(1234);
    }
  });

  it("does not silently discard salary entries lacking a pay component", () => {
    const blankLine = {
      componentTypeId: "",
      amount: "0",
      rate: "0",
      percentage: "0",
      isRecurring: true,
      sortOrder: "100",
    };
    const baseStructure = { name: "Safeguarded salary", description: "", isActive: true };
    expect(parseSalaryStructureDraft({
      ...baseStructure,
      lines: [blankLine],
    }, "GBP").ok).toBe(true);

    const invalid = parseSalaryStructureDraft({
      ...baseStructure,
      lines: [{ ...blankLine, amount: "1500" }],
    }, "GBP");
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toMatch(/choose a pay component/i);

    const custom = parseSalaryAssignDraft({
      structureId: "22222222-2222-2222-2222-222222222222",
      effectiveFrom: "2026-04-01",
      changeReason: "Annual review",
      customLines: [{
        componentTypeId: "",
        amount: "0",
        rate: "12.5",
        percentage: "0",
        isRecurring: true,
        notes: "",
      }],
    }, "GBP");
    expect(custom.ok).toBe(false);
    if (!custom.ok) expect(custom.error).toMatch(/choose a pay component/i);
  });

});
