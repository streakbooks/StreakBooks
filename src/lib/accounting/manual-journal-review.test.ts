import { describe, expect, it } from "vitest";
import {
  directBankPostingWarningLines,
  inspectManualJournal,
  type JournalDraftLine,
} from "./manual-journal-review";

const base: JournalDraftLine[] = [
  { accountId: "expense", description: "Service", debit: "100.00", credit: "" },
  { accountId: "bank", description: "Payment", debit: "", credit: "100.00" },
];
const review = (lines: JournalDraftLine[]) =>
  inspectManualJournal(lines, "USD", ["expense", "bank"]);

describe("manual journal draft preflight", () => {
  it("accepts two balanced eligible accounts and ignores fully blank extra rows", () => {
    expect(
      review([...base, { accountId: "", description: "", debit: "", credit: "" }]),
    ).toMatchObject({
      debit: 10000n,
      credit: 10000n,
      difference: 0n,
      filledCount: 2,
      invalidLines: [],
      balanced: true,
      canPost: true,
    });
  });

  it("rejects nonnumeric values instead of treating them as zero", () => {
    const invalid = review([{ ...base[0]!, debit: "bad" }, base[1]!]);
    expect(invalid.invalidLines).toEqual([1]);
    expect(invalid.canPost).toBe(false);
  });

  it("rejects negative, double-sided, zero-amount and incomplete rows", () => {
    expect(review([{ ...base[0]!, debit: "-100.00" }, base[1]!]).canPost).toBe(false);
    expect(review([{ ...base[0]!, credit: "1.00" }, base[1]!]).canPost).toBe(false);
    expect(review([...base, { ...base[0]!, debit: "0.00" }]).invalidLines).toEqual([3]);
    expect(
      review([...base, { accountId: "", description: "Extra", debit: "", credit: "" }])
        .invalidLines,
    ).toEqual([3]);
  });

  it("rejects accounts that are inactive, controlled or otherwise unavailable", () => {
    expect(review([{ ...base[0]!, accountId: "tax-control" }, base[1]!]).invalidLines).toEqual([1]);
    expect(review([{ ...base[0]!, accountId: "" }, base[1]!]).invalidLines).toEqual([1]);
  });

  it("rejects amounts exceeding safe integer minor units", () => {
    const invalid = review([{ ...base[0]!, debit: "999999999999999.99" }, base[1]!]);
    expect(invalid.invalidLines).toEqual([1]);
    expect(invalid.canPost).toBe(false);
  });
});

describe("direct bank posting warning", () => {
  const accounts = [
    {
      id: "bank",
      account_type: "asset",
      subtype: "bank",
      is_active: true,
      is_postable: true,
    },
    {
      id: "cash",
      account_type: "asset",
      account_kind: "cash",
      is_active: true,
      is_postable: true,
    },
    {
      id: "receivable",
      account_type: "asset",
      subtype: "current_asset",
      is_active: true,
      is_postable: true,
    },
  ];

  it("identifies only selected bank or cash lines that contain an amount", () => {
    expect(
      directBankPostingWarningLines(
        [
          { ...base[0]!, accountId: "bank" },
          { ...base[1]!, accountId: "cash" },
          { ...base[0]!, accountId: "receivable" },
          { ...base[0]!, accountId: "bank", debit: "", credit: "" },
        ],
        accounts,
        true,
      ),
    ).toEqual([1, 2]);
  });

  it("does not warn when disabled or when the account is inactive or not postable", () => {
    const line = { ...base[0]!, accountId: "bank" };
    expect(directBankPostingWarningLines([line], accounts, false)).toEqual([]);
    expect(
      directBankPostingWarningLines([line], [{ ...accounts[0]!, is_active: false }], true),
    ).toEqual([]);
    expect(
      directBankPostingWarningLines([line], [{ ...accounts[0]!, is_postable: false }], true),
    ).toEqual([]);
  });
});
