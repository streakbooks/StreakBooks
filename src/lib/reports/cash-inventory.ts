import { lineToBaseMinor } from "@/lib/accounting/fx";
import type { CashJournal, CashPnlEntry, CashPnlInput } from "./cash-profit-loss";
import {
  CashClassificationError,
  cashEvidenceMatches,
  type CashJournalEvidenceSnapshot,
  type CashClassificationException,
} from "./cash-classification";
import { isReportDate } from "./date-validation";

/** Approved cost evidence is a trace to the accrual source, never another stock ledger. */
export type CashInventoryEvidence = {
  id: string;
  companyId: string;
  purchaseDocumentId: string;
  purchaseJournalId: string;
  inventoryAccountId: string;
  movementJournalId: string;
  movementKind: "sale" | "customer_return" | "supplier_return";
  costMinor: bigint;
  reversesEvidenceId: string | null;
  evidenceReference: string;
  policyNote: string;
  status: string;
  version: number;
  approvedBy: string | null;
  approvedAt: string | null;
  supersedesId?: string | null;
  purchaseJournalSnapshot?: CashJournalEvidenceSnapshot;
  movementJournalSnapshot?: CashJournalEvidenceSnapshot;
};
export type CashInventoryPosition = {
  purchaseDocumentId: string;
  purchaseJournalId: string;
  inventoryAccountId: string;
  purchaseCostMinor: string;
  eligibleCostMinor: string;
  soldCostMinor: string;
  paidCostMinor: string;
  cashPaidCostSoldMinor: string;
  paidCostUnconsumedMinor: string;
  returnedPaidCostMinor: string;
  supplierRefundMinor: string;
  refundFxVarianceMinor: string;
};
export type CashInventoryTrace = {
  basis: "cash";
  currency: string;
  from: string;
  to: string;
  sources: CashInventoryPosition[];
  movements: Array<CashInventoryPosition & { date: string; deltaPaidCostSoldMinor: string }>;
};
type InventoryInput = Pick<
  CashPnlInput,
  "companyId" | "baseCurrency" | "journals" | "documentJournalLinks" | "creditAllocations"
> & {
  inventoryEvidence?: CashInventoryEvidence[];
};
type Slice = { from: bigint; to: bigint };
type Source = {
  documentId: string;
  journal: CashJournal;
  accountId: string;
  cost: bigint;
  free: Slice[];
  sales: Map<string, Slice[]>;
  returned: Map<string, Slice[]>;
  paid: bigint;
  refunded: bigint;
  credited: Map<string, Slice[]>;
  lastSoldPaid: bigint;
};
const size = (slices: Slice[]) => slices.reduce((sum, slice) => sum + slice.to - slice.from, 0n);
function release(source: Source, slices: Slice[]) {
  source.free.push(...slices);
  source.free.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const merged: Slice[] = [];
  for (const slice of source.free) {
    const previous = merged.at(-1);
    if (previous?.to === slice.from) previous.to = slice.to;
    else merged.push({ ...slice });
  }
  source.free = merged;
}
function take(slices: Slice[], amount: bigint): Slice[] {
  const result: Slice[] = [];
  let remaining = amount;
  while (remaining > 0n && slices.length) {
    const first = slices[0]!;
    const used = first.to - first.from < remaining ? first.to - first.from : remaining;
    result.push({ from: first.from, to: first.from + used });
    first.from += used;
    remaining -= used;
    if (first.from === first.to) slices.shift();
  }
  if (remaining)
    throw new Error("Inventory cost evidence exceeds its verified available source cost");
  return result;
}
function paidShare(source: Source, slices: Slice[]): bigint {
  const excluded = [...source.credited.values()].flat();
  const measure = (end: bigint) =>
    end -
    excluded.reduce(
      (sum, slice) =>
        sum + (end > slice.from ? (end < slice.to ? end : slice.to) - slice.from : 0n),
      0n,
    );
  const total = source.cost - size(excluded);
  if (total <= 0n) {
    if (source.paid !== 0n)
      throw new Error("Inventory credit requires verified cash refund/reallocation detail");
    return 0n;
  }
  return slices.reduce(
    (sum, slice) =>
      sum + (source.paid * measure(slice.to)) / total - (source.paid * measure(slice.from)) / total,
    0n,
  );
}
function position(source: Source): CashInventoryPosition {
  const sold = [...source.sales.values()].flat();
  const returned = [...source.returned.values()].flat();
  const returnedPaid = paidShare(source, returned);
  const pendingRefund = returnedPaid > source.refunded ? returnedPaid - source.refunded : 0n;
  // The FX residual belongs to the refund, never to a different sale's cost.
  const variance = source.refunded > returnedPaid ? returnedPaid - source.refunded : 0n;
  return {
    purchaseDocumentId: source.documentId,
    purchaseJournalId: source.journal.id,
    inventoryAccountId: source.accountId,
    purchaseCostMinor: source.cost.toString(),
    eligibleCostMinor: (source.cost - size(returned)).toString(),
    soldCostMinor: size(sold).toString(),
    paidCostMinor: (source.paid - source.refunded).toString(),
    cashPaidCostSoldMinor: paidShare(source, sold).toString(),
    paidCostUnconsumedMinor: paidShare(source, source.free).toString(),
    returnedPaidCostMinor: pendingRefund.toString(),
    supplierRefundMinor: source.refunded.toString(),
    refundFxVarianceMinor: variance.toString(),
  };
}

/**
 * Trace already-recognised inventory purchase cash to verified sold/returned cost.
 * All-history cash entries are required, including opening periods. This function
 * never creates expense entries: purchase payment is the sole cash P&L expense.
 * Fixed source-cost slices preserve the exact pennies reversed by a stock return.
 */
export function traceCashInventory(
  input: InventoryInput,
  cashEntries: CashPnlEntry[],
  period: { from: string; to: string },
  inventoryAccountIds: string[],
): CashInventoryTrace {
  if (!isReportDate(period.from) || !isReportDate(period.to) || period.from > period.to)
    throw new Error("Choose a valid cash inventory tracing period");
  const inventory = new Set(inventoryAccountIds);
  const journals = new Map(input.journals.map((journal) => [journal.id, journal]));
  const evidence = (input.inventoryEvidence ?? []).filter(
    (row) =>
      row.status === "approved" &&
      !(input.inventoryEvidence ?? []).some(
        (newer) => newer.status === "approved" && newer.supersedesId === row.id,
      ),
  );
  const sources = new Map<string, Source>();
  const key = (journalId: string, accountId: string) => `${journalId}:${accountId}`;
  function fail(
    message: string,
    journal: CashJournal | undefined,
    accountId: string | null,
    amount: bigint,
    missingEvidence: string[],
    documentId: string | null = null,
  ): never {
    const exception: CashClassificationException = {
      code: "cash_inventory_evidence_required",
      message,
      companyId: input.companyId,
      sourceAccountId: accountId,
      journalId: journal?.id ?? null,
      documentId,
      amountMinor: amount.toString(),
      currency: input.baseCurrency,
      date: journal?.date ?? period.to,
      period,
      missingEvidence,
    };
    throw new CashClassificationError([exception]);
  }
  const net = (journal: CashJournal, accountId: string) =>
    journal.lines.reduce(
      (sum, line) =>
        sum +
        (line.accountId === accountId
          ? lineToBaseMinor(line.debit, journal.rate, journal.currency, input.baseCurrency) -
            lineToBaseMinor(line.credit, journal.rate, journal.currency, input.baseCurrency)
          : 0n),
      0n,
    );
  for (const journal of input.journals) {
    if (journal.companyId !== input.companyId || journals.get(journal.id) !== journal)
      fail(
        "Inventory source facts contain a duplicate or cross-company journal.",
        journal,
        null,
        0n,
        ["Unique tenant-scoped posted source journals"],
      );
    if (journal.date > period.to || journal.sourceType !== "purchase_bill") continue;
    const linkedId = input.documentJournalLinks?.find(
      (link) =>
        link.companyId === input.companyId &&
        link.journalId === journal.id &&
        link.sourceType === "purchase_bill",
    )?.documentId;
    const documentId = linkedId ?? journal.sourceId;
    for (const accountId of inventory) {
      const cost = net(journal, accountId);
      if (cost <= 0n) continue;
      if (!documentId)
        fail(
          "Inventory purchases need an authoritative posted bill link.",
          journal,
          accountId,
          cost,
          ["Posted purchase bill and its original inventory cost component"],
        );
      sources.set(key(journal.id, accountId), {
        documentId,
        journal,
        accountId,
        cost,
        free: [{ from: 0n, to: cost }],
        sales: new Map(),
        returned: new Map(),
        credited: new Map(),
        paid: 0n,
        refunded: 0n,
        lastSoldPaid: 0n,
      });
    }
  }
  const ids = new Set<string>();
  const movementCoverage = new Map<string, bigint>();
  const valid: Array<{ row: CashInventoryEvidence; source: Source; journal: CashJournal }> = [];
  for (const row of evidence) {
    const source = sources.get(key(row.purchaseJournalId, row.inventoryAccountId));
    const journal = journals.get(row.movementJournalId);
    if (journal && journal.date > period.to) continue;
    if (
      row.companyId !== input.companyId ||
      ids.has(row.id) ||
      !source ||
      source.documentId !== row.purchaseDocumentId ||
      !journal ||
      journal.companyId !== input.companyId ||
      journal.date < source.journal.date ||
      row.costMinor <= 0n ||
      row.version < 1 ||
      !row.approvedBy ||
      !row.approvedAt ||
      !row.evidenceReference.trim() ||
      !row.policyNote.trim()
    )
      fail(
        "Inventory cost tracing needs approved, matching purchase and movement evidence.",
        journal,
        row.inventoryAccountId,
        row.costMinor,
        ["Approved exact base-cost allocation, source bill, posted movement and approval audit"],
        row.purchaseDocumentId,
      );
    if (
      !cashEvidenceMatches(source.journal, row.purchaseJournalSnapshot) ||
      !cashEvidenceMatches(journal, row.movementJournalSnapshot)
    )
      fail(
        "Approved inventory evidence no longer matches its posted source.",
        journal,
        row.inventoryAccountId,
        row.costMinor,
        ["Matching immutable purchase and movement snapshots"],
        row.purchaseDocumentId,
      );
    ids.add(row.id);
    const expectedSign = row.movementKind === "customer_return" ? 1n : -1n;
    if (
      net(journal, row.inventoryAccountId) * expectedSign <= 0n ||
      (row.movementKind === "supplier_return" && journal.sourceType !== "purchase_credit_note") ||
      (row.movementKind !== "customer_return" && row.reversesEvidenceId !== null)
    )
      fail(
        "The inventory movement does not support its approved sale or return classification.",
        journal,
        row.inventoryAccountId,
        row.costMinor,
        ["Matching posted inventory debit/credit and the original sale for a customer return"],
        row.purchaseDocumentId,
      );
    const movementKey = key(journal.id, row.inventoryAccountId);
    movementCoverage.set(movementKey, (movementCoverage.get(movementKey) ?? 0n) + row.costMinor);
    valid.push({ row, source, journal });
  }
  // A stock decrease is never treated as paid COGS just because it is posted.
  for (const journal of input.journals) {
    if (journal.date > period.to || journal.sourceType === "opening_balance") continue;
    for (const accountId of inventory) {
      const amount = net(journal, accountId);
      if (!amount || (journal.sourceType === "purchase_bill" && amount > 0n)) continue;
      const covered = movementCoverage.get(key(journal.id, accountId)) ?? 0n;
      if (covered !== (amount < 0n ? -amount : amount))
        fail(
          "Inventory movement cost is not fully linked to verified purchase and sale/return evidence.",
          journal,
          accountId,
          amount,
          [
            "Exact approved cost allocations covering this inventory movement; adjustments and opening stock do not establish cash payment",
          ],
        );
    }
  }
  type Event = {
    date: string;
    evidence?: (typeof valid)[number];
    entry?: CashPnlEntry;
    credit?: { id: string; source: Source; amount: bigint; reverse: boolean };
    source?: Source | undefined;
  };
  const events: Event[] = valid.map((item) => ({ date: item.journal.date, evidence: item }));
  const creditSources = new Map<string, Array<{ source: Source; weight: bigint }>>();
  for (const item of valid.filter((item) => item.row.movementKind === "supplier_return")) {
    const creditKey = key(item.journal.id, item.row.inventoryAccountId);
    const list = creditSources.get(creditKey) ?? [];
    const previous = list.find((allocation) => allocation.source === item.source);
    if (previous) previous.weight += item.row.costMinor;
    else list.push({ source: item.source, weight: item.row.costMinor });
    creditSources.set(creditKey, list);
  }
  for (const entry of cashEntries) {
    const accountId = entry.sourceAccountId ?? entry.accountId;
    if (!inventory.has(accountId) || entry.date > period.to) continue;
    const source = sources.get(key(entry.sourceJournalId, accountId));
    if (!source && !creditSources.has(key(entry.sourceJournalId, accountId)))
      fail(
        "Paid inventory has no verified original purchase-cost source.",
        journals.get(entry.sourceJournalId),
        accountId,
        entry.debit - entry.credit,
        ["Posted inventory purchase bill or verified supplier-return cost linkage"],
        entry.sourceId,
      );
    events.push({ date: entry.date, entry, source });
  }
  for (const allocation of input.creditAllocations ?? []) {
    if (!allocation.amount) continue;
    const credit = input.journals.find(
      (journal) =>
        journal.sourceType === "purchase_credit_note" &&
        (journal.sourceId === allocation.creditId ||
          input.documentJournalLinks?.some(
            (link) => link.journalId === journal.id && link.documentId === allocation.creditId,
          )),
    );
    if (!credit) continue;
    const returns = valid.filter(
      (item) => item.row.movementKind === "supplier_return" && item.journal.id === credit.id,
    );
    if (!returns.length) continue;
    const gross = credit.lines.reduce((sum, line) => sum + line.debit, 0n);
    if (
      returns.length !== 1 ||
      returns[0]!.source.documentId !== allocation.documentId ||
      gross <= 0n
    )
      fail(
        "Inventory supplier credit needs an exact source-purchase allocation.",
        credit,
        returns[0]?.row.inventoryAccountId ?? null,
        allocation.amount,
        ["One verified purchase-cost source for this applied supplier credit"],
      );
    const item = returns[0]!;
    const amount = (item.row.costMinor * allocation.amount) / gross;
    const id = allocation.id ?? `${allocation.documentId}:${allocation.creditId}`;
    events.push({
      date: allocation.allocatedOn ?? credit.date,
      credit: { id, source: item.source, amount, reverse: false },
    });
    if (allocation.reversedOn)
      events.push({
        date: allocation.reversedOn,
        credit: { id, source: item.source, amount, reverse: true },
      });
  }
  const days = [...new Set(events.map((event) => event.date))].sort();
  const movements: CashInventoryTrace["movements"] = [];
  const creditRefunded = new Map<string, bigint>();
  for (const date of days) {
    const day = events.filter((event) => event.date === date);
    const touched = new Set<Source>();
    const pending = day
      .filter((event) => event.evidence)
      .sort((a, b) => a.evidence!.row.id.localeCompare(b.evidence!.row.id));
    while (pending.length) {
      const index = pending.findIndex(({ evidence: item }) =>
        item!.row.movementKind === "customer_return"
          ? item!.source.sales.has(item!.row.reversesEvidenceId ?? "")
          : size(item!.source.free) >= item!.row.costMinor,
      );
      const event = pending.splice(index < 0 ? 0 : index, 1)[0]!;
      const { row, source, journal } = event.evidence!;
      if (index < 0)
        fail(
          "Inventory returns or sales exceed the verified remaining source cost.",
          journal,
          row.inventoryAccountId,
          row.costMinor,
          ["Unconsumed original purchase cost or sufficient cost on the referenced original sale"],
          row.purchaseDocumentId,
        );
      if (row.movementKind === "customer_return") {
        const original = source.sales.get(row.reversesEvidenceId ?? "");
        if (!original || size(original) < row.costMinor)
          fail(
            "A customer inventory return exceeds its referenced original sale.",
            journal,
            source.accountId,
            row.costMinor,
            ["Original approved sale cost allocation and its unreturned source-cost slices"],
            source.documentId,
          );
        release(source, take(original, row.costMinor));
      } else {
        const slices = take(source.free, row.costMinor);
        (row.movementKind === "sale" ? source.sales : source.returned).set(row.id, slices);
      }
      touched.add(source);
    }
    for (const { credit } of day
      .filter((event) => event.credit)
      .sort((a, b) => Number(b.credit!.reverse) - Number(a.credit!.reverse))) {
      const item = credit!;
      const source = item.source;
      if (item.reverse) {
        const slices = source.credited.get(item.id);
        if (!slices)
          fail(
            "Inventory credit reversal lacks its original allocation.",
            source.journal,
            source.accountId,
            item.amount,
            ["Original supplier credit cost slices"],
            source.documentId,
          );
        source.credited.delete(item.id);
      } else {
        const available = [...source.returned.values()].flat().map((slice) => ({ ...slice }));
        const already = [...source.credited.values()].flat();
        const eligible: Slice[] = [];
        for (const slice of available) {
          let pieces = [slice];
          for (const excluded of already)
            pieces = pieces.flatMap((part) =>
              excluded.to <= part.from || excluded.from >= part.to
                ? [part]
                : [
                    ...(part.from < excluded.from ? [{ from: part.from, to: excluded.from }] : []),
                    ...(part.to > excluded.to ? [{ from: excluded.to, to: part.to }] : []),
                  ],
            );
          eligible.push(...pieces);
        }
        try {
          source.credited.set(item.id, take(eligible, item.amount));
        } catch {
          fail(
            "Inventory credit exceeds verified returned stock cost.",
            source.journal,
            source.accountId,
            item.amount,
            ["Original returned stock and exact applied credit cost"],
            source.documentId,
          );
        }
      }
      touched.add(source);
    }
    for (const { entry, source } of day.filter((event) => event.entry)) {
      const amount = entry!.debit - entry!.credit;
      if (source) {
        if (size([...source.returned.values()].flat()) && amount < 0n)
          fail(
            "A returned inventory purchase has a payment reallocation that needs explicit credit/payment slice evidence.",
            journals.get(entry!.journalId),
            source.accountId,
            amount,
            [
              "Verified credit allocation and exact original payment release/reapplication slices; do not infer a stock-cost reallocation",
            ],
            source.documentId,
          );
        source.paid += amount;
        if (source.paid < 0n)
          fail(
            "Inventory payment reversals exceed the verified paid source cost.",
            journals.get(entry!.journalId),
            source.accountId,
            source.paid,
            ["Original matching paid purchase and reversal allocation"],
            source.documentId,
          );
        touched.add(source);
      } else {
        const creditKey = key(entry!.sourceJournalId, entry!.sourceAccountId ?? entry!.accountId);
        const allocations = creditSources.get(creditKey)!;
        if (amount > 0n)
          fail(
            "A supplier return has an unsupported positive inventory cash allocation.",
            journals.get(entry!.journalId),
            entry!.sourceAccountId ?? entry!.accountId,
            amount,
            ["Verified refund or exact refund reversal with its original payment linkage"],
          );
        const before = creditRefunded.get(creditKey) ?? 0n;
        const after = before - amount;
        if (after < 0n)
          fail(
            "Inventory refund reversal exceeds its original refund.",
            journals.get(entry!.journalId),
            entry!.sourceAccountId ?? entry!.accountId,
            amount,
            ["Original posted supplier refund"],
          );
        const totalWeight = allocations.reduce((sum, allocation) => sum + allocation.weight, 0n);
        let prefix = 0n;
        for (const allocation of allocations.sort((a, b) =>
          a.source.documentId.localeCompare(b.source.documentId),
        )) {
          const end = prefix + allocation.weight;
          allocation.source.refunded +=
            (after * end) / totalWeight -
            (after * prefix) / totalWeight -
            ((before * end) / totalWeight - (before * prefix) / totalWeight);
          touched.add(allocation.source);
          prefix = end;
        }
        creditRefunded.set(creditKey, after);
      }
    }
    for (const source of touched) {
      const value = position(source);
      const soldPaid = BigInt(value.cashPaidCostSoldMinor);
      if (date >= period.from)
        movements.push({
          ...value,
          date,
          deltaPaidCostSoldMinor: (soldPaid - source.lastSoldPaid).toString(),
        });
      source.lastSoldPaid = soldPaid;
    }
  }
  return {
    basis: "cash",
    currency: input.baseCurrency,
    ...period,
    sources: [...sources.values()]
      .map(position)
      .sort(
        (a, b) =>
          a.purchaseDocumentId.localeCompare(b.purchaseDocumentId) ||
          a.inventoryAccountId.localeCompare(b.inventoryAccountId),
      ),
    movements,
  };
}
