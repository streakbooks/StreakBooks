import { convertMinorToBase } from "@/lib/accounting/fx";
import type { AccountMeta } from "@/lib/accounting/ledger-data";
import { findControlAccountIds } from "@/lib/accounting/control-accounts";
import {
  recogniseCashSettlements,
  apportionCashAmount,
  type CashSourceDocument,
} from "./cash-settlement";
import { isReportDate } from "./date-validation";

export type CashJournal = {
  id: string;
  companyId: string;
  date: string;
  number: string;
  sourceType: string;
  sourceId: string | null;
  currency: string;
  rate: string | null;
  reverses: string | null;
  lines: Array<{ accountId: string; debit: bigint; credit: bigint }>;
};
export type CashPayment = {
  id: string;
  companyId: string;
  side: "income" | "expense";
  journalId: string;
  voidJournalId: string | null;
  currency: string;
  rate: string | null;
  amount: bigint;
};
export type CashAllocation = {
  id: string;
  companyId: string;
  paymentId: string;
  documentId: string;
  amount: bigint;
  reversedOn: string | null;
};
export type CashRefund = CashPayment & {
  uses: Array<{ id: string; documentId: string; kind: string; amount: bigint }>;
};
export type CashPnlInput = {
  companyId: string;
  baseCurrency: string;
  accounts: AccountMeta[];
  cashAccountIds: string[];
  journals: CashJournal[];
  payments: CashPayment[];
  allocations: CashAllocation[];
  refunds: CashRefund[];
  creditAllocations?: Array<{
    documentId: string;
    creditId: string;
    allocatedOn: string | null;
    reversedOn: string | null;
  }>;
};
export type CashPnlEntry = {
  accountId: string;
  date: string;
  journalId: string;
  journalNumber: string;
  sourceJournalId: string;
  sourceType: string;
  sourceId: string | null;
  debit: bigint;
  credit: bigint;
  reason: "settlement" | "direct_cash";
};

/** Management cash recognition, never a mutation of the posted accrual ledger. */
export function cashProfitLoss(
  input: CashPnlInput,
  period: { from: string; to: string },
): CashPnlEntry[] {
  if (!isReportDate(period.from) || !isReportDate(period.to) || period.from > period.to)
    throw new Error("Choose a valid cash reporting period");
  const accounts = new Map(input.accounts.map((account) => [account.id, account]));
  const cash = new Set(input.cashAccountIds);
  const needsCashPolicy = (accountId: string) => {
    const account = accounts.get(accountId);
    if (account?.account_type === "income" || account?.account_type === "expense") return false;
    return /inventory|stock|prepaid|prepayment|deferred|accrued|payroll|wages/.test(
      [account?.account_kind, account?.subtype, account?.system_key].join(" ").toLowerCase(),
    );
  };
  const ar = new Set(
    findControlAccountIds(
      input.accounts.map((a) => ({ ...a, is_active: true })),
      "ar",
    ),
  );
  const ap = new Set(
    findControlAccountIds(
      input.accounts.map((a) => ({ ...a, is_active: true })),
      "ap",
    ),
  );
  const journals = new Map<string, CashJournal>();
  const sources = new Map<string, CashJournal>();
  for (const journal of input.journals) {
    if (
      journal.companyId !== input.companyId ||
      journals.has(journal.id) ||
      !isReportDate(journal.date)
    )
      throw new Error("Invalid or cross-company cash journal");
    let debit = 0n,
      credit = 0n;
    for (const line of journal.lines) {
      if (!accounts.has(line.accountId) || line.debit < 0n || line.credit < 0n)
        throw new Error("Cash journal contains an invalid account or amount");
      debit += line.debit;
      credit += line.credit;
    }
    if (debit !== credit) throw new Error("Cash reporting requires balanced posted journals");
    journals.set(journal.id, journal);
    if (
      journal.sourceId &&
      ["sales_invoice", "purchase_bill", "sales_credit_note", "purchase_credit_note"].includes(
        journal.sourceType,
      )
    ) {
      if (sources.has(journal.sourceId))
        throw new Error("Multiple original journals for one cash source document");
      sources.set(journal.sourceId, journal);
    }
  }
  const inPeriod = (date: string) => date >= period.from && date <= period.to;
  const base = (amount: bigint, currency: string, rate: string | null) => {
    if (currency === input.baseCurrency) return amount;
    if (rate === null) throw new Error("Cash reporting requires the original posted exchange rate");
    return convertMinorToBase(amount, rate, currency, input.baseCurrency);
  };
  const bankNet = (journal: CashJournal) =>
    journal.lines.reduce(
      (sum, line) =>
        cash.has(line.accountId)
          ? sum + base(line.debit - line.credit, journal.currency, journal.rate)
          : sum,
      0n,
    );
  const handled = new Set<string>();
  const documents = new Map<
    string,
    { source: CashSourceDocument; sign: bigint; side: "income" | "expense"; journal: CashJournal }
  >();
  const events = new Map<string, CashJournal>();
  const cashTargets = new Map<string, bigint>();
  function attach(
    documentId: string,
    side: "income" | "expense",
    creditNote: boolean,
    payment: CashPayment,
    amount: bigint,
    settlement: CashJournal,
    eventId: string,
    reversal: boolean,
  ) {
    const original = sources.get(documentId);
    const expected =
      side === "income"
        ? creditNote
          ? "sales_credit_note"
          : "sales_invoice"
        : creditNote
          ? "purchase_credit_note"
          : "purchase_bill";
    if (!original || original.sourceType !== expected)
      throw new Error(
        "A cash allocation has no matching posted invoice, bill or credit note; imported opening balances need source detail",
      );
    if (original.date > settlement.date)
      throw new Error(
        "Cash received before the source document needs an advance-payment recognition policy",
      );
    if (original.currency !== payment.currency)
      throw new Error("Cash settlement and source document currencies do not match");
    const control = side === "income" ? ar : ap;
    const orientation = (side === "income" ? -1n : 1n) * (creditNote ? -1n : 1n);
    const gross = -original.lines.reduce(
      (sum, line) =>
        control.has(line.accountId) ? sum + (line.debit - line.credit) * orientation : sum,
      0n,
    );
    const key = original.id;
    let document = documents.get(key);
    if (!document) {
      const grouped = new Map<string, bigint>();
      for (const line of original.lines) {
        if (control.has(line.accountId)) continue;
        if (needsCashPolicy(line.accountId))
          throw new Error(
            "Inventory, prepayment, deferred or payroll/accrual accounts need a reviewed cash-recognition policy; they cannot be silently omitted from cash P&L.",
          );
        grouped.set(
          line.accountId,
          (grouped.get(line.accountId) ?? 0n) + (line.debit - line.credit) * orientation,
        );
      }
      if ([...grouped.values()].some((value) => value < 0n))
        throw new Error(
          "This document contains mixed-sign or inventory/noncash components requiring cash-basis reconciliation",
        );
      document = {
        journal: original,
        side,
        sign: creditNote ? -1n : 1n,
        source: {
          id: documentId,
          companyId: input.companyId,
          status: "posted",
          currencyCode: original.currency,
          baseCurrencyCode: input.baseCurrency,
          totalMinor: gross,
          nonCashCreditMinor: 0n,
          components: [...grouped]
            .filter(([, value]) => value !== 0n)
            .map(([accountId, amountMinor]) => ({ accountId, amountMinor, kind: "net" as const })),
          settlements: [],
        },
      };
      for (const allocation of input.creditAllocations ?? []) {
        if (
          allocation.documentId !== documentId ||
          (allocation.allocatedOn && allocation.allocatedOn > period.to) ||
          (allocation.reversedOn && allocation.reversedOn <= period.to)
        )
          continue;
        const credit = sources.get(allocation.creditId);
        if (
          !credit ||
          credit.sourceType !==
            (side === "income" ? "sales_credit_note" : "purchase_credit_note") ||
          credit.currency !== original.currency
        )
          throw new Error("A linked noncash credit has no matching posted currency/source detail");
        const creditWeights = new Map<string, bigint>();
        for (const line of credit.lines)
          if (!control.has(line.accountId))
            creditWeights.set(
              line.accountId,
              (creditWeights.get(line.accountId) ?? 0n) - (line.debit - line.credit) * orientation,
            );
        const creditTotal = [...creditWeights.values()].reduce((sum, amount) => sum + amount, 0n);
        const ids = new Set([...grouped.keys(), ...creditWeights.keys()]);
        if (
          creditTotal <= 0n ||
          [...ids].some(
            (id) => (creditWeights.get(id) ?? 0n) * gross !== (grouped.get(id) ?? 0n) * creditTotal,
          )
        )
          throw new Error(
            "A non-proportional credit changes the account/tax distribution. Cash recognition requires reviewed credit allocation detail rather than estimating account totals.",
          );
      }
      documents.set(key, document);
    }
    document.source.settlements.push({
      id: eventId,
      companyId: input.companyId,
      documentId,
      settledOn: settlement.date,
      cashDeltaMinor: reversal ? -amount : amount,
      fxRateToBase: payment.currency === input.baseCurrency ? "1" : (payment.rate ?? ""),
      sequence: reversal ? 1 : 0,
      status: "posted",
    });
    events.set(eventId, settlement);
  }
  const paymentIds = new Set<string>();
  for (const payment of [...input.payments, ...input.refunds]) {
    if (payment.companyId !== input.companyId || paymentIds.has(payment.id))
      throw new Error("Duplicate or cross-company cash payment");
    paymentIds.add(payment.id);
    const journal = journals.get(payment.journalId);
    if (!journal)
      throw new Error(
        "A posted cash settlement journal is unavailable. Refresh the report or reconcile source permissions and history.",
      );
    if (journal.date > period.to) continue;
    const voided = payment.voidJournalId ? journals.get(payment.voidJournalId) : undefined;
    handled.add(journal.id);
    if (voided) {
      if (voided.reverses !== journal.id || voided.date < journal.date)
        throw new Error("Cash reversal does not match the original posted journal");
      handled.add(voided.id);
      const reversalBalances = new Map<string, bigint>();
      for (const source of [journal, voided])
        for (const line of source.lines)
          reversalBalances.set(
            line.accountId,
            (reversalBalances.get(line.accountId) ?? 0n) +
              base(line.debit - line.credit, source.currency, source.rate),
          );
      if ([...reversalBalances.values()].some((value) => value !== 0n))
        throw new Error(
          "The cash void is not an exact posted reversal of the original transaction",
        );
      // Exact pairs wholly before the period, or wholly inside it, cancel per
      // account without guessing deleted supplier/refund allocation history.
      if (voided.date < period.from || (journal.date >= period.from && voided.date <= period.to))
        continue;
    }
    const refund = input.refunds.find((row) => row.id === payment.id);
    const direction = (payment.side === "income" ? 1n : -1n) * (refund ? -1n : 1n);
    const expectedBank = base(payment.amount, payment.currency, payment.rate) * direction;
    if (bankNet(journal) !== expectedBank)
      throw new Error("Cash payment does not reconcile to its posted bank movement");
    if (voided && bankNet(voided) !== -expectedBank)
      throw new Error("Cash reversal does not reconcile to its bank movement");
    const allocations = refund
      ? refund.uses.map((use) => {
          const expectedKind =
            payment.side === "income" ? "sales_credit_note" : "purchase_credit_note";
          if (use.kind !== expectedKind)
            throw new Error(
              "Refunds of unapplied advances need a verified advance-payment cash policy",
            );
          return { ...use, reversedOn: null };
        })
      : input.allocations.filter((allocation) => allocation.paymentId === payment.id);
    if (allocations.reduce((sum, allocation) => sum + allocation.amount, 0n) !== payment.amount)
      throw new Error(
        "Cash payment allocations are incomplete or historical allocations were removed. Allocate unapplied cash or restore verified allocation history before running cash P&L",
      );
    const baseShares = apportionCashAmount(
      expectedBank < 0n ? -expectedBank : expectedBank,
      allocations.map((allocation) => allocation.amount),
      payment.amount,
    );
    for (const [allocationIndex, allocation] of allocations.entries()) {
      cashTargets.set(allocation.id + ":paid", baseShares[allocationIndex]!);
      cashTargets.set(allocation.id + ":void", -baseShares[allocationIndex]!);
      if ("companyId" in allocation && allocation.companyId !== input.companyId)
        throw new Error("Cross-company cash allocation");
      if (allocation.amount <= 0n) throw new Error("Cash allocation must be positive");
      if (
        allocation.reversedOn &&
        allocation.reversedOn <= period.to &&
        (!voided || allocation.reversedOn !== voided.date)
      )
        throw new Error("Reallocated receipts require reviewed cash-recognition history");
      attach(
        allocation.documentId,
        payment.side,
        Boolean(refund),
        payment,
        allocation.amount,
        journal,
        allocation.id + ":paid",
        false,
      );
      if (voided)
        attach(
          allocation.documentId,
          payment.side,
          Boolean(refund),
          payment,
          allocation.amount,
          voided,
          allocation.id + ":void",
          true,
        );
    }
  }
  const result: CashPnlEntry[] = [];
  for (const document of documents.values()) {
    for (const recognition of recogniseCashSettlements(document.source, period)) {
      const settlement = events.get(recognition.settlementId)!;
      // Allocate the actual posted base-currency cash once, across documents and
      // then net/tax components. This prevents independent FX rounding from
      // inventing pennies or creating negative revenue on a positive receipt.
      const target = cashTargets.get(recognition.settlementId)!;
      const abs = (amount: bigint) => (amount < 0n ? -amount : amount);
      const shares = apportionCashAmount(
        abs(target),
        recognition.components.map((component) => abs(component.recognisedMinor)),
        abs(recognition.cashDeltaMinor),
      );
      const components = recognition.components.map((component, index) => ({
        ...component,
        recognisedBaseMinor: shares[index]! * (target < 0n ? -1n : 1n),
      }));
      for (const component of components) {
        const account = accounts.get(component.accountId)!;
        if (
          !["income", "expense"].includes(account.account_type) ||
          component.recognisedBaseMinor === 0n
        )
          continue;
        // Source orientation, rather than the account's normal side, preserves contra accounts.
        const normal = (document.side === "income" ? -1n : 1n) * document.sign;
        const signed = component.recognisedBaseMinor * normal;
        result.push({
          accountId: component.accountId,
          date: recognition.settledOn,
          journalId: settlement.id,
          journalNumber: settlement.number,
          sourceJournalId: document.journal.id,
          sourceType: document.journal.sourceType,
          sourceId: document.journal.sourceId,
          debit: signed > 0n ? signed : 0n,
          credit: signed < 0n ? -signed : 0n,
          reason: "settlement",
        });
      }
    }
  }
  for (const journal of input.journals) {
    if (
      !inPeriod(journal.date) ||
      handled.has(journal.id) ||
      ["opening_balance", "fx_revaluation", "depreciation"].includes(journal.sourceType) ||
      !journal.lines.some(
        (line) => cash.has(line.accountId) && (line.debit > 0n || line.credit > 0n),
      )
    )
      continue;
    if (journal.lines.some((line) => needsCashPolicy(line.accountId)))
      throw new Error(
        "A cash movement settles inventory, prepayment, deferred or payroll/accrual balances requiring a reviewed cash-recognition policy.",
      );
    if (journal.lines.some((line) => ar.has(line.accountId) || ap.has(line.accountId)))
      throw new Error(
        "A posted bank movement uses receivables/payables without complete cash allocation detail",
      );
    for (const line of journal.lines) {
      if (!["income", "expense"].includes(accounts.get(line.accountId)!.account_type)) continue;
      result.push({
        accountId: line.accountId,
        date: journal.date,
        journalId: journal.id,
        journalNumber: journal.number,
        sourceJournalId: journal.id,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId,
        debit: base(line.debit, journal.currency, journal.rate),
        credit: base(line.credit, journal.currency, journal.rate),
        reason: "direct_cash",
      });
    }
  }
  return result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.journalId.localeCompare(b.journalId) ||
      a.accountId.localeCompare(b.accountId),
  );
}
