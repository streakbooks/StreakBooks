import { convertMinorToBase } from "@/lib/accounting/fx";
import { cashProfitLoss, type CashPnlInput, type CashPnlEntry } from "./cash-profit-loss";
import { cashClassificationContext } from "./cash-classification";
import { findControlAccountIds } from "@/lib/accounting/control-accounts";

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
  const classification = cashClassificationContext(input, period);
  const controls = new Set([
    ...findControlAccountIds(input.accounts, "ar"),
    ...findControlAccountIds(input.accounts, "ap"),
  ]);
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
    if (opening) {
      for (const line of journal.lines) {
        if (!controls.has(line.accountId) || line.debit === line.credit) continue;
        const details = [...classification.opening.values()].filter(
          (e) => e.postedJournalId === journal.id && e.controlAccountId === line.accountId,
        );
        const gross = details.reduce((sum, e) => sum + e.grossMinor, 0n);
        const original = journal.lines.reduce(
          (sum, l) => sum + (l.accountId === line.accountId ? l.debit - l.credit : 0n),
          0n,
        );
        if (gross !== (original < 0n ? -original : original))
          classification.fail(
            "Imported opening receivables/payables need verified document-level recognition history before cash balance-sheet reporting.",
            ["Complete approved opening document evidence covering this control balance"],
            journal,
            line.accountId,
            original,
          );
      }
    }
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
    if (!opening && !settlement && !direct && balanceOnly) {
      const unresolved = journal.lines.find(
        (line) => classification.needsPolicy(line.accountId) && line.debit !== line.credit,
      );
      if (
        unresolved &&
        classification.classify(
          unresolved.accountId,
          journal,
          journal.date,
          unresolved.debit - unresolved.credit,
        ) !== unresolved.accountId
      )
        classification.fail(
          "A noncash inventory, prepaid, deferred or payroll balance adjustment needs verified classification evidence.",
          ["Verified source treatment for this noncash balance adjustment"],
          journal,
          unresolved.accountId,
          unresolved.debit - unresolved.credit,
        );
    }
    for (const line of journal.lines) {
      if (settlement && !cash.has(line.accountId)) continue;
      const base = (value: bigint) =>
        journal.currency === input.baseCurrency
          ? value
          : convertMinorToBase(value, journal.rate ?? "", journal.currency, input.baseCurrency);
      entries.push({
        accountId: opening
          ? classification.conversion(line.accountId, journal, line.debit - line.credit)
          : line.accountId,
        sourceAccountId: line.accountId,
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
    if (opening) {
      for (const evidence of classification.opening.values()) {
        if (evidence.postedJournalId !== journal.id || evidence.mode !== "recognize_on_settlement")
          continue;
        classification.openingSource(evidence.documentId);
        const signed =
          evidence.sourceKind === "sales_invoice" ? evidence.grossMinor : -evidence.grossMinor;
        const baseSigned =
          journal.currency === input.baseCurrency
            ? signed
            : convertMinorToBase(signed, journal.rate ?? "", journal.currency, input.baseCurrency);
        const offsets = new Map<string, bigint>([[evidence.controlAccountId, -baseSigned]]);
        const sign = evidence.sourceKind === "sales_invoice" ? 1n : -1n;
        for (const component of evidence.components) {
          const original = accounts.get(component.accountId)!;
          const target = ["income", "expense"].includes(original.account_type)
            ? evidence.equityAccountId
            : component.accountId;
          const value =
            journal.currency === input.baseCurrency
              ? component.amountMinor * sign
              : convertMinorToBase(
                  component.amountMinor * sign,
                  journal.rate ?? "",
                  journal.currency,
                  input.baseCurrency,
                );
          offsets.set(target, (offsets.get(target) ?? 0n) + value);
        }
        // Assign the original conversion rounding residual to the reviewed equity account.
        const residual = -[...offsets.values()].reduce((sum, value) => sum + value, 0n);
        offsets.set(
          evidence.equityAccountId,
          (offsets.get(evidence.equityAccountId) ?? 0n) + residual,
        );
        for (const [accountId, value] of offsets) {
          entries.push({
            accountId,
            sourceAccountId: evidence.controlAccountId,
            date: journal.date,
            journalId: journal.id,
            journalNumber: journal.number,
            sourceJournalId: journal.id,
            sourceType: journal.sourceType,
            sourceId: evidence.documentId,
            debit: value > 0n ? value : 0n,
            credit: value < 0n ? -value : 0n,
            reason: "settlement",
          });
        }
      }
    }
  }
  if (entries.reduce((sum, e) => sum + e.debit - e.credit, 0n) !== 0n)
    throw new Error(
      "Cash ledger does not balance. Reconcile source allocations, opening positions and exchange rounding before reporting.",
    );
  return entries;
}
