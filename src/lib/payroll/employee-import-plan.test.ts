import { describe, expect, it } from "vitest";
import { planPayrollEmployeeImport } from "./employee-import-plan";

describe("planPayrollEmployeeImport", () => {
  it("skips existing employees without modifying import drafts", () => {
    const drafts = [{ employeeNumber: "A" }, { employeeNumber: "B" }];
    const before = new Set(["A"]);
    expect(planPayrollEmployeeImport(drafts, before))
      .toEqual({ toCreate: [drafts[1]], skipped: 1 });
    expect(before.size).toBe(1);
  });
  it("recognises newly created IDs at confirmation time", () => {
    const rows = [{ employeeNumber: "B" }, { employeeNumber: "C" }];
    expect(planPayrollEmployeeImport(rows, new Set(["A", "B"])))
      .toEqual({ toCreate: [rows[1]], skipped: 1 });
  });
  it("preserves multiple new rows with missing IDs", () => {
    const rows = [{ employeeNumber: "" }, { employeeNumber: "" }];
    expect(planPayrollEmployeeImport(rows, new Set())).toEqual({ toCreate: rows, skipped: 0 });
  });
  it("does not allow duplicated IDs inside a proposed import batch", () => {
    const rows = [{ employeeNumber: "E-100" }, { employeeNumber: "E-100" }];
    expect(planPayrollEmployeeImport(rows, new Set()))
      .toEqual({ toCreate: [rows[0]], skipped: 1 });
  });
  it("trims whitespace for duplicate detection", () => {
    const rows = [{ employeeNumber: " E-100 " }];
    expect(planPayrollEmployeeImport(rows, new Set(["E-100"])))
      .toEqual({ toCreate: [], skipped: 1 });
  });
});
