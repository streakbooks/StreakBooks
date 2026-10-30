import { describe, expect, it } from "vitest";
import { prepareProjectsCsv } from "./projects-import";

describe("projects CSV import validation", () => {
  const header = "Project Code,Name,Customer,Start date";
  it("accepts projects with optional customer and ISO start date", () => {
    expect(prepareProjectsCsv(`${header}\nPR-1,New office,Acme,2026-10-01\nPR-2,Internal,,`)).toEqual([
      { sourceRow: 2, code: "PR-1", name: "New office", customer: "Acme", startDate: "2026-10-01" },
      { sourceRow: 3, code: "PR-2", name: "Internal", customer: null, startDate: null },
    ]);
  });
  it("rejects repeated project codes and invalid dates", () => {
    expect(() => prepareProjectsCsv(`${header}\nPR-1,One,,\nPR-1,Two,,`)).toThrow(/duplicate/i);
    expect(() => prepareProjectsCsv(`${header}\nPR-1,One,,2026-02-30`)).toThrow(/date/i);
  });
  it("rejects invalid codes, overlong names, missing columns and empty files", () => {
    expect(() => prepareProjectsCsv(`${header}\nPR 1,One,,`)).toThrow(/code/i);
    expect(() => prepareProjectsCsv(`${header}\nPR-1,${"a".repeat(161)},,`)).toThrow(/name/i);
    expect(() => prepareProjectsCsv("Project Code,Name\nPR-1,One")).toThrow(/required column/i);
    expect(() => prepareProjectsCsv(header)).toThrow(/no project/i);
  });
});
