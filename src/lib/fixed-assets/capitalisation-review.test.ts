import { describe, expect, it } from "vitest";
import {
  reviewCapitalisableLines,
  selectCapitalisationReviewRows,
} from "./capitalisation-review";
import type { CapitaliseLine } from "./fixed-assets.functions";

const base = (lineId: string, patch: Partial<CapitaliseLine> = {}): CapitaliseLine => ({
  lineId,
  billId: "bill-" + lineId,
  billNumber: "B-" + lineId,
  supplier: "Hardware Supplier",
  billDate: "2026-10-05",
  currency: "USD",
  description: "Office equipment",
  accountId: "a1",
  accountCode: "1500",
  accountName: "Computer equipment",
  netMinor: 10000,
  taxMinor: 1000,
  registeredMinor: 0,
  ...patch,
});

describe("posted bill capitalisation review", () => {
  it("distinguishes unlinked, partial and linked base-currency lines", () => {
    const { rows, totals } = reviewCapitalisableLines(
      [
        base("unlinked"),
        base("partial", { registeredMinor: 5000 }),
        base("linked", { registeredMinor: 10000 }),
      ],
      "USD",
    );
    expect(rows.map((row) => row.status)).toEqual([
      "unlinked",
      "partially_linked",
      "linked",
    ]);
    expect(rows[0]?.indicativeUnlinkedMinor).toBe("11000");
    expect(rows[1]?.indicativeUnlinkedMinor).toBe("6000");
    expect(totals).toMatchObject({
      candidates: 3,
      unlinked: 1,
      partiallyLinked: 1,
      linked: 1,
    });
  });

  it("does not compare a foreign-currency bill with base-currency registered cost", () => {
    const { rows } = reviewCapitalisableLines(
      [base("fx", { currency: "EUR", registeredMinor: 8000 })],
      "USD",
    );
    expect(rows[0]).toMatchObject({
      status: "fx_review",
      indicativeUnlinkedMinor: null,
    });
  });

  it("exposes overlinked and non-purchase cases instead of claiming a match", () => {
    const { rows, totals } = reviewCapitalisableLines(
      [
        base("over", { registeredMinor: 12000 }),
        base("credit", { netMinor: -100, taxMinor: 0 }),
      ],
      "USD",
    );
    expect(rows.map((row) => row.status)).toEqual(["overlinked", "non_purchase"]);
    expect(totals).toMatchObject({ overlinked: 1, nonPurchase: 1 });
  });

  it("rejects unsafe and duplicate source values", () => {
    expect(() =>
      reviewCapitalisableLines(
        [base("bad", { registeredMinor: Number.MAX_SAFE_INTEGER + 1 })],
        "USD",
      ),
    ).toThrow(/exact/i);
    expect(() => reviewCapitalisableLines([base("a"), base("a")], "USD")).toThrow(/duplicate/i);
  });

  it("filters by status, search, account and sorts by bill date", () => {
    const { rows } = reviewCapitalisableLines(
      [
        base("old", { billDate: "2026-01-01" }),
        base("recent", { billDate: "2026-11-01", supplier: "Other Ltd", accountId: "a2" }),
        base("linked", { registeredMinor: 10000 }),
      ],
      "USD",
    );
    const selected = selectCapitalisationReviewRows(rows, {
      status: "attention",
      query: "",
      accountId: "",
    });
    expect(selected.map((r) => r.lineId)).toEqual(["recent", "old"]);
    expect(
      selectCapitalisationReviewRows(rows, { status: "all", query: "Other", accountId: "a2" })
        .map((r) => r.lineId),
    ).toEqual(["recent"]);
    expect(
      selectCapitalisationReviewRows(rows, { status: "unlinked", query: "", accountId: "a1" })
        .map((r) => r.lineId),
    ).toEqual(["old"]);
  });
});
