import { describe, expect, it } from "vitest";
import type { ChartAccount } from "./chart.functions";
import {
  accountSignedMinor,
  canSelectForArchive,
  chartViewRows,
  formatAccountCodeForDisplay,
} from "./chart-view";

function account(
  id: string,
  code: string,
  name: string,
  parentId: string | null = null,
): ChartAccount {
  return {
    id,
    code,
    name,
    parentId,
    accountType: "asset",
    accountKind: "current_asset",
    normalBalance: "debit",
    isActive: true,
    isSystem: false,
    isControl: false,
    isLocked: false,
    debitMinor: 0,
    creditMinor: 0,
    ytdDebitMinor: 0,
    ytdCreditMinor: 0,
    transactionCount: 0,
  } as ChartAccount;
}

describe("chart of accounts display", () => {
  const roots = [
    account("b", "200", "Bravo"),
    account("a", "10", "Alpha"),
    account("c", "21", "Child", "b"),
    account("d", "11", "Detail", "a"),
  ];

  it("pads numeric account codes for display without changing nonnumeric identifiers", () => {
    expect(formatAccountCodeForDisplay("21", 4)).toBe("0021");
    expect(formatAccountCodeForDisplay("10000", 4)).toBe("10000");
    expect(formatAccountCodeForDisplay("A-21", 4)).toBe("A-21");
    expect(formatAccountCodeForDisplay("21", 99)).toBe("00000021");
  });

  it("sorts codes naturally in flat layout", () => {
    const result = chartViewRows(roots, new Set(), "flat", { key: "code", dir: "asc" }, true);
    expect(result.map((row) => row.account.code)).toEqual(["10", "11", "21", "200"]);
    expect(result.every((row) => row.depth === 0)).toBe(true);
  });

  it("sorts root siblings by name and retains each subtree", () => {
    const result = chartViewRows(roots, new Set(), "tree", { key: "name", dir: "desc" }, true);
    expect(result.map((row) => [row.account.id, row.depth])).toEqual([
      ["b", 0],
      ["c", 1],
      ["a", 0],
      ["d", 1],
    ]);
  });

  it("respects collapsed roots", () => {
    const result = chartViewRows(roots, new Set(["b"]), "tree", { key: "code", dir: "asc" }, true);
    expect(result.map((row) => row.account.id)).toEqual(["a", "d", "b"]);
  });

  it("keeps orphans visible and guards cycles", () => {
    const orphan = account("z", "1", "Orphan", "missing");
    const cycleA = account("x", "2", "Cycle A", "y");
    const cycleB = account("y", "3", "Cycle B", "x");
    const result = chartViewRows(
      [orphan, cycleA, cycleB],
      new Set(),
      "tree",
      { key: "code", dir: "asc" },
      true,
    );
    expect(new Set(result.map((row) => row.account.id))).toEqual(new Set(["z", "x", "y"]));
    expect(result).toHaveLength(3);
    const filtered = chartViewRows(
      [orphan],
      new Set(["missing"]),
      "tree",
      { key: "code", dir: "asc" },
      true,
    );
    expect(filtered.map((row) => row.account.id)).toEqual(["z"]);
  });

  it("compares credit-normal balances and switches activity between YTD and count", () => {
    const debit = {
      ...account("d", "1", "Debit"),
      debitMinor: 200,
      ytdDebitMinor: 500,
      transactionCount: 1,
    };
    const credit = {
      ...account("c", "2", "Credit"),
      normalBalance: "credit" as const,
      creditMinor: 400,
      debitMinor: 100,
      ytdCreditMinor: 700,
      transactionCount: 4,
    };
    expect(accountSignedMinor(credit)).toBe(300);
    expect(
      chartViewRows([debit, credit], new Set(), "flat", { key: "balance", dir: "desc" }, true)[0]
        ?.account.id,
    ).toBe("c");
    expect(
      chartViewRows([debit, credit], new Set(), "flat", { key: "activity", dir: "desc" }, true)[0]
        ?.account.id,
    ).toBe("c");
    expect(
      chartViewRows([debit, credit], new Set(), "flat", { key: "activity", dir: "desc" }, false)[0]
        ?.account.id,
    ).toBe("c");
  });

  it("blocks archived, system, control and locked accounts from archive selection", () => {
    const sample = account("a", "1", "A");
    expect(canSelectForArchive(sample)).toBe(true);
    for (const key of ["isSystem", "isControl", "isLocked"] as const) {
      expect(canSelectForArchive({ ...sample, [key]: true })).toBe(false);
    }
    expect(canSelectForArchive({ ...sample, isActive: false })).toBe(false);
  });
});
