import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { ZodError } from "zod";
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  correctionFilter,
  conditionFields,
  type SearchCondition,
  type ConditionField,
  correctionInput,
  decimalFilterToMinor,
  exactMoney,
  grossSelection,
  type CorrectionSetup,
  type CorrectionLine,
  type CorrectionSearch,
  type CorrectionFilter,
  type CorrectionInput,
  type CorrectionPlan,
  type CorrectionBatch,
} from "@/lib/accounting/corrections/contracts";
import { sourceLabel } from "@/lib/reports/links";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { toCsv } from "@/lib/sales/csv";
import {
  correctionEvidenceIssue,
  correctionHistoryCounts,
  correctionHistoryCsv,
  correctionUndoDateIssue,
  filterCorrectionHistory,
  type CorrectionHistoryFilter,
} from "@/lib/accounting/corrections/history-review";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { CorrectionConditions } from "./CorrectionConditions";

type PostRequest = { input: CorrectionInput; requestKey: string; previewHash: string };
type Props = {
  companyId: string;
  setup: CorrectionSetup;
  busy: boolean;
  onSearch: (input: CorrectionFilter) => Promise<CorrectionSearch>;
  onPreview: (input: CorrectionInput) => Promise<CorrectionPlan>;
  onApply: (input: PostRequest) => Promise<CorrectionBatch>;
  onUndo: (input: { batch: CorrectionBatch; date: string; reason: string }) => Promise<CorrectionBatch>;
  history: { rows: CorrectionBatch[]; has_more: boolean; page: number };
  historyLoading: boolean;
  historyError: string;
  onHistoryPage: (page: number) => void;
  onHistoryRefresh: () => void;
};
function correctionError(error: unknown): string {
  return error instanceof ZodError
    ? (error.issues[0]?.message ?? "Check the correction inputs")
    : friendlyAuthError(error);
}
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function TransactionCorrectionsView({
  companyId,
  setup,
  busy,
  onSearch,
  onPreview,
  onApply,
  onUndo,
  history,
  historyLoading,
  historyError,
  onHistoryPage,
  onHistoryRefresh,
}: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`),
    [to, setTo] = useState(today),
    [account, setAccount] = useState(""),
    [source, setSource] = useState(""),
    [query, setQuery] = useState(""),
    [min, setMin] = useState(""),
    [max, setMax] = useState("");
  const [scope, setScope] = useState<CorrectionFilter["scope"]>("all");
  const [match, setMatch] = useState<"all" | "any">("all");
  const [conditions, setConditions] = useState<SearchCondition[]>([]);
  const [crossAck, setCrossAck] = useState(false);
  const [result, setResult] = useState<CorrectionSearch | null>(null),
    [searched, setSearched] = useState<CorrectionFilter | null>(null),
    [selection, setSelection] = useState<Record<string, CorrectionLine>>({});
  const [target, setTarget] = useState(""),
    [mode, setMode] = useState<"original" | "adjustment">("original"),
    [date, setDate] = useState(today),
    [reason, setReason] = useState("");
  const [review, setReview] = useState<{ plan: CorrectionPlan; request: PostRequest } | null>(null),
    [ack, setAck] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [undoBatch, setUndoBatch] = useState(""),
    [undoDate, setUndoDate] = useState(today),
    [undoReason, setUndoReason] = useState(""),
    [undoAcknowledged, setUndoAcknowledged] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<CorrectionHistoryFilter>("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const searchVersion = useRef(0);
  const rows = Object.values(selection);
  const historyCounts = correctionHistoryCounts(history.rows);
  const filteredHistory = filterCorrectionHistory(history.rows, historyStatus, historyQuery);
  const selectedUndo = history.rows.find((batch) => batch.id === undoBatch);
  const undoIssue = selectedUndo
    ? correctionUndoDateIssue(selectedUndo, undoDate, undoReason)
    : null;
  const money = (n: string | bigint) => `${setup.currency} ${exactMoney(n, setup.decimals)}`;
  const clearReview = () => {
    setReview(null);
    setAck(false);
    setCrossAck(false);
  };
  const changeFilter = (callback: () => void) => {
    searchVersion.current += 1;
    callback();
    setResult(null);
    setSearched(null);
    setSelection({});
    clearReview();
  };
  async function search(page = 0, old?: CorrectionFilter) {
    const request = ++searchVersion.current;
    setError("");
    setSuccess("");
    setResult(null);
    setSearched(null);
    setSelection({});
    clearReview();
    try {
      const filters = old
        ? { ...old, page }
        : correctionFilter.parse({
            scope,
            match,
            conditions: conditions.map((c) =>
              conditionFields[c.field].kind === "money" &&
              !["empty", "not_empty"].includes(c.operator)
                ? {
                    ...c,
                    value: decimalFilterToMinor(c.value, setup.decimals) ?? "",
                    value_to:
                      c.operator === "between"
                        ? (decimalFilterToMinor(c.value_to, setup.decimals) ?? "")
                        : "",
                  }
                : c,
            ),
            from,
            to,
            account_id: account || null,
            source_type: source,
            query,
            min_minor: decimalFilterToMinor(min, setup.decimals),
            max_minor: decimalFilterToMinor(max, setup.decimals),
            page,
          });
      const found = await onSearch(filters);
      if (request !== searchVersion.current) return;
      setResult(found);
      setSearched(filters);
    } catch (e) {
      if (request !== searchVersion.current) return;
      setResult(null);
      setError(correctionError(e));
    }
  }
  function exportPlan(plan: Omit<CorrectionPlan, "preview_hash">, batch?: CorrectionBatch) {
    download(
      toCsv(
        [
          "Company ID",
          "Batch ID",
          "Status",
          "Source line ID",
          "Source journal",
          "Reference",
          "Contact",
          "Source date",
          "Posting date",
          "From account",
          "To account",
          "Currency",
          "Debit",
          "Credit",
          "Reason",
          "Created by",
          "Created at",
          "Correction journals",
          "Undo requested date",
          "Undo reason",
          "Undone by",
          "Undone at",
          "Undo journals",
          "Batch profit change",
          "Cross-statement line count",
        ],
        plan.rows.map((r) => [
          companyId,
          batch?.id ?? "Preview",
          batch?.status ?? "Not posted",
          r.id,
          r.journal_number,
          r.source_reference,
          r.contact_name,
          r.journal_date,
          r.posting_date,
          `${r.source_account_code} ${r.source_account_name}`,
          `${plan.target.code} ${plan.target.name}`,
          plan.currency,
          exactMoney(r.debit_minor, setup.decimals),
          exactMoney(r.credit_minor, setup.decimals),
          plan.reason,
          batch?.created_by ?? "",
          batch?.created_at ?? "",
          batch?.journal_ids.join("; ") ?? "",
          batch?.undo_date ?? "",
          batch?.undo_reason ?? "",
          batch?.undone_by ?? "",
          batch?.undone_at ?? "",
          batch?.undo_journal_ids?.join("; ") ?? "",
          plan.impact ? exactMoney(plan.impact.profit_change_minor, setup.decimals) : "",
          plan.impact?.cross_statement_lines.toString() ?? "",
        ]),
      ),
      "linkbooks-transaction-correction.csv",
    );
  }
  return (
    <section aria-label="Transaction corrections" className="space-y-5">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Transaction corrections</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search profit-and-loss and balance-sheet transactions, then move eligible amounts between
          GL accounts through traceable correction journals. Original invoices, bills, tax
          calculations, contacts and tracking details retain their original data.
        </p>
        <p className="mt-2 text-sm">
          Choose original posting dates to preserve historical account reporting, or an open
          adjustment date to affect that later period. Source-document and operational reports may
          still show original coding.
        </p>
        {!setup.can_apply && (
          <p className="mt-2 text-sm">
            You have view access. Posting corrections requires manual-journal and accounting-post
            permissions.
          </p>
        )}
      </div>
      {!setup.can_export && (
        <p className="text-sm text-muted-foreground">
          CSV evidence downloads require report-export permission.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded border p-3 text-sm">
          {success}
        </p>
      )}
      <form
        className="space-y-4 rounded-xl border p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <h3 className="font-semibold">1. Locate posted lines</h3>
        <fieldset disabled={busy} className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            From
            <Input
              aria-label="Correction search from"
              type="date"
              value={from}
              required
              onChange={(e) => changeFilter(() => setFrom(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Through
            <Input
              aria-label="Correction search through"
              type="date"
              value={to}
              required
              onChange={(e) => changeFilter(() => setTo(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Current account
            <RecordLookupSelect
              aria-label="Correction source account"
              className="block w-full rounded border bg-background p-2"
              value={account}
              onValueChange={(e) => changeFilter(() => setAccount(e))}
            >
              <option value="">All accounts in the selected statement</option>
              {setup.accounts
                .filter(
                  (a) =>
                    scope === "all" ||
                    (scope === "profit_loss"
                      ? ["income", "expense"].includes(a.type)
                      : ["asset", "liability", "equity"].includes(a.type)),
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
            </RecordLookupSelect>
          </label>
          <label className="text-sm">
            Source
            <select
              aria-label="Correction source type"
              className="block w-full rounded border bg-background p-2"
              value={source}
              onChange={(e) => changeFilter(() => setSource(e.target.value))}
            >
              {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

              <option value="">All posted sources</option>
              {[
                "manual",
                "sales_invoice",
                "sales_credit_note",
                "purchase_bill",
                "purchase_credit_note",
                "expense",
                "bank_transaction",
                "tax_adjustment",
                "fx_revaluation",
                "reversal",
                "other",
              ].map((s) => (
                <option key={s} value={s}>
                  {sourceLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Description, memo, journal, reference or contact
            <Input
              aria-label="Correction search text"
              value={query}
              maxLength={200}
              onChange={(e) => changeFilter(() => setQuery(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Minimum base-currency amount ({setup.currency})
            <Input
              aria-label="Correction minimum amount"
              inputMode="decimal"
              value={min}
              onChange={(e) => changeFilter(() => setMin(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Maximum base-currency amount ({setup.currency})
            <Input
              aria-label="Correction maximum amount"
              inputMode="decimal"
              value={max}
              onChange={(e) => changeFilter(() => setMax(e.target.value))}
            />
          </label>
        </fieldset>
        <label className="block text-sm">
          Financial statement
          <select
            aria-label="Correction statement"
            disabled={busy}
            className="ml-2 rounded border bg-background p-2"
            value={scope}
            onChange={(e) =>
              changeFilter(() => {
                setScope(e.target.value as CorrectionFilter["scope"]);
                setAccount("");
              })
            }
          >
            <option value="all">All financial statements</option>
            <option value="profit_loss">Profit and loss</option>
            <option value="balance_sheet">Balance sheet</option>
          </select>
        </label>
        <CorrectionConditions
          conditions={conditions}
          match={match}
          currency={setup.currency}
          disabled={busy}
          onChange={(c) => changeFilter(() => setConditions(c))}
          onMatch={(m) => changeFilter(() => setMatch(m))}
        />
        <Button type="submit" disabled={busy}>
          Find posted lines
        </Button>
      </form>
      <div className="space-y-3 rounded-xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Select lines for one destination</h3>
          <p className="text-sm">
            {rows.length} selected · gross value {money(grossSelection(rows))} · maximum 100
          </p>
        </div>
        {searched && (
          <p className="text-xs text-muted-foreground">
            Last search: {searched.from} through {searched.to}. Page {result ? result.page + 1 : 1};
            up to 200 lines per page. Changing search criteria clears the selection. Protected
            control, bank and asset-lifecycle accounts remain visible with their exclusion reason.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy || !setup.can_export || !result?.rows.length}
          onClick={() => {
            if (!result) return;
            download(
              toCsv(
                [
                  "Line ID",
                  "Journal",
                  "Date",
                  "Account",
                  "Type",
                  "Reference",
                  "Contact",
                  "Currency",
                  "Debit",
                  "Credit",
                  "Base currency",
                  "Base amount",
                  "Exclusion reason",
                  ...Object.values(conditionFields).map((f) => f.label),
                ],
                result.rows.map((r) => [
                  r.id,
                  r.journal_number,
                  r.journal_date,
                  `${r.account_code} ${r.account_name}`,
                  r.source_type,
                  r.source_reference,
                  r.contact_name ?? "",
                  r.currency,
                  exactMoney(r.debit_minor, r.currency_decimals),
                  exactMoney(r.credit_minor, r.currency_decimals),
                  setup.currency,
                  exactMoney(r.base_gross_minor, setup.decimals),
                  r.blocked_reason ?? "",
                  ...Object.keys(conditionFields).map((k) => {
                    const value = r.metadata?.[k];
                    return Array.isArray(value)
                      ? value.join("; ")
                      : typeof value === "string" &&
                          conditionFields[k as ConditionField].kind === "money"
                        ? exactMoney(value, setup.decimals)
                        : (value ?? "");
                  }),
                ]),
              ),
              "linkbooks-transaction-search.csv",
            );
          }}
        >
          Export current results
        </Button>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">
                  <input
                    type="checkbox"
                    aria-label="Select eligible correction lines"
                    disabled={
                      busy || !setup.can_apply || !result?.rows.some((r) => !r.blocked_reason)
                    }
                    checked={
                      Boolean(result?.rows.some((r) => !r.blocked_reason)) &&
                      Boolean(
                        result?.rows.filter((r) => !r.blocked_reason).every((r) => selection[r.id]),
                      )
                    }
                    onChange={(e) => {
                      setSelection(
                        e.target.checked
                          ? Object.fromEntries(
                              (result?.rows ?? [])
                                .filter((r) => !r.blocked_reason)
                                .slice(0, 100)
                                .map((r) => [r.id, r]),
                            )
                          : {},
                      );
                      clearReview();
                    }}
                  />
                </th>
                <th>Date / source</th>
                <th>Account</th>
                <th>Details</th>
                <th className="p-2 text-right">Amount</th>
                <th className="p-2">Availability</th>
              </tr>
            </thead>
            <tbody>
              {(result?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-b align-top">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={`Select journal ${r.journal_number} line ${r.id}`}
                      checked={Boolean(selection[r.id])}
                      disabled={
                        busy ||
                        !setup.can_apply ||
                        Boolean(r.blocked_reason) ||
                        (!selection[r.id] && rows.length >= 100)
                      }
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelection((previous) => {
                          const next = { ...previous };
                          if (checked) next[r.id] = r;
                          else delete next[r.id];
                          return next;
                        });
                        clearReview();
                      }}
                    />
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {r.journal_date}
                    <p>{sourceLabel(r.source_type)}</p>
                    <Link
                      className="underline"
                      to="/accounting"
                      search={{ tab: "journals", journal: r.journal_id }}
                    >
                      Journal #{r.journal_number}
                    </Link>
                    <p>{r.source_reference}</p>
                  </td>
                  <td className="p-2">
                    {r.account_code} · {r.account_name}
                  </td>
                  <td className="max-w-sm p-2 whitespace-pre-wrap break-words">
                    {r.description || r.memo || "—"}
                    {r.contact_name && <p className="text-muted-foreground">{r.contact_name}</p>}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    {r.currency}{" "}
                    {exactMoney(
                      BigInt(r.debit_minor) + BigInt(r.credit_minor),
                      r.currency_decimals,
                    )}{" "}
                    {BigInt(r.debit_minor) > 0n ? "Dr" : "Cr"}
                    {r.currency !== setup.currency && (
                      <p className="text-xs text-muted-foreground">
                        Base value: {money(r.base_gross_minor)}
                      </p>
                    )}
                  </td>
                  <td className="max-w-xs p-2 text-muted-foreground">
                    {r.blocked_reason ?? "Available — dates checked in preview"}
                  </td>
                </tr>
              ))}
              {!result?.rows.length && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    {result
                      ? "No posted lines match this search."
                      : "Search for transaction lines across the financial statements to begin."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {result && searched && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy || result.page === 0}
              onClick={() => void search(result.page - 1, searched)}
            >
              Previous lines
            </Button>
            <Button
              variant="outline"
              disabled={busy || !result.has_more}
              onClick={() => void search(result.page + 1, searched)}
            >
              Next lines
            </Button>
          </div>
        )}
      </div>
      <form
        className="space-y-4 rounded-xl border p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setSuccess("");
          clearReview();
          try {
            const input = correctionInput.parse({
              companyId,
              items: rows.map((r) => ({ id: r.id, fingerprint: r.fingerprint })),
              targetId: target,
              mode,
              date: mode === "original" ? null : date,
              reason,
            });
            const plan = await onPreview(input);
            setReview({
              plan,
              request: { input, requestKey: crypto.randomUUID(), previewHash: plan.preview_hash },
            });
          } catch (err) {
            setError(correctionError(err));
          }
        }}
      >
        <h3 className="font-semibold">2. Plan the account correction</h3>
        <fieldset disabled={busy || !setup.can_apply} className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Destination account
            <RecordLookupSelect
              aria-label="Correction destination account"
              className="block w-full rounded border bg-background p-2"
              required
              value={target}
              onValueChange={(e) => {
                setTarget(e);
                clearReview();
              }}
            >
              <option value="">Choose destination</option>
              {setup.accounts
                .filter((a) => a.eligible)
                .map((a) => (
                  <option
                    key={a.id}
                    value={a.id}
                    disabled={rows.some((r) => r.account_id === a.id)}
                  >
                    {a.code} · {a.name}
                  </option>
                ))}
            </RecordLookupSelect>
          </label>
          <label className="text-sm">
            Posting policy
            <select
              aria-label="Correction posting policy"
              className="block w-full rounded border bg-background p-2"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                clearReview();
              }}
            >
              <option value="original">Use each original posting date</option>
              <option value="adjustment">Use one open adjustment date</option>
            </select>
          </label>
          {mode === "adjustment" && (
            <label className="text-sm">
              Adjustment date
              <Input
                aria-label="Correction adjustment date"
                type="date"
                required
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  clearReview();
                }}
              />
            </label>
          )}
          <label className="text-sm md:col-span-3">
            Reason and supporting reference
            <Input
              aria-label="Correction reason"
              minLength={5}
              maxLength={1000}
              required
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                clearReview();
              }}
            />
          </label>
        </fieldset>
        {mode === "adjustment" && (
          <p className="text-sm font-medium">
            An adjustment date changes the accounts in that period. It does not restate earlier
            locked periods. The date must be on or after every selected transaction.
          </p>
        )}
        <Button
          type="submit"
          disabled={busy || !setup.can_apply || !rows.length || !target || reason.trim().length < 5}
        >
          Preview correction
        </Button>
      </form>
      {review && (
        <div className="space-y-4 rounded-xl border p-5">
          <h3 className="font-semibold">3. Review the exact posting plan</h3>
          <p className="text-sm">
            {review.plan.line_count} source lines · {review.plan.journal_count} balanced correction
            journals · {money(review.plan.gross_minor)} gross moved to {review.plan.target.code} ·{" "}
            {review.plan.target.name}
          </p>
          {review.plan.impact && (
            <div
              className="space-y-2 rounded border p-3 text-sm"
              aria-label="Financial statement impact"
            >
              <p className="font-medium">
                Profit change: {money(review.plan.impact.profit_change_minor)}
              </p>
              <p>
                {review.plan.impact.cross_statement_lines} lines move between profit and loss and
                balance sheet.
              </p>
              <ul>
                {review.plan.impact.account_changes.map((a) => (
                  <li key={a.id}>
                    {a.code} · {a.name} ({a.type}): {money(a.debit_change_minor)} net debit change
                  </li>
                ))}
              </ul>
              {!!review.plan.impact.cross_statement_lines && (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    aria-label="Acknowledge financial statement change"
                    disabled={busy}
                    checked={crossAck}
                    onChange={(e) => setCrossAck(e.target.checked)}
                  />
                  I reviewed the effect on profit, assets, liabilities and equity, including any
                  resulting tax review.
                </label>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th>Source journal</th>
                  <th>Source date</th>
                  <th>Posting date</th>
                  <th>From account</th>
                  <th>Amount moved</th>
                </tr>
              </thead>
              <tbody>
                {review.plan.rows.map((r) => (
                  <tr className="border-b" key={r.id}>
                    <td className="p-2">#{r.journal_number}</td>
                    <td className="p-2">{r.journal_date}</td>
                    <td className="p-2">{r.posting_date}</td>
                    <td className="p-2">
                      {r.source_account_code} · {r.source_account_name}
                    </td>
                    <td className="p-2">
                      {money(BigInt(r.debit_minor) + BigInt(r.credit_minor))}{" "}
                      {BigInt(r.debit_minor) > 0n ? "Dr" : "Cr"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm">
            For each source line, the journal offsets its original account and repeats the same
            debit or credit in the destination. The whole batch posts atomically and remains linked
            to its original lines.
          </p>
          <p className="text-sm">Reason: {review.plan.reason}</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              aria-label="Acknowledge correction posting"
              type="checkbox"
              disabled={busy}
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I reviewed the accounts, dates and reason. I understand this posts real general-ledger
            entries.
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !setup.can_export}
              onClick={() => exportPlan(review.plan)}
            >
              Download posting plan
            </Button>
            <Button
              disabled={
                busy ||
                !ack ||
                !setup.can_apply ||
                (!!review.plan.impact?.cross_statement_lines && !crossAck)
              }
              onClick={async () => {
                if (!window.confirm("Post this correction batch to the general ledger?")) return;
                setError("");
                try {
                  const batch = await onApply(review.request);
                  setSuccess(
                    `Correction ${batch.id} recorded (${batch.status}); ${batch.journal_ids.length} journal(s).`,
                  );
                  setSelection({});
                  setResult(null);
                  clearReview();
                } catch (err) {
                  setError(correctionError(err));
                }
              }}
            >
              Post correction batch
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A retry uses the same request reference. If a response is lost, check history or retry
            before creating a different correction.
          </p>
        </div>
      )}
      <div className="space-y-4 rounded-xl border p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Correction history & undo</h3>
          <Button variant="outline" disabled={busy || historyLoading} onClick={onHistoryRefresh}>
            Refresh correction history
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <p role="status" className="text-xs text-muted-foreground">
            Page {history.page + 1}: {historyCounts.applied} applied · {historyCounts.undone}{" "}
            undone · {historyCounts.needsReview} needing evidence review. These counts and filters
            cover the 50 loaded batches on this page only.
          </p>
          <label className="space-y-1 text-sm">
            Batch status
            <select
              aria-label="Correction history status"
              className="block h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={historyStatus}
              onChange={(event) =>
                setHistoryStatus(event.target.value as CorrectionHistoryFilter)
              }
            >
              {/* lookup-fixed-enum: Correction status is a fixed server-defined enumeration. */}
              <option value="all">All batches</option>
              <option value="applied">Applied</option>
              <option value="undone">Undone</option>
              <option value="needs_review">Missing evidence links</option>
            </select>
          </label>
          <Input
            aria-label="Search loaded correction history"
            className="h-9 w-60"
            placeholder="Batch, reference, account or reason"
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={busy || historyLoading || !setup.can_export || history.rows.length === 0}
            onClick={() =>
              download(
                correctionHistoryCsv(history.rows),
                `linkbooks-correction-batches-page-${history.page + 1}.csv`,
              )
            }
          >
            Export loaded history CSV
          </Button>
        </div>
        {historyError && (
          <p role="alert" className="text-destructive">
            {historyError}
          </p>
        )}
        {historyLoading ? (
          <p role="status">Loading correction history…</p>
        ) : history.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No correction batches on this page.</p>
        ) : filteredHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No loaded batches match this filter. Choose All batches or browse another page.
          </p>
        ) : (
          filteredHistory.map((b) => (
            <details key={b.id} className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm">
                <strong>{b.status === "undone" ? "Undone" : "Applied"}</strong> · {b.created_at} ·{" "}
                {b.plan.line_count} lines → {b.plan.target.code} · {b.reason}
              </summary>
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  Batch: {b.id} · Created by: {b.created_by}
                </p>
                {correctionEvidenceIssue(b) ? (
                  <p role="alert" className="text-sm text-destructive">
                    Evidence review required: {correctionEvidenceIssue(b)}. Check linked journals
                    and refresh history before any undo.
                  </p>
                ) : null}
                <p>
                  Posting dates: {[...new Set(b.plan.rows.map((r) => r.posting_date))].join(", ")}
                </p>
                <p>
                  Correction journals:{" "}
                  {b.journal_ids.map((id) => (
                    <Link
                      key={id}
                      className="mr-2 underline"
                      to="/accounting"
                      search={{ tab: "journals", journal: id }}
                    >
                      {id.slice(0, 8)}
                    </Link>
                  ))}
                </p>
                <ul className="space-y-1">
                  {b.plan.rows.map((r) => (
                    <li key={r.id}>
                      Source{" "}
                      <Link
                        to="/accounting"
                        search={{ tab: "journals", journal: r.journal_id }}
                        className="underline"
                      >
                        journal #{r.journal_number}
                      </Link>
                      , {r.source_account_code} → {b.plan.target.code},{" "}
                      {money(BigInt(r.debit_minor) + BigInt(r.credit_minor))}{" "}
                      {BigInt(r.debit_minor) > 0n ? "Dr" : "Cr"}, posting {r.posting_date}
                    </li>
                  ))}
                </ul>
                {b.status === "undone" && (
                  <>
                    <p>
                      Undo requested for {b.undo_date}: {b.undo_reason} · By {b.undone_by}
                    </p>
                    <p>
                      Undo journals:{" "}
                      {b.undo_journal_ids?.map((id) => (
                        <Link
                          key={id}
                          className="mr-2 underline"
                          to="/accounting"
                          search={{ tab: "journals", journal: id }}
                        >
                          {id.slice(0, 8)}
                        </Link>
                      ))}
                    </p>
                  </>
                )}
                <Button
                  variant="outline"
                  disabled={busy || !setup.can_export}
                  onClick={() => exportPlan(b.plan, b)}
                >
                  Export batch evidence
                </Button>
                {b.status === "applied" && (
                  <Button
                    variant="outline"
                    disabled={busy || !setup.can_apply}
                    onClick={() => {
                      setUndoBatch(b.id);
                      setUndoDate(
                        b.plan.rows.reduce(
                          (max, r) => (r.posting_date > max ? r.posting_date : max),
                          today,
                        ),
                      );
                      setUndoReason("");
                    }}
                  >
                    Prepare undo
                  </Button>
                )}
                {undoBatch === b.id && b.status === "applied" && (
                  <form
                    className="space-y-3 rounded border p-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        !window.confirm(
                          "Undo this batch with reversing journals? Existing exact reversals will be verified and reused at their actual dates.",
                        )
                      )
                        return;
                      setError("");
                      try {
                        const result = await onUndo({
                          batchId: b.id,
                          date: undoDate,
                          reason: undoReason,
                        });
                        setSuccess(
                          `Correction ${result.id} undone. Reversal journals are linked in history.`,
                        );
                        setUndoBatch("");
                        setSelection({});
                        setResult(null);
                        clearReview();
                      } catch (err) {
                        setError(correctionError(err));
                      }
                    }}
                  >
                    <p>
                      Undo posts missing reversals in an open period. Existing exact reversals
                      retain their actual dates. Original records and audit history remain
                      available. A source document can be reversed after its active correction is
                      undone.
                    </p>
                    <label className="block">
                      Undo posting date
                      <Input
                        aria-label="Correction undo date"
                        type="date"
                        required
                        disabled={busy}
                        value={undoDate}
                        onChange={(e) => setUndoDate(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      Undo reason
                      <Input
                        aria-label="Correction undo reason"
                        minLength={5}
                        maxLength={1000}
                        required
                        disabled={busy}
                        value={undoReason}
                        onChange={(e) => setUndoReason(e.target.value)}
                      />
                    </label>
                    <Button
                      type="submit"
                      disabled={busy || !setup.can_apply || undoReason.trim().length < 5}
                    >
                      Post undo journals
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setUndoBatch("")}
                    >
                      Cancel undo
                    </Button>
                  </form>
                )}
              </div>
            </details>
          ))
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={busy || historyLoading || history.page === 0}
            onClick={() => onHistoryPage(history.page - 1)}
          >
            Previous batches
          </Button>
          <span className="text-sm">History page {history.page + 1}</span>
          <Button
            variant="outline"
            disabled={busy || historyLoading || !history.has_more}
            onClick={() => onHistoryPage(history.page + 1)}
          >
            Next batches
          </Button>
        </div>
      </div>
    </section>
  );
}
