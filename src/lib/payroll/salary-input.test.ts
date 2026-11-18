import { describe, expect, it } from "vitest";
import {
  PAYROLL_SALARY_MAX_MINOR,
  parsePayrollPercentageBps,
  parsePayrollSalaryMinor,
} from "./salary-input";

describe("Payroll salary input integrity", () => {
  it("parses exact GBP fixed amounts and hourly rates", () => {
    expect(parsePayrollSalaryMinor("1234.50", "GBP", "Fixed")).toBe(123450n);
    expect(parsePayrollSalaryMinor("", "GBP", "Fixed")).toBe(0n);
    expect(parsePayrollSalaryMinor("0", "GBP", "Rate")).toBe(0n);
  });

  it("rejects money that would be rounded or converted to a negative", () => {
    for (const value of ["12.345", "-1", "not-a-number", "1e5", "1,000"]) {
      expect(() => parsePayrollSalaryMinor(value, "GBP", "Salary rate")).toThrow();
    }
  });

  it("respects zero- and three-decimal currencies", () => {
    expect(parsePayrollSalaryMinor("1250", "JPY", "Salary")).toBe(1250n);
    expect(() => parsePayrollSalaryMinor("1250.10", "JPY", "Salary")).toThrow(/0 decimal/);
    expect(parsePayrollSalaryMinor("25.123", "KWD", "Salary")).toBe(25123n);
    expect(() => parsePayrollSalaryMinor("25.1234", "KWD", "Salary")).toThrow(/3 decimal/);
  });

  it("enforces the PostgreSQL salary line upper bound before JS Number conversion", () => {
    expect(parsePayrollSalaryMinor("9000000000000", "GBP", "Salary")).toBe(
      PAYROLL_SALARY_MAX_MINOR,
    );
    expect(() => parsePayrollSalaryMinor("9000000000000.01", "GBP", "Salary")).toThrow(/limit/);
  });

  it("parses percentages exactly as integer basis points", () => {
    expect(parsePayrollPercentageBps("")).toBe(0);
    expect(parsePayrollPercentageBps("12.34")).toBe(1234);
    expect(parsePayrollPercentageBps("10000")).toBe(1000000);
    expect(parsePayrollPercentageBps("0.01")).toBe(1);
  });

  it("rejects malformed, negative, over-precise and over-limit percentages", () => {
    for (const value of ["abc", "-1", "1e3", "NaN", "2.345", "10000.01"]) {
      expect(() => parsePayrollPercentageBps(value)).toThrow();
    }
  });
});
