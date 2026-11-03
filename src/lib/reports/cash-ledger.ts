import { convertMinorToBase } from "@/lib/accounting/fx";
import { cashProfitLoss, type CashPnlInput, type CashPnlEntry } from "./cash-profit-loss";

/** Balanced management cash ledger, including settlement tax/capital components.
 * Noncash income/expense adjustments follow the P&L policy and are excluded.
 * Opening and pure balance-sheet journals preserve exact posted opening positions.
 */
export function cashLedger(
  input: CashPnlInput,
  period: { from: string; to: string },
): CashPnlEntry[] {
  const entries = cashProfitLoss(input, period, true);
  const cash = new Set(input.cashAccountIds);
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const settlementJournals = new Set(
    [...input.payments, ...input.refunds].flatMap((p) => [
      p.journalId,
      ...(p.voidJournalId ? [p.voidJournalId] : []),
    ]),
  );
  const sources = new Set(
    input.journals
      .filter((j) =>
        ["sales_invoice", "purchase_bill", "sales_credit_note", "purchase_credit_note"].includes(
          j.sourceType,
        ),
      )
      .map((j) => j.id),
  );
  for (const journal of input.journals) {
    if (journal.date < period.from || journal.date > period.to) continue;
    const settlement = settlementJournals.has(journal.id);
    const opening = journal.sourceType === "opening_balance";
    const balanceOnly = !journal.lines.some((l) =>
      ["income", "expense"].includes(accounts.get(l.accountId)!.account_type),
    );
    const direct = journal.lines.some(
      (l) => cash.has(l.accountId) && (l.debit !== 0n || l.credit !== 0n),
    );
    if (
      !settlement &&
      !opening &&
      (!balanceOnly ||
        direct ||
        sources.has(journal.id) ||
        (journal.reverses && sources.has(journal.reverses)) ||
        journal.sourceType === "fx_revaluation")
    )
      continue;
    for (const line of journal.lines) {
      if (settlement && !cash.has(line.accountId)) continue;
      const base = (value: bigint) =>
        journal.currency === input.baseCurrency
          ? value
          : convertMinorToBase(value, journal.rate ?? "", journal.currency, input.baseCurrency);
      entries.push({
        accountId: line.accountId,
        date: journal.date,
        journalId: journal.id,
        journalNumber: journal.number,
        sourceJournalId: journal.id,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId,
        debit: base(line.debit),
        credit: base(line.credit),
        reason: "direct_cash",
      });
    }
  }
  if (entries.reduce((sum, e) => sum + e.debit - e.credit, 0n) !== 0n)
    throw new Error(
      "Cash ledger does not balance. Reconcile source allocations, opening positions and exchange rounding before reporting.",
    );
  return entries;
}
