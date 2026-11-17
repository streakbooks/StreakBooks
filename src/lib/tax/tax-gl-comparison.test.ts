import { describe, expect, it } from "vitest";
import { compareTaxReturnWithGl } from "./tax-gl-comparison";

const line = (
  account_id: string,
  debit_minor: bigint,
  credit_minor: bigint,
  source_type: string,
) => ({ account_id, debit_minor, credit_minor, source_type });

describe("Tax GL comparison (read-only)", () => {
  it("uses different debit/credit normal balances and separates settlements", () => {
    const r = compareTaxReturnWithGl({
      basis: "accrual",
      outputAccountId: "out",
      inputAccountId: "in",
      outputReturnMinor: 2300,
      inputReturnMinor: 800,
      lines: [
        line("out", 0n, 2500n, "sales_invoice"),
        line("out", 200n, 0n, "reversal"),
        line("out", 900n, 0n, "tax_adjustment"),
        line("in", 800n, 0n, "purchase_bill"),
        line("in", 0n, 200n, "tax_adjustment"),
        line("other", 0n, 500n, "manual"),
      ],
    });
    expect(r.output).toMatchObject({
      documentMinor: "2500",
      reversalMinor: "-200",
      otherMinor: "-900",
      totalMinor: "1400",
      returnMinor: "2300",
      documentAndReversalDifferenceMinor: "0",
      journalLines: 3,
    });
    expect(r.input).toMatchObject({
      documentMinor: "800",
      otherMinor: "-200",
      totalMinor: "600",
      documentAndReversalDifferenceMinor: "0",
    });
    expect(r.netReturnMinor).toBe("1500");
    expect(r.netDocumentAndReversalMinor).toBe("1500");
    expect(r.netAllGlMinor).toBe("800");
    expect(r.netDiagnosticDifferenceMinor).toBe("0");
    expect(r.comparisonAvailable).toBe(true);
    expect(r.journalLines).toBe(5);
  });

  it("marks cash reconciliation as informational only", () => {
    const r = compareTaxReturnWithGl({
      basis: "cash",
      outputAccountId: "o",
      inputAccountId: "i",
      outputReturnMinor: 50,
      inputReturnMinor: 0,
      lines: [],
    });
    expect(r.comparisonAvailable).toBe(false);
    expect(r.warnings[0]).toMatch(/Cash-basis/);
  });

  it("rejects unsafe values and overlapping mappings", () => {
    const base = {
      basis: "accrual" as const,
      outputAccountId: "o",
      inputAccountId: "i",
      outputReturnMinor: 5,
      inputReturnMinor: 0,
      lines: [],
    };
    expect(() => compareTaxReturnWithGl({ ...base, outputAccountId: "i" })).toThrow(/distinct/);
    expect(() => compareTaxReturnWithGl({ ...base, outputReturnMinor: 1.5 })).toThrow(
      /safe integer/,
    );
  });

  it("handles large signed journal movements without losing precision", () => {
    const r = compareTaxReturnWithGl({
      basis: "accrual",
      outputAccountId: "o",
      inputAccountId: "i",
      outputReturnMinor: 0,
      inputReturnMinor: 0,
      lines: [line("o", 0n, BigInt(Number.MAX_SAFE_INTEGER) + 42n, "sales_invoice")],
    });
    expect(r.output.totalMinor).toBe((BigInt(Number.MAX_SAFE_INTEGER) + 42n).toString());
  });
});
