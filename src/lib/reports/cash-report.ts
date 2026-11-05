import type { PostedLine } from "@/lib/accounting/reporting";
import { fromMinorUnits } from "@/lib/accounting/money";
import type { CashPnlEntry, CashPnlInput } from "./cash-profit-loss";
import { convertMinorToBase } from "@/lib/accounting/fx";
import { apportionCumulativeCash } from "./cash-settlement";
import { compareFilterDecimals, type ReportFilter, type ReportFilters } from "./report-filters";

type AttributedCashEntry = CashPnlEntry & {
  sourceDescription?: string | null;
  sourceLineId?: string;
  sourceComponentBefore?: string;
  sourceComponentAfter?: string;
};

/** Split already recognized components using their complete historical position.
 * The engine supplies positions even when a later void cancels all-time balances.
 */
function attributeCashLines(entries: CashPnlEntry[], input: CashPnlInput): AttributedCashEntry[] {
  const journals = new Map(input.journals.map((journal) => [journal.id, journal]));
  const directPositions = new Map<string, number>();
  return entries.flatMap((raw): AttributedCashEntry[] => {
    const entry = raw as AttributedCashEntry;
    if (entry.sourceLineId || entry.sourceDescription !== undefined) return [entry];
    const source = journals.get(entry.sourceJournalId);
    if (source?.sourceType === "opening_balance" && entry.sourceId) {
      const evidence = input.openingEvidence?.find((item) => item.documentId === entry.sourceId);
      if (evidence)
        return [
          {
            ...entry,
            sourceDescription: `Opening document · ${evidence.evidenceReference}`,
            sourceLineId: `opening:${evidence.id}:${entry.sourceAccountId ?? entry.accountId}`,
          },
        ];
    }
    const sourceLines =
      source?.lines.filter(
        (line) => line.accountId === (entry.sourceAccountId ?? entry.accountId),
      ) ?? [];
    if (!source || sourceLines.length === 0) return [entry];
    if (sourceLines.length === 1)
      return [
        {
          ...entry,
          sourceDescription: sourceLines[0]!.description ?? null,
          sourceLineId: sourceLines[0]!.lineId ?? `${source.id}:0`,
        },
      ];
    if (entry.reason === "settlement") {
      if (entry.sourceComponentBefore === undefined || entry.sourceComponentAfter === undefined)
        throw new Error("Cash line filters require exact source-component recognition history");
      const weights = sourceLines.map((line) =>
        line.debit > line.credit ? line.debit - line.credit : line.credit - line.debit,
      );
      const total = weights.reduce((sum, value) => sum + value, 0n);
      const shares = (value: string) => {
        const signed = BigInt(value);
        return apportionCumulativeCash(signed < 0n ? -signed : signed, weights, total).map(
          (share) => (signed < 0n ? -share : share),
        );
      };
      const before = shares(entry.sourceComponentBefore),
        after = shares(entry.sourceComponentAfter);
      return sourceLines.flatMap((line, index) => {
        const amount = after[index]! - before[index]!;
        return amount === 0n
          ? []
          : [
              {
                ...entry,
                debit: amount > 0n ? amount : 0n,
                credit: amount < 0n ? -amount : 0n,
                sourceDescription: line.description ?? null,
                sourceLineId: line.lineId ?? `${source.id}:${index}`,
              },
            ];
      });
    }
    const base = (amount: bigint) =>
      source.currency === input.baseCurrency
        ? amount
        : convertMinorToBase(amount, source.rate ?? "", source.currency, input.baseCurrency);
    const candidates = sourceLines.filter(
      (line) => base(line.debit) === entry.debit && base(line.credit) === entry.credit,
    );
    const key = `${source.id}:${entry.accountId}:${entry.debit}:${entry.credit}`;
    const index = directPositions.get(key) ?? 0;
    directPositions.set(key, index + 1);
    const line = candidates[index];
    if (!line) throw new Error("Cash line description cannot be reconciled to its posted source");
    return [
      {
        ...entry,
        sourceDescription: line.description ?? null,
        sourceLineId: line.lineId ?? `${source.id}:${source.lines.indexOf(line)}`,
      },
    ];
  });
}

/** Cash entries carry recognition dates while retaining the actual posted source identity. */
export function cashEntriesToPostedLines(
  input: CashPnlInput,
  entries: CashPnlEntry[],
): PostedLine[] {
  return attributedLinesToPostedLines(input, attributeCashLines(entries, input));
}

function attributedLinesToPostedLines(
  input: CashPnlInput,
  entries: AttributedCashEntry[],
): PostedLine[] {
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const journals = new Map(input.journals.map((j) => [j.id, j]));
  return entries.map((entry, index) => {
    const account = accounts.get(entry.accountId);
    if (!account) throw new Error("Cash entry account is outside the reporting company");
    const journal = journals.get(entry.journalId);
    const source = journals.get(entry.sourceJournalId);
    return {
      account_id: account.id,
      account_code: account.code,
      account_name: account.name,
      account_type: account.account_type,
      account_subtype: account.subtype,
      account_kind: account.account_kind,
      system_key: account.system_key,
      fs_line: account.fs_line,
      cash_flow_class: account.cash_flow_class,
      line_id: `cash:${entry.journalId}:${entry.sourceJournalId}:${entry.accountId}:${entry.date}:${entry.sourceLineId ?? ""}:${index}`,
      line_no: index + 1,
      journal_id: entry.journalId,
      journal_number: Number(entry.journalNumber) || 0,
      journal_date: entry.date,
      source_type: entry.sourceType,
      source_id: entry.sourceId,
      memo: (journal as { memo?: string | null } | undefined)?.memo ?? null,
      description:
        (entry as AttributedCashEntry).sourceDescription !== undefined
          ? ((entry as AttributedCashEntry).sourceDescription ?? null)
          : (source?.lines.find((l) => l.accountId === entry.accountId)?.description ?? null),
      debit_minor: entry.debit,
      credit_minor: entry.credit,
      // Values have already been converted using the posted source/payment rates.
      currency_code: input.baseCurrency,
      base_currency: input.baseCurrency,
      fx_rate_to_base: "1",
    };
  });
}

function matches(value: string | null, clause: ReportFilter, numeric: boolean) {
  const empty = value === null || value === "";
  if (clause.op === "empty") return empty;
  if (clause.op === "not_empty") return !empty;
  if (value === null) return false;
  const compare = (a: string, b: string) =>
    numeric ? compareFilterDecimals(a, b) : a.toLowerCase().localeCompare(b.toLowerCase());
  const first = clause.values[0]!;
  switch (clause.op) {
    case "eq":
      return compare(value, first) === 0;
    case "neq":
      return compare(value, first) !== 0;
    case "in":
      return clause.values.some((v) => compare(value, v) === 0);
    case "not_in":
      return clause.values.every((v) => compare(value, v) !== 0);
    case "gt":
      return compare(value, first) > 0;
    case "lt":
      return compare(value, first) < 0;
    case "between":
      return compare(value, first) >= 0 && compare(value, clause.values[1]!) <= 0;
    case "contains":
      return value.toLowerCase().includes(first.toLowerCase());
    case "not_contains":
      return !value.toLowerCase().includes(first.toLowerCase());
    case "starts_with":
      return value.toLowerCase().startsWith(first.toLowerCase());
    case "ends_with":
      return value.toLowerCase().endsWith(first.toLowerCase());
  }
}

/** Same existing filter contract, applied after allocation and before aggregation. */
export function filterCashEntries(
  entries: CashPnlEntry[],
  input: CashPnlInput,
  filters: ReportFilters,
): CashPnlEntry[] {
  if (!filters.clauses.length) return entries;
  const attributed = attributeCashLines(entries, input);
  const lines = attributedLinesToPostedLines(input, attributed);
  const journals = new Map(input.journals.map((j) => [j.id, j]));
  return attributed.filter((entry, index) => {
    const line = lines[index]!;
    const values: Record<ReportFilter["field"], string | null> = {
      account_id: line.account_id,
      account_code: line.account_code,
      account_name: line.account_name,
      account_type: line.account_type,
      account_group: line.fs_line ?? null,
      journal_date: entry.date,
      source_type: entry.sourceType,
      currency: journals.get(entry.journalId)?.currency ?? input.baseCurrency,
      status: "posted",
      memo: line.memo ?? null,
      description: line.description ?? null,
      debit: fromMinorUnits(entry.debit, input.baseCurrency),
      credit: fromMinorUnits(entry.credit, input.baseCurrency),
    };
    const results = filters.clauses.map((clause) =>
      matches(values[clause.field], clause, clause.field === "debit" || clause.field === "credit"),
    );
    return filters.logic === "or" ? results.some(Boolean) : results.every(Boolean);
  });
}
