import { convertMinorToBase } from "@/lib/accounting/fx";
import type { AccountMeta } from "@/lib/accounting/ledger-data";
import { findControlAccountIds } from "@/lib/accounting/control-accounts";
import {
  recogniseCashSettlements,
  apportionCashAmount,
  apportionCumulativeCash,
  type CashSourceDocument,
} from "./cash-settlement";
import type { CashInventoryEvidence } from "./cash-inventory";
import { isReportDate } from "./date-validation";
import {
  cashClassificationContext,
  type CashClassificationPolicy,
  type CashOpeningEvidence,
} from "./cash-classification";

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
  memo?: string | null;
  lines: Array<{
    accountId: string;
    debit: bigint;
    credit: bigint;
    description?: string | null;
    lineId?: string;
  }>;
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
  /** Effective application date. Before this date cash stays an unapplied advance. */
  allocatedOn?: string | null;
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
  classificationPolicies?: CashClassificationPolicy[];
  openingEvidence?: CashOpeningEvidence[];
  inventoryEvidence?: CashInventoryEvidence[];
  /** Authoritative document foreign keys supplement legacy journals without a source_id. */
  documentJournalLinks?: Array<{
    documentId: string;
    companyId: string;
    journalId: string;
    sourceType: string;
    date?: string | null;
  }>;
  creditAllocations?: Array<{
    id?: string;
    documentId: string;
    creditId: string;
    allocatedOn: string | null;
    reversedOn: string | null;
    amount?: bigint;
  }>;
};
export type CashPnlEntry = {
  accountId: string;
  /** Original posted component, retained when approved cash classification changes the account. */
  sourceAccountId?: string;
  date: string;
  journalId: string;
  journalNumber: string;
  sourceJournalId: string;
  sourceType: string;
  sourceId: string | null;
  debit: bigint;
  credit: bigint;
  reason: "settlement" | "direct_cash";
  /** Signed base-currency cumulative component positions for exact source-line attribution. */
  sourceComponentBefore?: string;
  sourceComponentAfter?: string;
  sourceLineId?: string;
  sourceDescription?: string | null;
  /** Signed transaction-currency component amount, before posted settlement FX. */
  sourceTransactionAmount?: string;
};

/** Assign the exact posted base pennies to reusable slices of a payment.
 * Applying/unapplying an advance only moves classification; no new cash is created.
 * The number of slices is bounded by allocation events, never by the monetary amount.
 */
function allocationBaseShares(
  total: bigint,
  baseTotal: bigint,
  allocations: Array<{ id: string; amount: bigint; start: string; end: string | null }>,
  to: string,
): Map<string, bigint> {
  if (total <= 0n || baseTotal < 0n) throw new Error("Invalid cash payment amount");
  type Slice = { from: bigint; to: bigint };
  let free: Slice[] = [{ from: 0n, to: total }];
  const held = new Map<string, Slice[]>();
  const shares = new Map<string, bigint>();
  const seen = new Set<string>();
  const events = allocations
    .flatMap((allocation) => {
      if (seen.has(allocation.id) || allocation.amount <= 0n)
        throw new Error("Duplicate or invalid cash allocation identity");
      seen.add(allocation.id);
      if (allocation.end && allocation.end < allocation.start)
        throw new Error("Cash allocation reversal precedes its application");
      if (allocation.end === allocation.start) {
        shares.set(allocation.id, 0n);
        return [];
      }
      return [
        { allocation, date: allocation.start, reverse: false },
        ...(allocation.end ? [{ allocation, date: allocation.end, reverse: true }] : []),
      ];
    })
    .filter((event) => event.date <= to)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        Number(b.reverse) - Number(a.reverse) ||
        a.allocation.id.localeCompare(b.allocation.id),
    );
  for (const event of events) {
    const { allocation } = event;
    if (event.reverse) {
      const slices = held.get(allocation.id);
      if (!slices) throw new Error("Cash allocation reversal has no original application");
      free.push(...slices);
      free.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
      const merged: Slice[] = [];
      for (const slice of free) {
        const previous = merged.at(-1);
        if (previous?.to === slice.from) previous.to = slice.to;
        else merged.push({ ...slice });
      }
      free = merged;
      held.delete(allocation.id);
      continue;
    }
    let remaining = allocation.amount;
    const slices: Slice[] = [];
    while (remaining > 0n && free.length) {
      const first = free[0]!;
      const available = first.to - first.from;
      const used = remaining < available ? remaining : available;
      slices.push({ from: first.from, to: first.from + used });
      first.from += used;
      remaining -= used;
      if (first.from === first.to) free.shift();
    }
    if (remaining > 0n)
      throw new Error("Cash payment allocations exceed its amount at the application date");
    held.set(allocation.id, slices);
    shares.set(
      allocation.id,
      slices.reduce(
        (sum, slice) => sum + (baseTotal * slice.to) / total - (baseTotal * slice.from) / total,
        0n,
      ),
    );
  }
  return shares;
}

/** Management cash recognition, never a mutation of the posted accrual ledger. */
export function cashProfitLoss(
  input: CashPnlInput,
  period: { from: string; to: string },
  ledger = false,
): CashPnlEntry[] {
  if (!isReportDate(period.from) || !isReportDate(period.to) || period.from > period.to)
    throw new Error("Choose a valid cash reporting period");
  const accounts = new Map(input.accounts.map((account) => [account.id, account]));
  const cash = new Set(input.cashAccountIds);
  const classification = cashClassificationContext(input, period);
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
  for (const link of input.documentJournalLinks ?? []) {
    if (link.companyId !== input.companyId) throw new Error("Cross-company cash source document");
    const journal = journals.get(link.journalId);
    if (!journal || journal.sourceType === "opening_balance") continue;
    if (
      journal.sourceType !== link.sourceType ||
      (journal.sourceId && journal.sourceId !== link.documentId) ||
      (sources.has(link.documentId) && sources.get(link.documentId)!.id !== journal.id)
    )
      throw new Error("Cash source document does not match its posted journal");
    sources.set(link.documentId, { ...journal, sourceId: link.documentId });
  }
  for (const documentId of classification.opening.keys()) {
    const source = classification.openingSource(documentId);
    if (source) {
      if (sources.has(documentId))
        throw new Error("Opening source evidence conflicts with a posted source document");
      sources.set(documentId, source);
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
    {
      source: CashSourceDocument;
      sign: bigint;
      side: "income" | "expense";
      journal: CashJournal;
      credits: Array<{
        id: string;
        date: string;
        reversedOn: string | null;
        journal: CashJournal;
        components: Map<string, bigint>;
      }>;
    }
  >();
  const events = new Map<string, CashJournal>();
  const cashTargets = new Map<string, bigint>();
  const advanceEntries: CashPnlEntry[] = [];
  function controlMovement(payment: CashPayment, journal: CashJournal, signed: bigint) {
    if (!ledger || signed === 0n || !inPeriod(journal.date)) return;
    const control = payment.side === "income" ? ar : ap;
    const lines = journal.lines.filter((line) => control.has(line.accountId));
    const weights = lines.map((line) => {
      const value = line.debit - line.credit;
      return value < 0n ? -value : value;
    });
    const shares = apportionCashAmount(
      signed < 0n ? -signed : signed,
      weights,
      weights.reduce((sum, amount) => sum + amount, 0n),
    );
    for (const [index, line] of lines.entries()) {
      const value = shares[index]! * (signed < 0n ? -1n : 1n);
      if (value === 0n) continue;
      advanceEntries.push({
        accountId: line.accountId,
        date: journal.date,
        journalId: journal.id,
        journalNumber: journal.number,
        sourceJournalId: journal.id,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId,
        debit: value > 0n ? value : 0n,
        credit: value < 0n ? -value : 0n,
        reason: "settlement",
      });
    }
  }
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
      return classification.fail(
        "A cash allocation has no matching posted invoice, bill or credit note; imported opening balances need source detail",
        [
          "Matching posted source document or approved opening document gross, component and control/equity evidence",
        ],
        settlement,
        null,
        amount,
        documentId,
      );
    if (original.date > settlement.date)
      throw new Error("A cash allocation cannot precede its posted source document");
    if (original.currency !== payment.currency)
      throw new Error("Cash settlement and source document currencies do not match");
    const control = side === "income" ? ar : ap;
    const orientation = (side === "income" ? -1n : 1n) * (creditNote ? -1n : 1n);
    const gross = -original.lines.reduce(
      (sum, line) =>
        control.has(line.accountId) ? sum + (line.debit - line.credit) * orientation : sum,
      0n,
    );
    const key = documentId;
    let document = documents.get(key);
    if (!document) {
      const grouped = new Map<string, bigint>();
      for (const line of original.lines) {
        if (control.has(line.accountId)) continue;
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
        credits: [],
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
          (allocation.allocatedOn && allocation.allocatedOn > period.to)
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
        const proportional = ![...ids].some(
          (id) => (creditWeights.get(id) ?? 0n) * gross !== (grouped.get(id) ?? 0n) * creditTotal,
        );
        if (creditTotal <= 0n || [...creditWeights.values()].some((amount) => amount < 0n))
          throw new Error("Linked credit components do not reconcile to a positive source");
        if (allocation.amount === undefined) {
          if (proportional) continue; // Older frozen snapshots lack the exact applied amount.
          throw new Error("A non-proportional credit requires its exact historical applied amount");
        }
        if (allocation.amount <= 0n || allocation.amount > creditTotal)
          throw new Error("Linked credit allocation exceeds its posted source");
        const date = allocation.allocatedOn ?? credit.date;
        if (!isReportDate(date) || date < credit.date || date < original.date)
          throw new Error("Invalid linked credit allocation date");
        if (
          allocation.reversedOn &&
          (!isReportDate(allocation.reversedOn) || allocation.reversedOn < date)
        )
          throw new Error("Invalid linked credit reversal date");
        // Changes compensated on their application date have no day-level
        // recognition. They must not temporarily consume the source twice.
        if (allocation.reversedOn === date) continue;
        const pieces = apportionCashAmount(
          allocation.amount,
          [...creditWeights.values()],
          creditTotal,
        );
        document.credits.push({
          id: allocation.id ?? `${documentId}:${allocation.creditId}`,
          date,
          reversedOn: allocation.reversedOn,
          journal: credit,
          components: new Map([...creditWeights.keys()].map((id, index) => [id, pieces[index]!])),
        });
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
      sequence: reversal ? 0 : 1,
      status: "posted",
      ...(reversal ? { reversesSettlementId: eventId.replace(/:void$/, ":paid") } : {}),
    });
    events.set(eventId, settlement);
  }
  const paymentIds = new Set<string>();
  const allocationIds = new Set<string>();
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
    // Preserve unapplied cash on the existing trade control. Its later
    // application releases this balance; it is never automatically P&L.
    controlMovement(payment, journal, -expectedBank);
    if (voided) controlMovement(payment, voided, expectedBank);
    const allocations = refund
      ? refund.uses.map((use) => {
          const expectedKind =
            payment.side === "income" ? "sales_credit_note" : "purchase_credit_note";
          const advanceKind = payment.side === "income" ? "sales_receipt" : "supplier_payment";
          if (use.kind !== expectedKind && use.kind !== advanceKind)
            throw new Error("Cash refund source does not match its customer or supplier side");
          return { ...use, reversedOn: null, advance: use.kind === advanceKind };
        })
      : input.allocations.filter((allocation) => allocation.paymentId === payment.id);
    const datedAllocations = allocations.map((allocation) => {
      const allocatedOn = "allocatedOn" in allocation ? allocation.allocatedOn : null;
      if (allocatedOn && !isReportDate(allocatedOn))
        throw new Error("Invalid cash allocation effective date");
      if (allocation.reversedOn && !isReportDate(allocation.reversedOn))
        throw new Error("Invalid cash allocation reversal date");
      const source = sources.get(allocation.documentId);
      const sourceDate =
        source?.date ??
        input.documentJournalLinks?.find((link) => link.documentId === allocation.documentId)?.date;
      const start = [journal.date, allocatedOn ?? journal.date, sourceDate ?? journal.date]
        .sort()
        .at(-1)!;
      const end =
        [allocation.reversedOn, voided?.date]
          .filter((date): date is string => Boolean(date))
          .sort()[0] ?? null;
      return { id: allocation.id, amount: allocation.amount, start, end };
    });
    const allocated = allocations.reduce((sum, allocation) => sum + allocation.amount, 0n);
    if (!refund && payment.voidJournalId && allocations.length === 0)
      throw new Error("Historical cash payment allocations are incomplete for this void");
    if (refund && allocated !== payment.amount)
      throw new Error(
        "Cash payment allocations exceed its amount or refund source allocations are incomplete",
      );
    const baseShares = allocationBaseShares(
      payment.amount,
      expectedBank < 0n ? -expectedBank : expectedBank,
      datedAllocations,
      period.to,
    );
    for (const [allocationIndex, allocation] of allocations.entries()) {
      if (allocationIds.has(allocation.id)) throw new Error("Duplicate cash allocation identity");
      allocationIds.add(allocation.id);
      cashTargets.set(allocation.id + ":paid", baseShares.get(allocation.id) ?? 0n);
      cashTargets.set(allocation.id + ":void", -(baseShares.get(allocation.id) ?? 0n));
      if ("companyId" in allocation && allocation.companyId !== input.companyId)
        throw new Error("Cross-company cash allocation");
      if (allocation.amount <= 0n) throw new Error("Cash allocation must be positive");
      // Refunding a customer/supplier advance reverses the control balance,
      // without recognizing income or expense at either cash date.
      if ("advance" in allocation && allocation.advance) {
        const source = input.payments.find((candidate) => candidate.id === allocation.documentId);
        const originalJournal = source ? journals.get(source.journalId) : undefined;
        if (
          !source ||
          !originalJournal ||
          source.side !== payment.side ||
          source.companyId !== input.companyId ||
          source.currency !== payment.currency ||
          originalJournal.date > journal.date
        )
          throw new Error("Refunded advance has no matching customer or supplier payment");
        const applied = input.allocations
          .filter(
            (row) =>
              row.paymentId === source.id &&
              (!row.reversedOn || row.reversedOn > journal.date) &&
              (row.allocatedOn ?? originalJournal.date) <= journal.date &&
              (sources.get(row.documentId)?.date ?? originalJournal.date) <= journal.date,
          )
          .reduce((sum, row) => sum + row.amount, 0n);
        const refunded = input.refunds
          .filter((row) => {
            const date = journals.get(row.journalId)?.date;
            const voidDate = row.voidJournalId ? journals.get(row.voidJournalId)?.date : undefined;
            return date && date <= journal.date && (!voidDate || voidDate > journal.date);
          })
          .flatMap((row) => row.uses)
          .filter((use) => use.documentId === source.id && use.kind === allocation.kind)
          .reduce((sum, use) => sum + use.amount, 0n);
        if (applied + refunded > source.amount)
          throw new Error("Advance refunds exceed the unapplied source balance");
        continue;
      }
      const dated = datedAllocations[allocationIndex]!;
      const effectiveDate = dated.start;
      if (effectiveDate > period.to || dated.end === effectiveDate) continue;
      const effectiveJournal = { ...journal, date: effectiveDate };
      attach(
        allocation.documentId,
        payment.side,
        Boolean(refund),
        payment,
        allocation.amount,
        effectiveJournal,
        allocation.id + ":paid",
        false,
      );
      const release = (baseShares.get(allocation.id) ?? 0n) * direction;
      controlMovement(payment, effectiveJournal, release);
      const reversed = dated.end ? { ...journal, date: dated.end } : null;
      if (reversed)
        attach(
          allocation.documentId,
          payment.side,
          Boolean(refund),
          payment,
          allocation.amount,
          reversed,
          allocation.id + ":void",
          true,
        );
      if (reversed) controlMovement(payment, reversed, -release);
    }
  }
  const result: CashPnlEntry[] = advanceEntries;
  for (const document of documents.values()) {
    if (document.credits.length) {
      const ids = [
        ...new Set([
          ...document.source.components.map((component) => component.accountId),
          ...document.credits.flatMap((credit) => [...credit.components.keys()]),
        ]),
      ];
      const weights = ids.map(
        (id) =>
          document.source.components.find((component) => component.accountId === id)?.amountMinor ??
          0n,
      );
      const timeline = [
        ...document.source.settlements.map((settlement) => ({
          id: settlement.id,
          date: settlement.settledOn,
          journal: events.get(settlement.id)!,
          cash: settlement.cashDeltaMinor,
          base: cashTargets.get(settlement.id)!,
          components: null as Map<string, bigint> | null,
          sign: 0n,
        })),
        ...document.credits.flatMap((credit) => [
          {
            id: `${credit.id}:credit`,
            date: credit.date,
            journal: credit.journal,
            cash: 0n,
            base: 0n,
            components: credit.components,
            sign: -1n,
          },
          ...(credit.reversedOn
            ? [
                {
                  id: `${credit.id}:credit-void`,
                  date: credit.reversedOn,
                  journal: credit.journal,
                  cash: 0n,
                  base: 0n,
                  components: credit.components,
                  sign: 1n,
                },
              ]
            : []),
        ]),
      ].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          // Release the original cash/credit capacity before same-day
          // replacements consume it. Zero-duration applications are omitted.
          (a.cash < 0n ? 0 : a.sign > 0n ? 1 : a.components ? 2 : 3) -
            (b.cash < 0n ? 0 : b.sign > 0n ? 1 : b.components ? 2 : 3) ||
          a.id.localeCompare(b.id),
      );
      let cumulative = 0n,
        baseCumulative = 0n;
      let recognised = ids.map(() => 0n);
      let recognisedTransaction = ids.map(() => 0n);
      const seen = new Set<string>();
      for (const event of timeline) {
        if (event.date > period.to) continue;
        if (seen.has(event.id)) throw new Error("Duplicate cash or credit allocation identity");
        seen.add(event.id);
        if (event.components)
          for (const [index, id] of ids.entries())
            weights[index] = weights[index]! + (event.components.get(id) ?? 0n) * event.sign;
        cumulative += event.cash;
        baseCumulative += event.base;
        const remaining = weights.reduce((sum, amount) => sum + amount, 0n);
        if (
          weights.some((amount) => amount < 0n) ||
          cumulative < 0n ||
          cumulative > remaining ||
          baseCumulative < 0n
        )
          throw new Error("Cash and linked credits exceed the remaining posted source components");
        const after =
          remaining === 0n
            ? ids.map(() => 0n)
            : apportionCumulativeCash(baseCumulative, weights, remaining);
        const afterTransaction =
          remaining === 0n
            ? ids.map(() => 0n)
            : apportionCumulativeCash(cumulative, weights, remaining);
        for (const [index, sourceAccountId] of ids.entries()) {
          const amount = after[index]! - recognised[index]!;
          if (!amount || !inPeriod(event.date)) continue;
          const signed = amount * (document.side === "income" ? -1n : 1n) * document.sign;
          const opening = classification.opening.get(document.source.id);
          const accountId =
            opening?.mode === "already_recognized"
              ? opening.controlAccountId
              : classification.classify(
                  sourceAccountId,
                  document.journal,
                  event.date,
                  signed,
                  document.source.id,
                );
          if (!ledger && !["income", "expense"].includes(accounts.get(accountId)!.account_type))
            continue;
          result.push({
            accountId,
            sourceAccountId,
            date: event.date,
            journalId: event.journal.id,
            journalNumber: event.journal.number,
            sourceJournalId: document.journal.id,
            sourceType: document.journal.sourceType,
            sourceId: document.journal.sourceId,
            debit: signed > 0n ? signed : 0n,
            credit: signed < 0n ? -signed : 0n,
            reason: "settlement",
            sourceTransactionAmount: (
              (afterTransaction[index]! - recognisedTransaction[index]!) *
              (document.side === "income" ? -1n : 1n) *
              document.sign
            ).toString(),
            sourceComponentBefore: (
              recognised[index]! *
              (document.side === "income" ? -1n : 1n) *
              document.sign
            ).toString(),
            sourceComponentAfter: (
              after[index]! *
              (document.side === "income" ? -1n : 1n) *
              document.sign
            ).toString(),
          });
        }
        recognised = after;
        recognisedTransaction = afterTransaction;
      }
      continue;
    }
    const componentPositions = new Map<string, bigint>();
    for (const recognition of recogniseCashSettlements(document.source, {
      from: "0001-01-01",
      to: period.to,
    })) {
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
        const normal = (document.side === "income" ? -1n : 1n) * document.sign;
        const signed = component.recognisedBaseMinor * normal;
        const before = componentPositions.get(component.accountId) ?? 0n;
        const after = before + signed;
        componentPositions.set(component.accountId, after);
        if (component.recognisedBaseMinor === 0n || !inPeriod(recognition.settledOn)) continue;
        const opening = classification.opening.get(document.source.id);
        const accountId =
          opening?.mode === "already_recognized"
            ? opening.controlAccountId
            : classification.classify(
                component.accountId,
                document.journal,
                recognition.settledOn,
                signed,
                document.source.id,
              );
        if (!ledger && !["income", "expense"].includes(accounts.get(accountId)!.account_type))
          continue;
        // Source orientation, rather than the account's normal side, preserves contra accounts.
        result.push({
          accountId,
          sourceAccountId: component.accountId,
          date: recognition.settledOn,
          journalId: settlement.id,
          journalNumber: settlement.number,
          sourceJournalId: document.journal.id,
          sourceType: document.journal.sourceType,
          sourceId: document.journal.sourceId,
          debit: signed > 0n ? signed : 0n,
          credit: signed < 0n ? -signed : 0n,
          reason: "settlement",
          sourceTransactionAmount: (component.recognisedMinor * normal).toString(),
          sourceComponentBefore: before.toString(),
          sourceComponentAfter: after.toString(),
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
    if (journal.lines.some((line) => ar.has(line.accountId) || ap.has(line.accountId)))
      throw new Error(
        "A posted bank movement uses receivables/payables without complete cash allocation detail",
      );
    for (const line of journal.lines) {
      const accountId = classification.classify(
        line.accountId,
        journal,
        journal.date,
        line.debit - line.credit,
      );
      if (!ledger && !["income", "expense"].includes(accounts.get(accountId)!.account_type))
        continue;
      result.push({
        accountId,
        sourceAccountId: line.accountId,
        date: journal.date,
        journalId: journal.id,
        journalNumber: journal.number,
        sourceJournalId: journal.id,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId,
        debit: base(line.debit, journal.currency, journal.rate),
        credit: base(line.credit, journal.currency, journal.rate),
        reason: "direct_cash",
        ...(line.lineId ? { sourceLineId: line.lineId } : {}),
        sourceDescription: line.description ?? null,
        sourceTransactionAmount: (line.debit - line.credit).toString(),
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
