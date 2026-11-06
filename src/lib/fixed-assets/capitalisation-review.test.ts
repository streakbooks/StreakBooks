import { describe, expect, it } from "vitest";
import {
  capitalisationReviewCsv,
  pageCapitalisationBillLines,
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

  it("produces a signed, currency-labelled and formula-safe CSV", () => {
    const rows = reviewCapitalisableLines(
      [
        base("a", {
          billNumber: "=IMPORTXML(1)",
          supplier: "+bad",
          description: 'Laptop, with "dock"',
          accountCode: "@unsafe",
          registeredMinor: 500,
        }),
      ],
      "USD",
    ).rows;
    const csv = capitalisationReviewCsv(rows, "2026-11-06", "USD");
    expect(csv).toContain("Bills through");
    expect(csv).toContain("'=IMPORTXML(1)");
    expect(csv).toContain("'+bad");
    expect(csv).toContain("'@unsafe");
    expect(csv).toContain("USD");
    expect(csv.split("\r\n")).toHaveLength(2);
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

  it("retrieves more than 300 candidates without truncation and chunks long account filters", async () => {
    const accountIds = Array.from({ length: 51 }, (_, i) => "account-" + i);
    const calls: Array<{ ids: string[]; from: number; to: number }> = [];
    const firstChunk = Array.from({ length: 1101 }, (_, i) => ({ id: "a-" + i }));
    const secondChunk = Array.from({ length: 80 }, (_, i) => ({ id: "b-" + i }));
    const lines = await pageCapitalisationBillLines(accountIds, async (ids, from, to) => {
      calls.push({ ids, from, to });
      const source = ids.length === 50 ? firstChunk : secondChunk;
      return { data: source.slice(from, to + 1), error: null };
    });
    expect(lines).toHaveLength(1181);
    expect(calls.map((call) => [call.ids.length, call.from])).toEqual([
      [50, 0],
      [50, 1000],
      [50, 1101],
      [1, 0],
      [1, 80],
    ]);
  });

  it("propagates read errors and detects duplicated source lines", async () => {
    await expect(
      pageCapitalisationBillLines(["a"], async () => ({
        data: null,
        error: { message: "DB unavailable" },
      })),
    ).rejects.toThrow("DB unavailable");
    await expect(
      pageCapitalisationBillLines(["a", ...Array.from({ length: 50 }, () => "b")],
        async (_ids, from) => ({ data: from === 0 ? [{ id: "repeat" }] : [], error: null })),
    ).rejects.toThrow(/duplicate/i);
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
