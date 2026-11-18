import { describe, expect, it } from "vitest";
import {
  explainReconciliationDifference,
  selectReconciliationReviewRows,
  summarizeReconciliationExceptions,
} from "./reconciliation-review";
import type { ReconciliationAccountRow } from "./reconciliation";

const row = (
  accountId: string,
  differenceMinor: string,
  patch: Partial<ReconciliationAccountRow> = {},
): ReconciliationAccountRow => ({
  accountId,
  accountCode: accountId,
  accountName: "Asset account " + accountId,
  linkedAssets: 1,
  registerCostMinor: "10000",
  registerAccumulatedMinor: "1000",
  registerNetMinor: "9000",
  ledgerNetMinor: (9000n + BigInt(differenceMinor)).toString(),
  differenceMinor,
  status: BigInt(differenceMinor) === 0n ? "matched" : "variance",
  ...patch,
});

describe("fixed asset GL reconciliation review helpers", () => {
  it("reports absolute variance rather than allowing offsetting differences to disappear", () => {
    const summary = summarizeReconciliationExceptions([
      row("1500", "10000"),
      row("1590", "-9000"),
      row("1600", "0"),
    ]);
    expect(summary).toEqual({
      differences: 2,
      glGreater: 1,
      glLower: 1,
      grossDifferenceMinor: "19000",
      largestDifferenceMinor: "10000",
      largestAccountId: "1500",
    });
  });

  it("handles values larger than the JS safe integer without precision loss", () => {
    const total = summarizeReconciliationExceptions([
      row("1", "9007199254740993"),
      row("2", "-9007199254740992"),
    ]);
    expect(total.grossDifferenceMinor).toBe("18014398509481985");
  });

  it("filters on account identity and sorts by largest absolute discrepancy", () => {
    const rows = [
      row("1600", "-200", { accountName: "Computer assets" }),
      row("1500", "50", { accountName: "Vehicle assets" }),
      row("1550", "0"),
    ];
    const selected = selectReconciliationReviewRows(rows, {
      status: "variance",
      query: "asset",
      order: "largest_difference",
    });
    expect(selected.map((r) => r.accountCode)).toEqual(["1600", "1500"]);
    expect(
      selectReconciliationReviewRows(rows, {
        status: "matched",
        query: "1550",
        order: "account",
      }).map((r) => r.accountId),
    ).toEqual(["1550"]);
    // Input remains untouched.
    expect(rows[0]?.accountCode).toBe("1600");
  });

  it("provides cautious positive, negative and matched explanations", () => {
    expect(explainReconciliationDifference("500").heading).toMatch(/greater/i);
    expect(explainReconciliationDifference("-500").heading).toMatch(/lower/i);
    expect(explainReconciliationDifference("0").heading).toMatch(/agree/i);
  });

  it("fails on duplicate rows or status/variance inconsistencies", () => {
    expect(() => summarizeReconciliationExceptions([row("a", "0"), row("a", "0")])).toThrow(
      /duplicate/i,
    );
    expect(() => summarizeReconciliationExceptions([row("a", "1", { status: "matched" })])).toThrow(
      /status/i,
    );
  });
});
