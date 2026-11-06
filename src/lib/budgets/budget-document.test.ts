import { describe, expect, it } from "vitest";
import {
  MAX_BUDGET_CELL_MINOR,
  MAX_BUDGET_SAVE_ROWS,
  validateBudgetDocumentInput,
} from "./budget-document";

const valid = {
  name: "  FY 2027  ",
  notes: "  Approved baseline  ",
  expectedUpdatedAt: "2026-11-06T05:30:21.123456+00:00",
  rows: [{ accountId: "income-1", months: Array.from({ length: 12 }, () => 100) }],
};

describe("atomic budget document input validation", () => {
  it("normalises name/notes and preserves microsecond revision tokens", () => {
    expect(validateBudgetDocumentInput(valid)).toMatchObject({
      name: "FY 2027",
      notes: "Approved baseline",
      expectedUpdatedAt: valid.expectedUpdatedAt,
    });
  });
  it("rejects duplicate accounts before the RPC writes anything", () => {
    expect(() =>
      validateBudgetDocumentInput({ ...valid, rows: [valid.rows[0], valid.rows[0]] }),
    ).toThrow(/duplicate account/);
  });
  it("requires exactly twelve months and safe whole-unit amounts", () => {
    for (const amounts of [
      [100],
      Array.from({ length: 12 }, () => 1.5),
      Array.from({ length: 12 }, () => MAX_BUDGET_CELL_MINOR + 1),
      Array.from({ length: 12 }, () => Number.NaN),
    ]) {
      expect(() =>
        validateBudgetDocumentInput({
          ...valid,
          rows: [{ accountId: "income-1", months: amounts }],
        }),
      ).toThrow();
    }
  });
  it("enforces 20000-line database bound before issuing a request", () => {
    expect(() =>
      validateBudgetDocumentInput({
        ...valid,
        rows: Array.from({ length: MAX_BUDGET_SAVE_ROWS + 1 }, (_, i) => ({
          accountId: `account-${i}`,
          months: Array.from({ length: 12 }, () => 0),
        })),
      }),
    ).toThrow(/Too many/);
  });
  it("rejects missing or invalid concurrency tokens", () => {
    for (const expectedUpdatedAt of ["", "invalid", null, "2026-11-06"]) {
      expect(() =>
        validateBudgetDocumentInput({ ...valid, expectedUpdatedAt }),
      ).toThrow(/version/);
    }
  });
  it("rejects empty names and overlong notes", () => {
    expect(() => validateBudgetDocumentInput({ ...valid, name: " " })).toThrow(/name/);
    expect(() =>
      validateBudgetDocumentInput({ ...valid, notes: "a".repeat(2001) }),
    ).toThrow(/notes/);
  });
  it("accepts an empty plan and maximum valid minor-unit amounts", () => {
    const empty = validateBudgetDocumentInput({ ...valid, rows: [] });
    expect(empty.rows).toEqual([]);
    const max = validateBudgetDocumentInput({
      ...valid,
      rows: [{ accountId: "income-1", months: Array.from({ length: 12 }, () => MAX_BUDGET_CELL_MINOR) }],
    });
    expect(max.rows[0]!.months[11]).toBe(MAX_BUDGET_CELL_MINOR);
  });
});
