"use client";

import { Fragment, useEffect, useState } from "react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  parseJournalBrowseSearch,
  type JournalBrowseSearch,
} from "@/lib/accounting/journal-browsing";
import { JournalQualityReviewPanel } from "@/components/accountant/JournalQualityReviewPanel";
import { BulkJournalImportPanel } from "@/components/accountant/BulkJournalImportPanel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  getJournalDetail,
  listJournals,
  reversePostedJournal,
  type JournalListItem,
  type JournalDetail,
} from "@/lib/accounting/accounting.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { toCsv } from "@/lib/sales/csv";
import { roleHasPermission } from "@/lib/permissions";
import { useFormat } from "@/hooks/use-format";
import { SortableHead } from "@/components/common/sortable-head";
import { nextSort, sortRows, type SortState } from "@/lib/sort";
import { journalPageInfo } from "@/lib/accounting/journal-paging";
import { reviewJournalLines } from "@/lib/accounting/journal-line-review";
import { JournalPostedGlEvidence } from "@/components/accounting/JournalPostedGlEvidence";
import { PayrollAccrualGlAudit } from "@/components/accounting/PayrollAccrualGlAudit";
import { PayrollPaymentGlAudit } from "@/components/accounting/PayrollPaymentGlAudit";
import {
  JOURNAL_SOURCE_LABELS,
  journalSourceLabel,
  journalLineCurrency,
} from "@/lib/accounting/journal-display";
import { Link } from "@tanstack/react-router";
import { useActiveCompany } from "@/hooks/use-active-company";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Journal row/line consistency only. Does not claim a complete GL reconciliation
 * or independent source-document verification.
 */
function JournalLineReviewNotice({
  journal,
  detail,
}: {
  journal: JournalListItem;
  detail: JournalDetail;
}) {
  const fmt = useFormat();
  const review = reviewJournalLines(journal, detail);
  const currency = detail.currency_code;
  return (
    <div
      className={`rounded-md border p-3 space-y-1 ${
        review.state === "exception"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-muted/40"
      }`}
    >
      <p role={review.state === "exception" ? "alert" : "status"} className="text-sm font-semibold">
        {review.state === "balanced"
          ? "Journal line check passed"
          : review.state === "not_posted"
            ? "Not reviewed — journal is not posted"
            : "Journal line check found exceptions"}
      </p>
      {review.debitMinor !== null && review.creditMinor !== null ? (
        <p className="text-xs tabular-nums text-muted-foreground">
          Debit: {fmt.amount(review.debitMinor, currency)} · Credit:{" "}
          {fmt.amount(review.creditMinor, currency)}
        </p>
      ) : null}
      {review.issues.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
          {review.issues.map((issue, index) => (
            <li key={index}>{issue}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Checks the loaded journal lines against the journal list. Not an independent general ledger,
        source-document, or foreign-exchange valuation audit.
      </p>
    </div>
  );
}

/** Only hand-made journals are reversed here. Documents are voided from their own page so the subledger stays in step. */
function canReverseHere(journal: JournalListItem): boolean {
  return (
    journal.status === "posted" &&
    !journal.reversed_by_journal_id &&
    (journal.source_type === "manual" || journal.source_type === "opening_balance")
  );
}

const journalRoute = getRouteApi("/_authenticated/accounting");

export function JournalsPanel({
  companyId,
  currency,
  initialOpenJournalId,
}: {
  companyId: string;
  currency: string;
  /** Opens this journal's lines on load (deep link from reports and search). */
  initialOpenJournalId?: string | undefined;
}) {
  const { company } = useActiveCompany();
  const fmt = useFormat();
  const qc = useQueryClient();
  const fetchJournals = useServerFn(listJournals);
  const fetchDetail = useServerFn(getJournalDetail);
  const reverse = useServerFn(reversePostedJournal);
  const canReverse =
    company?.permissions?.includes("journals.manual") ??
    roleHasPermission(company?.role ?? "read_only", "journals.manual");
  const canViewPayroll =
    company?.permissions?.includes("payroll.view") ??
    roleHasPermission(company?.role ?? "read_only", "payroll.view");

  const routeSearch = journalRoute.useSearch();
  const navigate = useNavigate();
  const search = routeSearch.journalQ ?? "";
  const source = routeSearch.journalSource ?? "";
  const from = routeSearch.journalFrom ?? "";
  const to = routeSearch.journalTo ?? "";
  const pageSize = routeSearch.journalPageSize ?? 100;
  const page = routeSearch.journalPage ?? 0;
  type JournalSortKey = "number" | "date" | "source" | "amount";
  const sort: SortState<JournalSortKey> | null = routeSearch.journalSort
    ? { key: routeSearch.journalSort, dir: routeSearch.journalDir ?? "asc" }
    : null;
  const patchJournalBrowse = (patch: Partial<JournalBrowseSearch>, replace = false) => {
    void navigate({
      to: "/accounting",
      search: (previous) => ({
        ...previous,
        ...parseJournalBrowseSearch({ ...previous, ...patch }),
        // Reset cleared filters rather than reviving them from previous URL state.
        ...patch,
        tab: "journals" as const,
      }),
      replace,
      resetScroll: false,
    });
  };
  const setPage = (next: number | ((current: number) => number)) =>
    patchJournalBrowse({ journalPage: typeof next === "function" ? next(page) : next });
  const setPageSize = (value: number) =>
    patchJournalBrowse({
      journalPageSize: value as JournalBrowseSearch["journalPageSize"],
      journalPage: 0,
    });
  const setSort = (
    next: (current: SortState<JournalSortKey> | null) => SortState<JournalSortKey>,
  ) => {
    const chosen = next(sort);
    patchJournalBrowse({ journalSort: chosen.key, journalDir: chosen.dir });
  };
  const setSearch = (value: string) =>
    patchJournalBrowse({ journalQ: value, journalPage: 0 }, true);
  const setSource = (value: string) => patchJournalBrowse({ journalSource: value, journalPage: 0 });
  const setFrom = (value: string) => patchJournalBrowse({ journalFrom: value, journalPage: 0 });
  const setTo = (value: string) => patchJournalBrowse({ journalTo: value, journalPage: 0 });
  const [open, setOpen] = useState<string | null>(initialOpenJournalId ?? null);
  const invalidDateRange = Boolean(from && to && from > to);

  useEffect(() => {
    if (initialOpenJournalId) setOpen(initialOpenJournalId);
  }, [initialOpenJournalId]);

  const query = useQuery({
    queryKey: ["journals", companyId, search, source, from, to, pageSize, page],
    enabled: !invalidDateRange,
    queryFn: () =>
      fetchJournals({
        data: {
          companyId,
          limit: pageSize + 1,
          offset: page * pageSize,
          ...(search ? { search } : {}),
          ...(source ? { source } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      }),
  });

  const detail = useQuery({
    queryKey: ["journal-detail", companyId, open],
    enabled: Boolean(open),
    queryFn: () => fetchDetail({ data: { companyId, journalId: open! } }),
  });

  const reverseM = useMutation({
    mutationFn: (journalId: string) => reverse({ data: { companyId, journalId } }),
    onSuccess: async () => {
      toast.success("Reversing journal posted");
      await qc.invalidateQueries({ queryKey: ["journals", companyId] });
      await qc.invalidateQueries({ queryKey: ["journal-detail", companyId] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const fetched = query.data ?? [];
  const pageInfo = journalPageInfo(fetched.length, pageSize, page);
  const displayed = fetched.slice(0, pageSize);
  const rows = !sort
    ? displayed
    : sortRows(
        displayed,
        (j) =>
          sort.key === "number"
            ? j.journal_number
            : sort.key === "date"
              ? j.journal_date
              : sort.key === "source"
                ? journalSourceLabel(j.source_type)
                : j.total_debit_minor,
        sort.dir,
      );
  const exportVisibleJournals = () => {
    const csv = toCsv(
      [
        "Journal number",
        "Date",
        "Source",
        "Narration",
        "Total debit (journal minor units)",
        "Currency code",
        "Status",
        "Reversed",
      ],
      rows.map((row) => [
        row.journal_number,
        row.journal_date,
        row.source_type,
        row.memo,
        row.total_debit_minor,
        row.currency_code,
        row.status,
        row.reversed_by_journal_id ? "Yes" : "No",
      ]),
    );
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "linkbooks-journals-visible.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const headProps = (key: "number" | "date" | "source" | "amount") => ({
    active: sort?.key === key,
    dir: sort?.dir ?? ("asc" as const),
    onSort: () => setSort((cur) => nextSort(cur, key)),
  });

  return (
    <div className="space-y-4">
      <JournalQualityReviewPanel companyId={companyId} />
      <BulkJournalImportPanel companyId={companyId} currency={currency} />
      <div className="flex flex-wrap items-end gap-2">
        <Input
          aria-label="Search journals"
          className="h-9 w-56"
          placeholder="Search number or narration"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Journal source"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

          <option value="">All sources</option>
          {Object.entries(JOURNAL_SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Input
          aria-label="From date"
          type="date"
          className="h-9 w-40"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          aria-label="To date"
          type="date"
          className="h-9 w-40"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        {search || source || from || to ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              patchJournalBrowse({
                journalQ: undefined,
                journalSource: undefined,
                journalFrom: undefined,
                journalTo: undefined,
                journalPage: 0,
              })
            }
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" asChild>
          <Link to="/accounting/journals/new" search={{ mode: "post" }}>
            New manual journal
          </Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={invalidDateRange || query.isPending || query.isError || rows.length === 0}
          onClick={exportVisibleJournals}
        >
          Export displayed journals CSV
        </Button>
        <span className="text-xs text-muted-foreground">
          Export contains the displayed page only. Amounts use each journal\'s own currency; amount
          sorting is not FX-converted.
        </span>
      </div>

      {invalidDateRange ? (
        <p role="alert" className="text-sm text-destructive">
          The From date must be on or before the To date. Change the dates to review journals.
        </p>
      ) : query.isPending ? (
        <LoadingState />
      ) : query.isError && query.data === undefined ? (
        <QueryErrorState queries={[query]} title="Could not load journals" />
      ) : rows.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            title="No journals found"
            description={
              page > 0
                ? "No journals remain on this page. Return to the previous page."
                : "Change the filters, or post a manual journal."
            }
            action={
              page > 0 ? undefined : (
                <Button size="sm" asChild>
                  <Link to="/accounting/journals/new" search={{ mode: "post" }}>
                    New manual journal
                  </Link>
                </Button>
              )
            }
          />
          {page > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setPage((value) => value - 1)}>
              Previous page
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <SortableHead label="#" {...headProps("number")} />
                <SortableHead label="Date" {...headProps("date")} />
                <SortableHead label="Source" {...headProps("source")} />
                <TableHead>Narration</TableHead>
                <SortableHead
                  label="Amount (journal currency)"
                  align="right"
                  {...headProps("amount")}
                />
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((j) => {
                const expanded = open === j.id;
                const lineCurrency = journalLineCurrency(
                  detail.data?.currency_code,
                  j.currency_code,
                  currency,
                );
                return (
                  <Fragment key={j.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setOpen(expanded ? null : j.id)}
                    >
                      <TableCell>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "Show"} lines of journal ${j.journal_number}`}
                          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(expanded ? null : j.id);
                          }}
                        >
                          {expanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>{j.journal_number}</TableCell>
                      <TableCell>{fmt.date(j.journal_date)}</TableCell>
                      <TableCell>{journalSourceLabel(j.source_type)}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{j.memo ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(j.total_debit_minor, j.currency_code || currency)}
                      </TableCell>
                      <TableCell className="space-x-1">
                        <StatusBadge status={j.status} />
                        {j.reversed_by_journal_id ? <StatusBadge status="reversed" /> : null}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {canReverse && canReverseHere(j) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reverseM.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `Reverse journal ${j.journal_number}? A new journal will post the opposite entries.`,
                                )
                              ) {
                                reverseM.mutate(j.id);
                              }
                            }}
                          >
                            Reverse
                          </Button>
                        ) : j.status === "posted" &&
                          !j.reversed_by_journal_id &&
                          j.source_type !== "reversal" ? (
                          <span className="text-xs text-muted-foreground">
                            Void the source document
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                    {expanded ? (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={7}>
                          {detail.isPending ? (
                            <p className="py-2 text-sm text-muted-foreground">Loading lines…</p>
                          ) : detail.isError ? (
                            <p className="py-2 text-sm text-destructive">
                              {friendlyAuthError(detail.error)}
                            </p>
                          ) : detail.data ? (
                            <div className="space-y-3">
                              <JournalLineReviewNotice journal={j} detail={detail.data} />
                              <JournalPostedGlEvidence
                                companyId={companyId}
                                journalId={j.id}
                                status={j.status}
                              />
                              {canViewPayroll &&
                              j.status === "posted" &&
                              !j.reversed_by_journal_id &&
                              j.source_type === "payroll" &&
                              j.source_id &&
                              j.idempotency_key === "payroll-run:" + j.source_id + ":accrual" ? (
                                <PayrollAccrualGlAudit
                                  companyId={companyId}
                                  runId={j.source_id}
                                  journalId={j.id}
                                />
                              ) : null}
                              {canViewPayroll &&
                              j.status === "posted" &&
                              j.source_type === "payroll" &&
                              j.source_id &&
                              j.idempotency_key?.endsWith(":post") ? (
                                <PayrollPaymentGlAudit
                                  companyId={companyId}
                                  paymentId={j.source_id}
                                  journalId={j.id}
                                />
                              ) : null}
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Account</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">
                                      Debit ({lineCurrency})
                                    </TableHead>
                                    <TableHead className="text-right">
                                      Credit ({lineCurrency})
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {detail.data.lines.map((line) => (
                                    <TableRow key={line.id}>
                                      <TableCell>
                                        {line.account_code} {line.account_name}
                                      </TableCell>
                                      <TableCell>{line.description ?? "—"}</TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {line.debit_minor
                                          ? fmt.amount(line.debit_minor, lineCurrency)
                                          : ""}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {line.credit_minor
                                          ? fmt.amount(line.credit_minor, lineCurrency)
                                          : ""}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <p role="alert" className="text-sm text-destructive">
                              Journal detail is unavailable. Refresh the journal list and try again.
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 py-2">
            <p role="status" className="text-xs text-muted-foreground">
              Showing journals {pageInfo.first}–{pageInfo.last} · Page {page + 1}
              {pageInfo.hasNext ? " · More journals available" : " · End of results"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="journal-page-size" className="text-xs text-muted-foreground">
                Rows per page
              </label>
              <select
                id="journal-page-size"
                value={pageSize}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setOpen(null);
                }}
              >
                {/* lookup-fixed-enum: Short presentation enumeration, not business records. */}
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={query.isFetching || page === 0}
                onClick={() => {
                  setPage((current) => Math.max(0, current - 1));
                  setOpen(null);
                }}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={query.isFetching || !pageInfo.hasNext}
                onClick={() => {
                  setPage((current) => current + 1);
                  setOpen(null);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
