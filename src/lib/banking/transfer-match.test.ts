import { describe, expect, it } from "vitest";
import { resolveTransferMatchSide } from "@/lib/banking/transfer-match";

describe("resolveTransferMatchSide", () => {
  it("matches money-out on the source account to a credit line", () => {
    expect(
      resolveTransferMatchSide({
        statementBankAccountId: "from",
        statementAmountMinor: -5000,
        fromBankAccountId: "from",
        toBankAccountId: "to",
        fromAmountMinor: 5000,
        toAmountMinor: 5000,
      }),
    ).toEqual({ bankAccountId: "from", expectedLineAmountMinor: -5000 });
  });

  it("matches money-in on the destination account to a debit line", () => {
    expect(
      resolveTransferMatchSide({
        statementBankAccountId: "to",
        statementAmountMinor: 5000,
        fromBankAccountId: "from",
        toBankAccountId: "to",
        fromAmountMinor: 5000,
        toAmountMinor: 5000,
      }),
    ).toEqual({ bankAccountId: "to", expectedLineAmountMinor: 5000 });
  });

  it("supports FX where destination amount differs", () => {
    expect(
      resolveTransferMatchSide({
        statementBankAccountId: "to",
        statementAmountMinor: 4200,
        fromBankAccountId: "from",
        toBankAccountId: "to",
        fromAmountMinor: 5000,
        toAmountMinor: 4200,
      }),
    ).toEqual({ bankAccountId: "to", expectedLineAmountMinor: 4200 });
  });

  it("rejects wrong account / sign / amount", () => {
    expect(() =>
      resolveTransferMatchSide({
        statementBankAccountId: "other",
        statementAmountMinor: -5000,
        fromBankAccountId: "from",
        toBankAccountId: "to",
        fromAmountMinor: 5000,
        toAmountMinor: 5000,
      }),
    ).toThrow(/either side/i);
    expect(() =>
      resolveTransferMatchSide({
        statementBankAccountId: "from",
        statementAmountMinor: 5000,
        fromBankAccountId: "from",
        toBankAccountId: "to",
        fromAmountMinor: 5000,
        toAmountMinor: 5000,
      }),
    ).toThrow(/money-out/i);
    expect(() =>
      resolveTransferMatchSide({
        statementBankAccountId: "from",
        statementAmountMinor: -4000,
        fromBankAccountId: "from",
        toBankAccountId: "to",
        fromAmountMinor: 5000,
        toAmountMinor: 5000,
      }),
    ).toThrow(/does not match/i);
  });
});
