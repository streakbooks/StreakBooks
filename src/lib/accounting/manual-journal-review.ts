import { tryParseMinor } from "@/lib/purchases/money-input";
import { isBankOrCashAccount } from "@/lib/purchases/bank-account-rules";

export type JournalDraftLine = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
};

export type JournalDraftReview = {
  debit: bigint;
  credit: bigint;
  difference: bigint;
  filledCount: number;
  invalidLines: number[];
  balanced: boolean;
  canPost: boolean;
};

export type JournalWarningAccount = {
  id: string;
  account_type: string;
  is_active: boolean;
  is_postable: boolean;
  account_kind?: string | null;
  subtype?: string | null;
  is_payment_enabled?: boolean | null;
};

/** Non-blocking warning lines for an enabled direct bank/cash posting preference. */
export function directBankPostingWarningLines(
  lines: readonly JournalDraftLine[],
  accounts: readonly JournalWarningAccount[],
  enabled: boolean,
): number[] {
  if (!enabled) return [];
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return lines.flatMap((line, index) => {
    const account = byId.get(line.accountId);
    const hasAmount = Boolean(line.debit.trim() || line.credit.trim());
    if (!account || !hasAmount || !isBankOrCashAccount(account, new Set())) return [];
    return [index + 1];
  });
}

/**
 * Review before calling the posting RPC. Invalid, negative, unsafe, zero or
 * incomplete lines must never be silently converted to zero or posted.
 * Supabase posting rules remain the authoritative final validation.
 */
export function inspectManualJournal(
  lines: readonly JournalDraftLine[],
  currency: string,
  eligibleAccountIds: readonly string[],
): JournalDraftReview {
  const eligible = new Set(eligibleAccountIds);
  const safeMax = BigInt(Number.MAX_SAFE_INTEGER);
  const invalidLines: number[] = [];
  let debit = 0n;
  let credit = 0n;
  let filledCount = 0;

  for (const [index, line] of lines.entries()) {
    const debitText = line.debit.trim();
    const creditText = line.credit.trim();
    const used = Boolean(line.accountId || line.description.trim() || debitText || creditText);
    if (!used) continue;

    const d = debitText ? tryParseMinor(debitText, currency) : 0n;
    const c = creditText ? tryParseMinor(creditText, currency) : 0n;
    const invalid =
      !line.accountId ||
      !eligible.has(line.accountId) ||
      d === null ||
      c === null ||
      (d !== null && (d < 0n || d > safeMax)) ||
      (c !== null && (c < 0n || c > safeMax)) ||
      (d !== null && c !== null && ((d > 0n && c > 0n) || (d === 0n && c === 0n)));

    if (invalid) {
      invalidLines.push(index + 1);
      continue;
    }

    debit += d ?? 0n;
    credit += c ?? 0n;
    filledCount++;
  }

  const difference = debit - credit;
  const balanced = debit > 0n && credit > 0n && difference === 0n;
  return {
    debit,
    credit,
    difference,
    filledCount,
    invalidLines,
    balanced,
    canPost: filledCount >= 2 && invalidLines.length === 0 && balanced,
  };
}
