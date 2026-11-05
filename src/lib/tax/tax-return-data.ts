/**
 * Loads document tax lines for a return period and turns them into `TaxFact`s (TX-01).
 *
 * Source of truth is the document lines (net + tax per line, grouped by tax code), never the
 * journals, so settlement journals and manual tax adjustments cannot leak into a later return.
 * Only authorised, partly paid and paid documents count; drafts, voids and documents awaiting
 * approval are left out. Foreign-currency documents convert at the rate of their posted journal.
 */

import { normalizeCashAllocationHistory } from "@/lib/reports/cash-source";
import { fetchAllPages } from "@/lib/accounting/fetch-all";
import { convertMinorToBase } from "@/lib/accounting/fx";
import type { Sb } from "@/lib/accounting/ledger-data";
import { isSelfAssessedReverseCharge, reverseChargeTaxMinor } from "@/lib/tax/reverse-charge";
import { scaleByFraction, type TaxFact, type TaxSide } from "@/lib/tax/vat-return";

type Row = Record<string, unknown>;
type PageResult = { data: Row[] | null; error: { message: string; code?: string } | null };
type Qb = {
  select: (columns: string) => Qb;
  eq: (column: string, value: unknown) => Qb;
  in: (column: string, values: unknown[]) => Qb;
  gte: (column: string, value: unknown) => Qb;
  lte: (column: string, value: unknown) => Qb;
  order: (column: string) => Qb;
  range: (from: number, to: number) => PromiseLike<PageResult>;
};

function table(sb: Sb, name: string): Qb {
  return (sb as unknown as { from: (t: string) => Qb }).from(name);
}

const CHUNK = 100;
const LIVE_STATUSES = ["authorised", "partly_paid", "paid"];

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function str(row: Row, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

function big(row: Row, key: string): bigint {
  const v = row[key];
  if (typeof v === "number" && Number.isSafeInteger(v)) return BigInt(v);
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  if (v != null) throw new Error(`Invalid or unsafe tax amount: ${key}`);
  return 0n;
}

type Source = {
  kind: string;
  side: TaxSide;
  sign: 1 | -1;
  header: string;
  dateCol: string;
  /** Header carries net/tax itself (no line table). */
  headerOnly?: boolean;
  lines?: { table: string; fk: string; hasCode: boolean; hasRate?: boolean };
  /** Cash basis: payments applied to the document, with the payment date. */
  allocations?: {
    table: string;
    docFk: string;
    parentFk: string;
    parentTable: string;
    parentDate: string;
    /** Parent statuses to ignore. */
    skipStatuses: string[];
  };
  refundKind?: "customer_refund" | "supplier_refund";
};

const SOURCES: Source[] = [
  {
    kind: "sales_invoice",
    side: "sales",
    sign: 1,
    header: "sales_invoices",
    dateCol: "invoice_date",
    lines: { table: "sales_invoice_lines", fk: "invoice_id", hasCode: true },
    allocations: {
      table: "sales_receipt_allocations",
      docFk: "invoice_id",
      parentFk: "receipt_id",
      parentTable: "sales_receipts",
      parentDate: "receipt_date",
      skipStatuses: ["void", "voided", "draft"],
    },
  },
  {
    kind: "sales_credit_note",
    side: "sales",
    sign: -1,
    header: "sales_credit_notes",
    dateCol: "credit_date",
    lines: { table: "sales_credit_note_lines", fk: "credit_note_id", hasCode: false },
    refundKind: "customer_refund",
  },
  {
    kind: "purchase_bill",
    side: "purchases",
    sign: 1,
    header: "purchase_bills",
    dateCol: "bill_date",
    lines: { table: "purchase_bill_lines", fk: "bill_id", hasCode: true, hasRate: true },
    allocations: {
      table: "supplier_payment_allocations",
      docFk: "bill_id",
      parentFk: "payment_id",
      parentTable: "supplier_payments",
      parentDate: "payment_date",
      skipStatuses: ["void", "draft", "awaiting_approval"],
    },
  },
  {
    kind: "purchase_credit_note",
    side: "purchases",
    sign: -1,
    header: "purchase_credit_notes",
    dateCol: "credit_date",
    lines: { table: "purchase_credit_note_lines", fk: "credit_note_id", hasCode: false },
    refundKind: "supplier_refund",
  },
  {
    kind: "purchase_expense",
    side: "purchases",
    sign: 1,
    header: "purchase_expenses",
    dateCol: "expense_date",
    headerOnly: true,
  },
];

export type TaxFactsResult = {
  facts: TaxFact[];
  documents: number;
  /** Foreign-currency documents with no usable posted-journal rate. They are left out. */
  skippedNoRate: number;
};

type CodeInfo = { treatment: string; recoverable: boolean };

async function loadCodes(sb: Sb, companyId: string): Promise<Map<string, CodeInfo>> {
  const rows = await fetchAllPages<Row>((from, to) =>
    table(sb, "tax_codes")
      .select("id, treatment, is_recoverable")
      .eq("company_id", companyId)
      .order("id")
      .range(from, to),
  );
  const map = new Map<string, CodeInfo>();
  for (const r of rows) {
    map.set(str(r, "id"), {
      treatment: str(r, "treatment") || "standard",
      recoverable: r["is_recoverable"] !== false,
    });
  }
  return map;
}

async function loadJournalRates(
  sb: Sb,
  companyId: string,
  journalIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const ids of chunks(journalIds, CHUNK)) {
    const rows = await fetchAllPages<Row>((from, to) =>
      table(sb, "journals")
        .select("id, fx_rate_to_base")
        .eq("company_id", companyId)
        .in("id", ids)
        .order("id")
        .range(from, to),
    );
    for (const r of rows) {
      const rate = r["fx_rate_to_base"];
      if (typeof rate === "number" || typeof rate === "string") map.set(str(r, "id"), String(rate));
    }
  }
  return map;
}

type CashPosition = {
  before: bigint;
  through: bigint;
  events: Array<{ date: string; amount: bigint; id: string; sequence: number }>;
};

function addPosition(
  positions: Map<string, CashPosition>,
  documentId: string,
  date: string,
  amount: bigint,
  from: string,
  to: string,
  eventId: string,
) {
  if (date > to) return;
  const position = positions.get(documentId) ?? { before: 0n, through: 0n, events: [] };
  position.events.push({ date, amount, id: eventId, sequence: position.events.length });
  position.through += amount;
  if (date < from) position.before += amount;
  positions.set(documentId, position);
}

async function reversalDates(sb: Sb, companyId: string, parents: Row[]) {
  const dates = new Map<string, string>();
  const ids = [...new Set(parents.map((p) => str(p, "void_journal_id")).filter(Boolean))];
  for (const batch of chunks(ids, CHUNK)) {
    const rows = await fetchAllPages<Row>((f, t) =>
      table(sb, "journals")
        .select("id,journal_date")
        .eq("company_id", companyId)
        .eq("status", "posted")
        .in("id", batch)
        .order("id")
        .range(f, t),
    );
    for (const row of rows) dates.set(str(row, "id"), str(row, "journal_date"));
  }
  return dates;
}

/** Cumulative positions preserve prior-period pennies and dated reversals. */
async function loadAllocatedInPeriod(
  sb: Sb,
  companyId: string,
  a: NonNullable<Source["allocations"]>,
  from: string,
  to: string,
): Promise<Map<string, CashPosition>> {
  const parents = await fetchAllPages<Row>((f, t) =>
    table(sb, a.parentTable)
      .select(`id, company_id, status, posted_journal_id, void_journal_id, ${a.parentDate}`)
      .eq("company_id", companyId)
      .lte(a.parentDate, to)
      .order("id")
      .range(f, t),
  );
  const postedParents = parents.filter((p) => Boolean(str(p, "posted_journal_id")));
  const parentMap = new Map(postedParents.map((p) => [str(p, "id"), p]));
  const voidDates = await reversalDates(sb, companyId, postedParents);
  const byDoc = new Map<string, CashPosition>();
  for (const ids of chunks([...parentMap.keys()], CHUNK)) {
    const rows = await fetchAllPages<Row>((f, t) =>
      table(sb, a.table)
        .select(
          `id, company_id, ${a.docFk}, ${a.parentFk}, amount_minor, allocated_on${a.parentTable === "sales_receipts" ? ", reversed_on" : ""}`,
        )
        .eq("company_id", companyId)
        .in(a.parentFk, ids)
        .order("id")
        .range(f, t),
    );
    const normalized =
      a.parentTable === "supplier_payments"
        ? normalizeCashAllocationHistory(
            rows,
            await fetchAllPages<Row>((f, t) =>
              table(sb, "cash_allocation_history")
                .select(
                  "id,company_id,source_table,allocation_id,operation,source_row,recorded_at,event_seq",
                )
                .eq("company_id", companyId)
                .eq("source_table", a.table)
                .order("id")
                .range(f, t),
            ),
            {
              companyId,
              sourceTable: a.table,
              parentKey: a.parentFk,
              parents: postedParents.filter((p) => ids.includes(str(p, "id"))),
              parentDateKey: a.parentDate,
              journalDates: voidDates,
            },
          )
        : rows;
    for (const r of normalized) {
      const doc = str(r, a.docFk);
      const parent = parentMap.get(str(r, a.parentFk))!;
      const date = [str(parent, a.parentDate), str(r, "allocated_on")].sort().at(-1)!;
      const amount = big(r, "amount_minor");
      addPosition(byDoc, doc, date, amount, from, to, str(r, "id"));
      const reversedOn = str(r, "reversed_on") || voidDates.get(str(parent, "void_journal_id"));
      if (reversedOn)
        addPosition(byDoc, doc, reversedOn, -amount, from, to, `${str(r, "id")}:reversal`);
      else if (["void", "voided"].includes(str(parent, "status")))
        throw new Error("Voided cash tax payment requires a posted reversal date");
    }
  }
  return byDoc;
}

/** An unused/noncash credit note has no cash tax movement. */
async function loadRefundedCredits(
  sb: Sb,
  companyId: string,
  src: Source,
  from: string,
  to: string,
): Promise<Map<string, CashPosition>> {
  const parents = await fetchAllPages<Row>((f, t) =>
    table(sb, "money_documents")
      .select("id,status,posted_journal_id,void_journal_id,document_date")
      .eq("company_id", companyId)
      .eq("kind", src.refundKind)
      .lte("document_date", to)
      .order("id")
      .range(f, t),
  );
  const posted = new Map(
    parents.filter((p) => str(p, "posted_journal_id")).map((p) => [str(p, "id"), p]),
  );
  const voidDates = await reversalDates(sb, companyId, [...posted.values()]);
  const positions = new Map<string, CashPosition>();
  for (const ids of chunks([...posted.keys()], CHUNK)) {
    const uses = await fetchAllPages<Row>((f, t) =>
      table(sb, "money_document_credit_uses")
        .select("id,document_id,source_id,amount_minor")
        .eq("company_id", companyId)
        .eq("source_kind", src.kind)
        .in("document_id", ids)
        .order("id")
        .range(f, t),
    );
    const history = await fetchAllPages<Row>((f, t) =>
      table(sb, "cash_allocation_history")
        .select("id,operation,source_row")
        .eq("company_id", companyId)
        .eq("source_table", "money_document_credit_uses")
        .order("id")
        .range(f, t),
    );
    for (const event of history) {
      const row = event["source_row"] as Row | undefined;
      if (!row || row["source_kind"] !== src.kind || !ids.includes(str(row, "document_id")))
        continue;
      if (
        event["operation"] !== "DELETE" ||
        uses.some((u) => u["id"] === row["id"]) ||
        !str(posted.get(str(row, "document_id"))!, "void_journal_id")
      )
        throw new Error("Cash tax refunds require verified credit-use history");
      uses.push(row);
    }
    for (const use of uses) {
      const parent = posted.get(str(use, "document_id"))!;
      const amount = big(use, "amount_minor");
      addPosition(
        positions,
        str(use, "source_id"),
        str(parent, "document_date"),
        amount,
        from,
        to,
        str(use, "id"),
      );
      const reversedOn = voidDates.get(str(parent, "void_journal_id"));
      if (reversedOn)
        addPosition(
          positions,
          str(use, "source_id"),
          reversedOn,
          -amount,
          from,
          to,
          `${str(use, "id")}:reversal`,
        );
      else if (str(parent, "status") === "void")
        throw new Error("Cash tax refund requires a posted reversal date");
    }
  }
  return positions;
}

export async function loadTaxFacts(
  sb: Sb,
  args: {
    companyId: string;
    from: string;
    to: string;
    basis: "accrual" | "cash";
    baseCurrency: string;
  },
): Promise<TaxFactsResult> {
  const { companyId, from, to, basis, baseCurrency } = args;
  const codes = await loadCodes(sb, companyId);
  const facts: TaxFact[] = [];
  let documents = 0;
  let skippedNoRate = 0;

  for (const src of SOURCES) {
    const useCash = basis === "cash" && Boolean(src.allocations || src.refundKind);
    const allocated =
      useCash && src.allocations
        ? await loadAllocatedInPeriod(sb, companyId, src.allocations!, from, to)
        : useCash && src.refundKind
          ? await loadRefundedCredits(sb, companyId, src, from, to)
          : null;

    const columns = [
      "id",
      src.dateCol,
      "currency_code",
      "status",
      "posted_journal_id",
      src.headerOnly ? "net_minor, tax_minor" : "total_minor",
    ].join(", ");

    let headers: Row[] = [];
    if (allocated) {
      for (const ids of chunks([...allocated.keys()], CHUNK)) {
        headers = headers.concat(
          await fetchAllPages<Row>((f, t) =>
            table(sb, src.header)
              .select(columns)
              .eq("company_id", companyId)
              .in("id", ids)
              .in("status", LIVE_STATUSES)
              .order("id")
              .range(f, t),
          ),
        );
      }
    } else {
      headers = await fetchAllPages<Row>((f, t) =>
        table(sb, src.header)
          .select(columns)
          .eq("company_id", companyId)
          .in("status", LIVE_STATUSES)
          .gte(src.dateCol, from)
          .lte(src.dateCol, to)
          .order("id")
          .range(f, t),
      );
    }
    if (headers.length === 0) continue;

    const foreignJournalIds = headers
      .filter((h) => str(h, "currency_code").toUpperCase() !== baseCurrency.toUpperCase())
      .map((h) => str(h, "posted_journal_id"))
      .filter(Boolean);
    const rates = await loadJournalRates(sb, companyId, [...new Set(foreignJournalIds)]);

    type Doc = {
      id: string;
      currency: string;
      rate: string | null;
      date: string;
      fraction: [CashPosition, bigint] | null;
    };
    const docs = new Map<string, Doc>();
    for (const h of headers) {
      const currency = str(h, "currency_code").toUpperCase() || baseCurrency;
      const foreign = currency !== baseCurrency.toUpperCase();
      const rate = foreign ? (rates.get(str(h, "posted_journal_id")) ?? null) : null;
      if (foreign && rate === null) {
        skippedNoRate += 1;
        continue;
      }
      const id = str(h, "id");
      const paid = allocated?.get(id) ?? { before: 0n, through: 0n, events: [] };
      const total = big(h, "total_minor");
      if (
        allocated &&
        (total <= 0n ||
          paid.before < 0n ||
          paid.through < 0n ||
          paid.before > total ||
          paid.through > total)
      )
        throw new Error("Cash tax allocations exceed the source document total");
      docs.set(id, {
        id,
        currency,
        rate,
        date: str(h, src.dateCol),
        fraction: allocated ? [paid, total] : null,
      });
    }
    documents += docs.size;

    const toBase = (d: Doc, minor: bigint): bigint =>
      d.rate === null ? minor : convertMinorToBase(minor, d.rate, d.currency, baseCurrency);
    const scale = (d: Doc, base: bigint): bigint =>
      d.fraction
        ? scaleByFraction(base, d.fraction[0].through, d.fraction[1]) -
          scaleByFraction(base, d.fraction[0].before, d.fraction[1])
        : base;

    if (src.headerOnly) {
      for (const h of headers) {
        const d = docs.get(str(h, "id"));
        if (!d) continue;
        const tax = big(h, "tax_minor");
        facts.push({
          source: { type: src.kind, id: d.id, lineId: d.id, date: d.date },
          side: src.side,
          sign: src.sign,
          treatment: null,
          recoverable: true,
          netBase: scale(d, toBase(d, big(h, "net_minor"))),
          taxBase: scale(d, toBase(d, tax)),
          coded: false,
        });
      }
      continue;
    }

    const lineSpec = src.lines!;
    const lineColumns = `id, ${lineSpec.fk}, net_minor, tax_minor${lineSpec.hasCode ? ", tax_code_id" : ""}${lineSpec.hasRate ? ", tax_rate_bps" : ""}`;
    for (const ids of chunks([...docs.keys()], CHUNK)) {
      const lines = await fetchAllPages<Row>((f, t) =>
        table(sb, lineSpec.table)
          .select(lineColumns)
          .eq("company_id", companyId)
          .in(lineSpec.fk, ids)
          .order("id")
          .range(f, t),
      );
      for (const line of lines) {
        const d = docs.get(str(line, lineSpec.fk));
        if (!d) continue;
        const codeId = lineSpec.hasCode ? str(line, "tax_code_id") : "";
        const code = codeId ? codes.get(codeId) : undefined;
        const netMinor = big(line, "net_minor");
        let taxMinor = big(line, "tax_minor");
        // Reverse charge on a bill: the supplier charged no tax, so the buyer works it out from
        // the net amount and the code's rate. It counts as output and input tax (TX-04).
        const selfAssessed =
          Boolean(lineSpec.hasRate) && isSelfAssessedReverseCharge(code?.treatment, taxMinor);
        if (selfAssessed) {
          taxMinor = reverseChargeTaxMinor(netMinor, Number(big(line, "tax_rate_bps")));
        }
        const netBase = toBase(d, netMinor),
          taxBase = toBase(d, taxMinor);
        const movements: Array<{ date: string; id?: string; net: bigint; tax: bigint }> = [];
        if (d.fraction) {
          const total = d.fraction[1];
          type Slice = { start: bigint; end: bigint };
          const free: Slice[] = [{ start: 0n, end: total }];
          const used = new Map<string, Slice[]>();
          const ordered = [...d.fraction[0].events].sort(
            (a, b) =>
              a.date.localeCompare(b.date) || a.sequence - b.sequence || a.id.localeCompare(b.id),
          );
          // Dates have day precision. Apply a known reversal before a replacement,
          // and retain the dependency when an allocation and its void share a day.
          const pending = [...ordered];
          while (pending.length) {
            const day = pending[0]!.date;
            const available = free.reduce((sum, part) => sum + part.end - part.start, 0n);
            const sameDay = (event: (typeof pending)[number]) => event.date === day;
            let index = pending.findIndex(
              (event) =>
                sameDay(event) && event.amount < 0n && used.has(event.id.replace(/:reversal$/, "")),
            );
            if (index < 0)
              index = pending.findIndex(
                (event) =>
                  sameDay(event) &&
                  event.amount > 0n &&
                  event.amount <= available &&
                  pending.some(
                    (other) => other.date === day && other.id === `${event.id}:reversal`,
                  ),
              );
            if (index < 0)
              index = pending.findIndex(
                (event) => sameDay(event) && event.amount > 0n && event.amount <= available,
              );
            if (index < 0)
              throw new Error(
                "Cash tax event has no matching original allocation or exceeds its balance",
              );
            const event = pending.splice(index, 1)[0]!;
            let slices: Slice[];
            if (event.amount > 0n) {
              if (used.has(event.id)) throw new Error("Duplicate cash tax event");
              let remaining = event.amount;
              slices = [];
              while (remaining > 0n && free.length) {
                const first = free[0]!;
                const amount =
                  remaining < first.end - first.start ? remaining : first.end - first.start;
                slices.push({ start: first.start, end: first.start + amount });
                first.start += amount;
                remaining -= amount;
                if (first.start === first.end) free.shift();
              }
              if (remaining !== 0n)
                throw new Error("Cash tax event exceeds the source document balance");
              used.set(event.id, slices);
            } else {
              const originalId = event.id.replace(/:reversal$/, "");
              const original = used.get(originalId);
              if (
                !original ||
                original.reduce((sum, part) => sum + part.end - part.start, 0n) !== -event.amount
              )
                throw new Error("Cash tax reversal has no matching original allocation");
              slices = original;
              used.delete(originalId);
              free.push(...original.map((part) => ({ ...part })));
              free.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
            }
            const signed = event.amount < 0n ? -1n : 1n;
            const portion = (base: bigint) =>
              signed *
              slices.reduce(
                (sum, part) =>
                  sum +
                  scaleByFraction(base, part.end, total) -
                  scaleByFraction(base, part.start, total),
                0n,
              );
            if (event.date >= from)
              movements.push({
                date: event.date,
                id: event.id,
                net: portion(netBase),
                tax: portion(taxBase),
              });
          }
        } else movements.push({ date: d.date, net: netBase, tax: taxBase });
        for (const movement of movements)
          facts.push({
            side: src.side,
            sign: src.sign,
            treatment: code?.treatment ?? null,
            recoverable: code ? code.recoverable : true,
            netBase: movement.net,
            taxBase: movement.tax,
            coded: Boolean(code),
            source: {
              type: src.kind,
              id: d.id,
              lineId: str(line, "id"),
              date: movement.date,
              ...(movement.id ? { settlementId: movement.id } : {}),
            },
            ...(selfAssessed ? { selfAssessed: true } : {}),
          });
      }
    }
  }
  return { facts, documents, skippedNoRate };
}
