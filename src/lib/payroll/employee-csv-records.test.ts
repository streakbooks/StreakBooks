import { describe, expect, it } from "vitest";
import { readPayrollCsvRecords } from "./employee-csv-records";

describe("payroll employee CSV records", () => {
  it("reads quoted commas, quotes and multiline fields as one record", () => {
    const result = readPayrollCsvRecords(
      'First name,Last name,Department\r\n"Ada","Lovelace","Research, ""special""\nDivision"\r\n',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toEqual([
      { line: 1, cells: ["First name", "Last name", "Department"] },
      { line: 2, cells: ["Ada", "Lovelace", 'Research, "special"\nDivision'] },
    ]);
  });

  it("supports BOM, blank lines, CR-only separators, and last line without newline", () => {
    const result = readPayrollCsvRecords(
      "\uFEFFFirst name,Last name,Hire date\r\rAda,Lee,2026-01-01",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records.map((row) => row.line)).toEqual([1, 3]);
    expect(result.records[1]?.cells).toEqual(["Ada", "Lee", "2026-01-01"]);
  });

  it("rejects unclosed quotes before any data is processed", () => {
    expect(readPayrollCsvRecords('Name,Notes\nA,"unfinished')).toMatchObject({
      ok: false,
      error: expect.stringContaining("Unclosed"),
    });
  });

  it("rejects unexpected suffix text after a closing quote", () => {
    expect(readPayrollCsvRecords('Name,Notes\nA,"note"extra')).toMatchObject({
      ok: false,
      error: expect.stringContaining("after closing quote"),
    });
  });

  it("rejects a quote embedded in an unquoted cell", () => {
    expect(readPayrollCsvRecords('Name,Notes\nA,fake"quote')).toMatchObject({
      ok: false,
      error: expect.stringContaining("Unexpected quote"),
    });
  });

  it("rejects files bigger than 1MB and more than 500 data rows", () => {
    expect(readPayrollCsvRecords("x".repeat(1_000_001)).ok).toBe(false);
    expect(
      readPayrollCsvRecords(
        ["Header", ...Array.from({ length: 501 }, (_, i) => `row${i}`)].join("\n"),
      ).ok,
    ).toBe(false);
  });
});
