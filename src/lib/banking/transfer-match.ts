/**
 * Decide which transfer journal line should clear a source statement line (BK-11 leftover).
 * Positive statement amount = money in = bank debit; negative = money out = bank credit.
 */

export type TransferMatchSide = {
  bankAccountId: string;
  /** Signed ledger amount on that bank GL (debit − credit). */
  expectedLineAmountMinor: number;
};

export function resolveTransferMatchSide(input: {
  statementBankAccountId: string;
  statementAmountMinor: number;
  fromBankAccountId: string;
  toBankAccountId: string;
  /** Amount leaving the source account (always positive). */
  fromAmountMinor: number;
  /** Amount arriving at the destination (positive; equals from for same-currency). */
  toAmountMinor: number;
}): TransferMatchSide {
  const stmt = Math.trunc(Number(input.statementAmountMinor));
  const fromAmt = Math.trunc(Number(input.fromAmountMinor));
  const toAmt = Math.trunc(Number(input.toAmountMinor));
  if (!(fromAmt > 0) || !(toAmt > 0)) {
    throw new Error("Transfer amounts must be positive");
  }

  if (input.statementBankAccountId === input.fromBankAccountId) {
    if (!(stmt < 0)) {
      throw new Error("Source-account statement line must be a money-out amount");
    }
    if (Math.abs(stmt) !== fromAmt) {
      throw new Error("Statement amount does not match the transfer amount leaving this account");
    }
    return {
      bankAccountId: input.fromBankAccountId,
      expectedLineAmountMinor: -fromAmt,
    };
  }

  if (input.statementBankAccountId === input.toBankAccountId) {
    if (!(stmt > 0)) {
      throw new Error("Destination-account statement line must be a money-in amount");
    }
    if (stmt !== toAmt) {
      throw new Error(
        "Statement amount does not match the transfer amount arriving at this account",
      );
    }
    return {
      bankAccountId: input.toBankAccountId,
      expectedLineAmountMinor: toAmt,
    };
  }

  throw new Error("Statement line is not on either side of this transfer");
}
