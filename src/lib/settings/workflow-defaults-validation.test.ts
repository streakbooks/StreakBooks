import { describe, expect, it } from "vitest";
import {
  parsePaymentTermsDays,
  parseWorkflowBoolean,
  parseWorkflowCsvDateFormat,
  parseWorkflowText,
  parseWorkflowWholeDays,
} from "./workflow-defaults-validation";

describe("workflow payment terms validation", () => {
  it("accepts zero days and reasonable whole-day terms", () => {
    expect(parsePaymentTermsDays("0")).toBe(0);
    expect(parsePaymentTermsDays(" 30 ")).toBe(30);
    expect(parsePaymentTermsDays("3650")).toBe(3650);
  });

  it("does not silently replace missing or malformed numbers with 30", () => {
    for (const value of ["", " ", "-1", "2.5", "1e2", "NaN", "3651", "123abc"]) {
      expect(parsePaymentTermsDays(value)).toBeNull();
    }
  });
});

describe("server workflow settings input validation", () => {
  it("preserves explicit zero and explicit false", () => {
    expect(parseWorkflowWholeDays(0, 30, 0, 3650)).toBe(0);
    expect(parseWorkflowBoolean(false, true)).toBe(false);
    expect(parseWorkflowWholeDays(undefined, 30, 0, 3650)).toBe(30);
    expect(parseWorkflowBoolean(undefined, false)).toBe(false);
  });

  it.each([-1, 3651, 1.5, NaN, Infinity, null, "30", "", true])(
    "rejects malformed payment terms: %s",
    (value) => {
      expect(() => parseWorkflowWholeDays(value, 30, 0, 3650)).toThrow();
    },
  );

  it.each([0, 366, null, "14", true])("rejects invalid quote days: %s", (value) => {
    expect(() => parseWorkflowWholeDays(value, 30, 1, 365)).toThrow();
  });

  it.each([null, "false", 1, 0, "true"])("rejects unsafe boolean flags: %s", (value) => {
    expect(() => parseWorkflowBoolean(value, false)).toThrow();
  });

  it("does not truncate or silently coerce workflow text", () => {
    expect(parseWorkflowText("  Hello  ")).toBe("Hello");
    expect(parseWorkflowText("")).toBeNull();
    expect(() => parseWorkflowText("a".repeat(2001))).toThrow();
    expect(() => parseWorkflowText({})).toThrow();
  });

  it("accepts only date formats supported by the banking importer", () => {
    expect(parseWorkflowCsvDateFormat(undefined)).toBe("YYYY-MM-DD");
    expect(parseWorkflowCsvDateFormat("DD/MM/YYYY")).toBe("DD/MM/YYYY");
    expect(parseWorkflowCsvDateFormat("MM/DD/YYYY")).toBe("MM/DD/YYYY");
    expect(() => parseWorkflowCsvDateFormat("MM-DD-YYYY")).toThrow();
    expect(() => parseWorkflowCsvDateFormat("")).toThrow();
  });
});
