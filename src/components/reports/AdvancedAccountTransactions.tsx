import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Columns3, RotateCcw, Search, SlidersHorizontal, ArrowUp, ArrowDown } from "lucide-react";
import { ReportAccountMultiSelect } from "./ReportAccountMultiSelect";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFormat } from "@/hooks/use-format";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { csvMoney } from "@/lib/reports/csv";
import { getAccountTransactions } from "@/lib/reports/report.functions";
import { SOURCE_LABELS, sourceLabel } from "@/lib/reports/links";
import {
  DEFAULT_TRANSACTION_COLUMNS,
  TRANSACTION_COLUMNS,
  parseTransactionColumns,
  type TransactionColumn,
} from "@/lib/reports/account-transaction-options";
import {
  JournalLink,
  PagerBar,
  ReportPane,
  ReportShell,
  SourceLink,
  type ReportCtx,
} from "./ReportShell";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const moneyColumns = new Set<TransactionColumn>(["debit", "credit", "net", "balance"]);

export function AdvancedAccountTransactionsView({ ctx }: { ctx: ReportCtx }) {
  const fmt = useFormat();
  const fetchAccounts = useServerFn(listAccounts);
  const fetchTransactions = useServerFn(getAccountTransactions);
  const accountId = ctx.search.account ?? "";
  const page = Math.max(0, (ctx.search.page ?? 1) - 1);
  const pageSize = ctx.search.txnPageSize ?? 100;
  const columns = parseTransactionColumns(ctx.search.txnColumns);
  const source = ctx.search.txnSource ?? "";
  const flow = ctx.search.txnFlow ?? "all";
  const sort = ctx.search.txnSort ?? "date_asc";
  const query = ctx.search.txnQuery ?? "";
  const minAmount = ctx.search.txnMin ?? "";
  const maxAmount = ctx.search.txnMax ?? "";
  const [draftQuery, setDraftQuery] = useState(query);
  const [columnQuery, setColumnQuery] = useState("");

  useEffect(() => setDraftQuery(query), [query]);

  const accountsQ = useQuery({
    queryKey: ["accounts", ctx.companyId],
    queryFn: () => fetchAccounts({ data: { companyId: ctx.companyId } }),
  });
  const accounts = accountsQ.data ?? [];
  const reportQ = useQuery({
    queryKey: [
      "report-acct-txn",
      ctx.companyId,
      accountId,
      ctx.search.basis,
      ctx.from,
      ctx.to,
      page,
      pageSize,
      source,
      flow,
      sort,
      query,
      minAmount,
      maxAmount,
    ],
    enabled: Boolean(accountId),
    queryFn: () =>
      fetchTransactions({
        data: {
          companyId: ctx.companyId,
          accountId,
          ...(ctx.search.basis ? { basis: ctx.search.basis } : {}),
          from: ctx.from,
          to: ctx.to,
          page,
          pageSize,
          source,
          flow,
          sort,
          query,
          minAmount,
          maxAmount,
        },
      }),
  });
  const data = reportQ.data;

  const changeColumns = (next: TransactionColumn[]) => {
    if (next.length === 0) return;
    const encoded = next.join(",");
    ctx.setSearch({
      txnColumns: encoded === DEFAULT_TRANSACTION_COLUMNS.join(",") ? undefined : encoded,
    });
  };
  const toggleColumn = (id: TransactionColumn) => {
    if (columns.includes(id)) {
      if (columns.length > 1) changeColumns(columns.filter((value) => value !== id));
    } else {
      changeColumns([...columns, id]);
    }
  };
  const moveColumn = (id: TransactionColumn, direction: -1 | 1) => {
    const index = columns.indexOf(id);
    if (index < 0 || index + direction < 0 || index + direction >= columns.length) return;
    const next = [...columns];
    const moved = next.splice(index, 1)[0];
    if (moved) {
      next.splice(index + direction, 0, moved);
      changeColumns(next);
    }
  };
  const resetFilters = () => {
    setDraftQuery("");
    ctx.setSearch({
      txnQuery: undefined,
      txnSource: undefined,
      txnFlow: undefined,
      txnSort: undefined,
      txnMin: undefined,
      txnMax: undefined,
      page: undefined,
    });
  };
  const applySearch = () =>
    ctx.setSearch({ txnQuery: draftQuery.trim() || undefined, page: undefined });
  const hasFilters = Boolean(
    query || source || minAmount || maxAmount || flow !== "all" || sort !== "date_asc",
  );

  return (
    <ReportShell
      title="Account Transactions"
      ctx={ctx}
      mode="range"
      allowExplorer={false}
      basis={`${ctx.search.basis === "cash" ? "Cash basis · Recognized settlements and direct cash movements" : "Accrual basis · Posted ledger"} · Amounts in base currency · Running balances retain ledger order`}
      extraControls={
        <>
          <div className="space-y-1">
            <Label htmlFor="advanced-account-basis">Accounting method</Label>
            <select
              id="advanced-account-basis"
              className={selectClass}
              value="accrual"
              onChange={(event) =>
                ctx.setSearch({
                  basis: event.target.value === "cash" ? "cash" : undefined,
                  page: undefined,
                  explorePage: undefined,
                })
              }
            >
              <option value="accrual">Accrual (posted ledger)</option>
              <option value="cash">Cash (recognized settlements)</option>
            </select>
          </div>
          {accountsQ.isError ? (
            <QueryErrorState queries={[accountsQ]} title="Could not load report accounts" />
          ) : null}
          <ReportAccountMultiSelect
            accounts={accounts}
            selected={accountId ? [accountId] : undefined}
            onChange={(ids) =>
              ctx.setSearch({
                account: ids?.length === 1 ? ids[0] : undefined,
                accountIds: ids && ids.length > 1 ? ids.join(",") : undefined,
                page: undefined,
              })
            }
            disabled={accountsQ.isPending || accountsQ.isError}
          />
        </>
      }
      getCsv={() => {
        if (!data) return null;
        const csvCell = (
          column: TransactionColumn,
          row: (typeof data.rows)[number],
        ): string | number => {
          switch (column) {
            case "date":
              return row.journal_date;
            case "accountCode":
              return data.account.code;
            case "accountName":
              return data.account.name;
            case "journal":
              return row.journal_number;
            case "journalId":
              return row.journal_id;
            case "lineId":
              return row.line_id;
            case "lineNo":
              return row.line_no;
            case "source":
              return sourceLabel(row.source_type);
            case "sourceId":
              return row.source_id ?? "";
            case "memo":
              return row.memo ?? row.description ?? "";
            case "description":
              return row.description ?? "";
            case "debit":
              return csvMoney(row.debit_minor, ctx.currency);
            case "credit":
              return csvMoney(row.credit_minor, ctx.currency);
            case "net":
              return csvMoney(row.debit_minor - row.credit_minor, ctx.currency);
            case "balance":
              return csvMoney(row.running_balance_minor, ctx.currency);
            case "currency":
              return ctx.currency;
            case "transactionCurrency":
              return row.currency_code;
            case "fxRate":
              return row.fx_rate_to_base == null ? "" : String(row.fx_rate_to_base);
            case "postedAt":
              return row.posted_at ?? "";
            case "postedBy":
              return row.posted_by ?? "";
            case "createdBy":
              return row.created_by ?? "";
            case "status":
              return "Posted";
          }
        };
        return {
          headers: columns.map(
            (id) => TRANSACTION_COLUMNS.find((column) => column.id === id)?.label ?? id,
          ),
          rows: [
            columns.map((id) =>
              id === "memo" || id === "description"
                ? "Opening balance"
                : id === "balance"
                  ? csvMoney(data.opening_balance_minor, ctx.currency)
                  : "",
            ),
            ...data.rows.map((row) => columns.map((id) => csvCell(id, row))),
          ],
          basis: `${ctx.search.basis === "cash" ? "Cash" : "Accrual"} basis · Loaded page ${data.page + 1}: ${data.rows.length} of ${data.total_count} matching posted lines; opening and closing balances are for the full account, before filters.`,
        };
      }}
    >
      {!accountId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <SlidersHorizontal className="size-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Choose an account to explore</h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              Inspect posted transactions with configurable columns, source and direction filters,
              search, sorting, journal drill-down and reusable saved layouts. You can also open this
              workspace directly from a financial statement.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <section
            aria-label="Account transaction filters"
            className="rounded-xl border bg-card p-4 shadow-xs print:hidden"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Transaction explorer</h2>
                <p className="text-xs text-muted-foreground">
                  Filter posted ledger lines; balances always reflect every posted movement.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Columns3 className="size-4" aria-hidden="true" />
                      Columns ({columns.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Choose & order columns</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => changeColumns([...DEFAULT_TRANSACTION_COLUMNS])}
                      >
                        Reset
                      </Button>
                    </div>
                    <Input
                      aria-label="Search available columns"
                      placeholder="Find a column…"
                      value={columnQuery}
                      onChange={(event) => setColumnQuery(event.target.value)}
                      className="mb-2"
                    />
                    <div className="max-h-80 space-y-1 overflow-y-auto">
                      {[
                        ...columns.map((id) =>
                          TRANSACTION_COLUMNS.find((column) => column.id === id)!,
                        ),
                        ...TRANSACTION_COLUMNS.filter((column) => !columns.includes(column.id)),
                      ]
                        .filter((column) =>
                          column.label.toLowerCase().includes(columnQuery.toLowerCase()),
                        )
                        .map((column) => {
                          const selected = columns.includes(column.id);
                          const index = columns.indexOf(column.id);
                          return (
                            <div
                              key={column.id}
                              className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50"
                            >
                              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={selected && columns.length === 1}
                                  onChange={() => toggleColumn(column.id)}
                                  className="size-4 accent-primary"
                                />
                                <span className="truncate">{column.label}</span>
                              </label>
                              {selected && (
                                <div className="flex shrink-0 items-center">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    aria-label={`Move ${column.label} left`}
                                    disabled={index === 0}
                                    onClick={() => moveColumn(column.id, -1)}
                                  >
                                    <ArrowUp className="size-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    aria-label={`Move ${column.label} right`}
                                    disabled={index === columns.length - 1}
                                    onClick={() => moveColumn(column.id, 1)}
                                  >
                                    <ArrowDown className="size-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Your selection also controls PDF, Excel and CSV downloads. Use “Save this
                      view” to reuse it.
                    </p>
                  </PopoverContent>
                </Popover>
                <Button size="sm" variant="ghost" onClick={resetFilters} disabled={!hasFilters}>
                  <RotateCcw className="size-4" aria-hidden="true" /> Clear filters
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-1 xl:col-span-2">
                <Label htmlFor="transaction-search">
                  Search memo, description, journal or source
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="transaction-search"
                    type="search"
                    value={draftQuery}
                    maxLength={120}
                    placeholder="Find posted entries…"
                    onChange={(event) => setDraftQuery(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && applySearch()}
                  />
                  <Button variant="secondary" size="sm" onClick={applySearch}>
                    <Search className="size-4" aria-hidden="true" /> Apply
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="txn-source">Transaction type</Label>
                <select
                  id="txn-source"
                  className={selectClass}
                  value={source}
                  onChange={(event) =>
                    ctx.setSearch({ txnSource: event.target.value || undefined, page: undefined })
                  }
                >
                  <option value="">All types</option>
                  {/* lookup-fixed-enum: Known journal source types, not selectable business records. */}
                  {Object.entries(SOURCE_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="txn-flow">Entry direction</Label>
                <select
                  id="txn-flow"
                  className={selectClass}
                  value={flow}
                  onChange={(event) =>
                    ctx.setSearch({
                      txnFlow: event.target.value === "all" ? undefined : event.target.value,
                      page: undefined,
                    })
                  }
                >
                  <option value="all">Debits and credits</option>
                  <option value="debit">Debits only</option>
                  <option value="credit">Credits only</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="txn-sort">Sort entries</Label>
                <select
                  id="txn-sort"
                  className={selectClass}
                  value={sort}
                  onChange={(event) =>
                    ctx.setSearch({
                      txnSort: event.target.value === "date_asc" ? undefined : event.target.value,
                      page: undefined,
                    })
                  }
                >
                  <option value="date_asc">Oldest first</option>
                  <option value="date_desc">Newest first</option>
                  <option value="amount_desc">Largest movement</option>
                  <option value="amount_asc">Smallest movement</option>
                </select>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-1">
                <Label htmlFor="txn-min">Minimum absolute movement ({ctx.currency})</Label>
                <Input
                  key={`txn-min-${minAmount}`}
                  id="txn-min"
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={minAmount}
                  placeholder="No minimum"
                  onBlur={(event) =>
                    ctx.setSearch({ txnMin: event.target.value || undefined, page: undefined })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="txn-max">Maximum absolute movement ({ctx.currency})</Label>
                <Input
                  key={`txn-max-${maxAmount}`}
                  id="txn-max"
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={maxAmount}
                  placeholder="No maximum"
                  onBlur={(event) =>
                    ctx.setSearch({ txnMax: event.target.value || undefined, page: undefined })
                  }
                />
              </div>
              <p className="self-end pb-2 text-xs text-muted-foreground sm:col-span-2 xl:col-span-3">
                Inclusive movement range; values are in base currency and exclude no opening
                balance. Entries are filtered before pagination, while running balances still
                include every posted line.
              </p>
            </div>
          </section>

          <ReportPane
            query={reportQ}
            isEmpty={
              Boolean(data) &&
              data!.total_count === 0 &&
              data!.opening_balance_minor === 0 &&
              !hasFilters
            }
            emptyTitle="No movements"
            emptyDescription="No posted lines for this account in the selected range."
          >
            {data && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Card>
                    <CardContent className="space-y-1 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Opening balance
                      </p>
                      <p className="text-xl font-semibold tabular-nums">
                        {fmt.amount(data.opening_balance_minor, ctx.currency)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Closing balance
                      </p>
                      <p className="text-xl font-semibold tabular-nums">
                        {fmt.amount(data.closing_balance_minor, ctx.currency)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Matching posted lines
                      </p>
                      <p className="text-xl font-semibold tabular-nums">
                        {data.total_count.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {hasFilters ? "After filters" : "In selected date range"}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                    <div>
                      <h3 className="font-semibold">
                        {data.account.code} · {data.account.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Running balance on the account's {data.account.normalBalance} side
                        {hasFilters ? " · Filters do not change posted balances" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 print:hidden">
                      {hasFilters && <Badge variant="secondary">Filtered</Badge>}
                      <Label htmlFor="txn-page-size" className="whitespace-nowrap text-xs">
                        Rows per page
                      </Label>
                      <select
                        id="txn-page-size"
                        className={selectClass}
                        value={pageSize}
                        onChange={(event) =>
                          ctx.setSearch({
                            txnPageSize: Number(event.target.value),
                            page: undefined,
                          })
                        }
                      >
                        {/* lookup-fixed-enum: Fixed page-size choices. */}
                        {[25, 50, 100, 200].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div
                    className="max-w-full overflow-x-auto"
                    role="region"
                    tabIndex={0}
                    aria-label="Account transactions table"
                  >
                    <Table className="min-w-full whitespace-nowrap text-sm">
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          {columns.map((id) => (
                            <TableHead
                              key={id}
                              className={moneyColumns.has(id) ? "text-right" : ""}
                            >
                              {TRANSACTION_COLUMNS.find((column) => column.id === id)?.label ?? id}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.rows.map((row) => (
                          <TableRow key={row.line_id} className="hover:bg-muted/30">
                            {columns.map((id) => {
                              let cell: ReactNode;
                              switch (id) {
                                case "date":
                                  cell = fmt.date(row.journal_date);
                                  break;
                                case "accountCode":
                                  cell = data.account.code;
                                  break;
                                case "accountName":
                                  cell = data.account.name;
                                  break;
                                case "journal":
                                  cell = (
                                    <JournalLink
                                      journalId={row.journal_id}
                                      number={row.journal_number}
                                    />
                                  );
                                  break;
                                case "journalId":
                                  cell = row.journal_id;
                                  break;
                                case "lineId":
                                  cell = row.line_id;
                                  break;
                                case "lineNo":
                                  cell = row.line_no;
                                  break;
                                case "source":
                                  cell = <SourceLink type={row.source_type} id={row.source_id} />;
                                  break;
                                case "sourceId":
                                  cell = row.source_id ?? "—";
                                  break;
                                case "memo":
                                  cell = row.memo ?? row.description ?? "—";
                                  break;
                                case "description":
                                  cell = row.description ?? "—";
                                  break;
                                case "debit":
                                  cell = fmt.amount(row.debit_minor, ctx.currency);
                                  break;
                                case "credit":
                                  cell = fmt.amount(row.credit_minor, ctx.currency);
                                  break;
                                case "net":
                                  cell = fmt.amount(
                                    row.debit_minor - row.credit_minor,
                                    ctx.currency,
                                  );
                                  break;
                                case "balance":
                                  cell = fmt.amount(row.running_balance_minor, ctx.currency);
                                  break;
                                case "currency":
                                  cell = ctx.currency;
                                  break;
                                case "transactionCurrency":
                                  cell = row.currency_code;
                                  break;
                                case "fxRate":
                                  cell =
                                    row.fx_rate_to_base == null ? "—" : String(row.fx_rate_to_base);
                                  break;
                                case "postedAt":
                                  cell = row.posted_at ? fmt.dateTime(row.posted_at) : "—";
                                  break;
                                case "postedBy":
                                  cell = row.posted_by ?? "—";
                                  break;
                                case "createdBy":
                                  cell = row.created_by ?? "—";
                                  break;
                                case "status":
                                  cell = <Badge variant="secondary">Posted</Badge>;
                                  break;
                              }
                              return (
                                <TableCell
                                  key={id}
                                  className={
                                    moneyColumns.has(id)
                                      ? "text-right tabular-nums"
                                      : "max-w-80 truncate"
                                  }
                                  title={typeof cell === "string" ? cell : undefined}
                                >
                                  {cell}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                        {data.rows.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={columns.length}
                              className="py-10 text-center text-muted-foreground"
                            >
                              No posted entries match these filters. Change the filters or select
                              another period.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="border-t px-4 pb-3">
                    <PagerBar
                      page={data.page}
                      pageSize={data.pageSize}
                      total={data.total_count}
                      onPage={(next) => ctx.setSearch({ page: next === 0 ? undefined : next + 1 })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Exports include the selected columns and currently loaded page, not the entire
                  account history. Opening and closing balances always include all posted
                  transactions in the period. Save this view to retain filters, column order and
                  page size.
                </p>
              </div>
            )}
          </ReportPane>
        </div>
      )}
    </ReportShell>
  );
}
