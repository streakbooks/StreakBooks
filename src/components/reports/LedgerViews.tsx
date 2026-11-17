import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useFormat } from "@/hooks/use-format";
import { csvMoney } from "@/lib/reports/csv";
import {
  getAgedReceivables,
  getAuditFilterOptions,
  getAuditReport,
  getGeneralLedgerAll,
  getJournalReport,
  getTaxReport,
} from "@/lib/reports/report.functions";
import { getAgedReceivablesAsAt } from "@/lib/sales/ar-reports.functions";
import { getAgedPayablesAsAt } from "@/lib/purchases/ap-reports.functions";
import { getCashGeneralLedgerAll } from "@/lib/reports/cash-general-ledger.functions";
import { SOURCE_LABELS, sourceLabel } from "@/lib/reports/links";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LookupSelect } from "@/components/lookup";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdvancedAccountTransactionsView } from "./AdvancedAccountTransactions";
import { ReportAccountMultiSelect } from "./ReportAccountMultiSelect";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import {
  JournalLink,
  PagerBar,
  ReportPane,
  ReportShell,
  SourceLink,
  Stat,
  type ReportCtx,
} from "./ReportShell";

const selectCls = "flex h-10 rounded-md border border-input bg-background px-3 text-sm";

/* ---------------- Account transactions (advanced posted-ledger explorer) ---------------- */

export function AccountTransactionsView({ ctx }: { ctx: ReportCtx }) {
  // A single-account drill-down retains the full posted-line metadata explorer.
  // The catalogue entry defaults to a multi-account report instead of a required selector.
  return ctx.search.account && ctx.search.basis !== "cash" ? (
    <AdvancedAccountTransactionsView ctx={ctx} />
  ) : (
    <GeneralLedgerAllView ctx={ctx} />
  );
}

/* ---------------- General ledger, all accounts ---------------- */

export function GeneralLedgerAllView({ ctx }: { ctx: ReportCtx }) {
  const fmt = useFormat();
  const fetchGl = useServerFn(getGeneralLedgerAll);
  const fetchCashGl = useServerFn(getCashGeneralLedgerAll);
  const fetchAccounts = useServerFn(listAccounts);
  const cashBasis = ctx.search.basis === "cash";
  const accountIds = ctx.search.accountIds ?? (cashBasis ? ctx.search.account : undefined);
  const accountScope = ctx.search.accountScope ?? "balance";
  const accountGroup = ctx.search.accountGroup ?? "code";
  const page = Math.max(0, (ctx.search.page ?? 1) - 1);
  const pageSize = ctx.search.txnPageSize ?? 100;
  const accountsQ = useQuery({
    queryKey: ["report-account-options", ctx.companyId],
    queryFn: () => fetchAccounts({ data: { companyId: ctx.companyId } }),
  });
  const accrualQ = useQuery({
    enabled: !cashBasis,
    queryKey: [
      "report-gl-all",
      ctx.companyId,
      ctx.from,
      ctx.to,
      accountIds,
      accountScope,
      ctx.search.basis,
    ],
    queryFn: () =>
      fetchGl({
        data: {
          companyId: ctx.companyId,
          from: ctx.from,
          to: ctx.to,
          ...(accountIds ? { accountIds } : {}),
          accountScope,
          ...(ctx.search.basis ? { basis: ctx.search.basis } : {}),
        },
      }),
  });
  const cashQ = useQuery({
    queryKey: [
      "report-cash-gl-all",
      ctx.companyId,
      ctx.from,
      ctx.to,
      accountIds,
      accountScope,
      accountGroup,
      page,
      pageSize,
    ],
    enabled: cashBasis,
    queryFn: () =>
      fetchCashGl({
        data: {
          companyId: ctx.companyId,
          from: ctx.from,
          to: ctx.to,
          ...(accountIds ? { accountIds } : {}),
          accountScope,
          accountGroup,
          page,
          pageSize,
        },
      }),
  });
  const q = cashBasis ? cashQ : accrualQ;
  const d = q.data;
  // Reorder account groups only; never recalculate transaction running balances.
  const orderedAccounts = [...(d?.accounts ?? [])].sort((a, b) => {
    if (accountGroup === "name")
      return (
        a.account.name.localeCompare(b.account.name) || a.account.code.localeCompare(b.account.code)
      );
    if (accountGroup === "type")
      return (
        a.account.account_type.localeCompare(b.account.account_type) ||
        a.account.code.localeCompare(b.account.code)
      );
    return a.account.code.localeCompare(b.account.code);
  });
  const selectAccounts = (ids: string[] | undefined) => {
    ctx.setSearch({
      account:
        !cashBasis && ctx.reportId === "general-ledger" && ids?.length === 1 ? ids[0] : undefined,
      accountIds:
        ids && (cashBasis || ctx.reportId !== "general-ledger" || ids.length > 1)
          ? ids.join(",")
          : undefined,
      page: undefined,
      explorePage: undefined,
    });
  };
  return (
    <ReportShell
      title={ctx.reportId === "general-ledger" ? "Account Transactions" : "General Ledger"}
      ctx={ctx}
      mode="range"
      basis={
        cashBasis
          ? "Management cash-recognition basis · Recognised receipts and payments, not accrual posting dates. Cash reconciliation and supported recognition policies are required."
          : "Posted accrual ledger · Account-level balances preserve all posted movements in date order"
      }
      extraControls={
        <>
          <div className="space-y-1">
            <Label htmlFor="account-ledger-basis">Accounting method</Label>
            <select
              id="account-ledger-basis"
              className={selectCls}
              value={cashBasis ? "cash" : "accrual"}
              onChange={(event) =>
                ctx.setSearch({
                  basis: event.target.value === "cash" ? "cash" : undefined,
                  explorePage: undefined,
                  page: undefined,
                })
              }
            >
              <option value="accrual">Accrual (posted ledger)</option>
              <option value="cash">Cash (recognized settlements)</option>
            </select>
          </div>
          <ReportAccountMultiSelect
            accounts={accountsQ.data ?? []}
            selected={accountIds ? accountIds.split(",") : undefined}
            onChange={selectAccounts}
            disabled={accountsQ.isPending}
          />
          <div className="space-y-1">
            <Label htmlFor="report-account-scope">Accounts to include</Label>
            <select
              id="report-account-scope"
              className={selectCls}
              value={accountScope}
              onChange={(event) =>
                ctx.setSearch({
                  accountScope: event.target.value === "balance" ? undefined : event.target.value,
                  explorePage: undefined,
                  page: undefined,
                })
              }
            >
              <option value="transactions">
                {cashBasis ? "With recognized cash movements" : "With posted transactions"}
              </option>
              <option value="balance">Transactions or opening balance</option>
              <option value="all">All accounts, including zero balances</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-account-group">Group accounts by</Label>
            <select
              id="report-account-group"
              className={selectCls}
              value={accountGroup}
              onChange={(event) =>
                ctx.setSearch({
                  accountGroup: event.target.value === "code" ? undefined : event.target.value,
                  explorePage: undefined,
                  page: undefined,
                })
              }
            >
              <option value="code">Account code</option>
              <option value="name">Account name</option>
              <option value="type">Account type, then code</option>
            </select>
          </div>
          {cashBasis && (
            <div className="space-y-1">
              <Label htmlFor="cash-ledger-page-size">Rows per page</Label>
              <select
                id="cash-ledger-page-size"
                className={selectCls}
                value={pageSize}
                onChange={(event) =>
                  ctx.setSearch({
                    txnPageSize: Number(event.target.value) as 25 | 50 | 100 | 200,
                    page: undefined,
                    explorePage: undefined,
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
          )}
        </>
      }
      getCsv={() =>
        d
          ? {
              headers: [
                "Account",
                "Date",
                "Journal",
                "Source",
                "Memo",
                "Debit",
                "Credit",
                "Balance",
                "Account code",
                "Account type",
                "Journal ID",
                "Source ID",
              ],
              basis:
                cashBasis && cashQ.data
                  ? `Cash recognition ledger, page ${cashQ.data.page + 1} of ${Math.max(1, Math.ceil(cashQ.data.totalCount / cashQ.data.pageSize))}; ${cashQ.data.lineCount} of ${cashQ.data.totalLineCount} cash movements loaded. Export contains only these displayed report rows. Opening and closing balances are for the complete reporting period.`
                  : "Accrual posted ledger; full posting history used for opening balances.",
              rows: orderedAccounts.flatMap((a) => [
                [
                  `${a.account.code} ${a.account.name}`,
                  "",
                  "",
                  "",
                  "Opening balance",
                  "",
                  "",
                  csvMoney(a.opening_balance_minor, ctx.currency),
                  a.account.code,
                  a.account.account_type,
                  "",
                  "",
                ],
                ...a.rows.map((r) => [
                  `${a.account.code} ${a.account.name}`,
                  r.journal_date,
                  r.journal_number,
                  sourceLabel(r.source_type),
                  r.memo ?? "",
                  csvMoney(r.debit_minor, ctx.currency),
                  csvMoney(r.credit_minor, ctx.currency),
                  csvMoney(r.running_balance_minor, ctx.currency),
                  a.account.code,
                  a.account.account_type,
                  r.journal_id,
                  r.source_id ?? "",
                ]),
              ]),
            }
          : null
      }
    >
      <ReportPane
        query={q}
        isEmpty={Boolean(d) && orderedAccounts.length === 0}
        emptyTitle="No ledger activity"
        emptyDescription="No accounts match the period and selection. Choose All accounts or include zero balances."
      >
        {d ? (
          <div className="space-y-3">
            {cashBasis && cashQ.data && (
              <p className="text-xs text-muted-foreground">
                Showing report page {cashQ.data.page + 1} · {cashQ.data.lineCount} of{" "}
                {cashQ.data.totalLineCount} recognized cash movements across{" "}
                {cashQ.data.totalAccountCount} accounts. Downloads contain only this page. All
                opening and closing balances cover the entire selected period.
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Journal</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedAccounts.map((a) => (
                  <Fragment key={a.account.id}>
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={6} className="font-semibold">
                        <Link
                          to="/reports/$reportId"
                          params={{ reportId: "general-ledger" }}
                          search={{
                            account: a.account.id,
                            from: ctx.from,
                            to: ctx.to,
                            ...(cashBasis ? { basis: "cash" as const } : {}),
                          }}
                          className="underline-offset-2 hover:underline"
                        >
                          {accountGroup === "type" ? `${a.account.account_type} · ` : ""}
                          {a.account.code} {a.account.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        Opening {fmt.amount(a.opening_balance_minor, ctx.currency)}
                      </TableCell>
                    </TableRow>
                    {a.rows.map((r, i) => (
                      <TableRow key={`${r.journal_id}-${i}`}>
                        <TableCell>{fmt.date(r.journal_date)}</TableCell>
                        <TableCell>
                          <JournalLink journalId={r.journal_id} number={r.journal_number} />
                        </TableCell>
                        <TableCell>
                          <SourceLink type={r.source_type} id={r.source_id} />
                        </TableCell>
                        <TableCell>{r.memo ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.amount(r.debit_minor, ctx.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.amount(r.credit_minor, ctx.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.amount(r.running_balance_minor, ctx.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-medium">
                      <TableCell colSpan={6}>Closing balance</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(a.closing_balance_minor, ctx.currency)}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            {cashBasis && cashQ.data && (
              <PagerBar
                page={cashQ.data.page}
                pageSize={cashQ.data.pageSize}
                total={cashQ.data.totalCount}
                onPage={(p) =>
                  ctx.setSearch({
                    page: p === 0 ? undefined : p + 1,
                    explorePage: undefined,
                  })
                }
              />
            )}
          </div>
        ) : null}
      </ReportPane>
    </ReportShell>
  );
}

/* ---------------- Journal report ---------------- */

export function JournalReportView({ ctx }: { ctx: ReportCtx }) {
  const fmt = useFormat();
  const fetchJr = useServerFn(getJournalReport);
  const page = Math.max(0, (ctx.search.page ?? 1) - 1);
  const source = ctx.search.source ?? "";
  const status = ctx.search.status ?? "posted";
  const q = useQuery({
    queryKey: ["report-journals", ctx.companyId, ctx.from, ctx.to, source, status, page],
    queryFn: () =>
      fetchJr({
        data: {
          companyId: ctx.companyId,
          from: ctx.from,
          to: ctx.to,
          status,
          source,
          page,
          pageSize: 100,
        },
      }),
  });
  const d = q.data;
  return (
    <ReportShell
      title="Journal Report"
      ctx={ctx}
      mode="range"
      extraControls={
        <>
          <div className="space-y-1">
            <Label htmlFor="jr-source">Source</Label>
            <RecordLookupSelect
              id="jr-source"
              className={selectCls}
              value={source}
              onValueChange={(e) => ctx.setSearch({ source: e || undefined, page: undefined })}
            >
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </RecordLookupSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="jr-status">Status</Label>
            <select
              id="jr-status"
              className={selectCls}
              value={status}
              onChange={(e) =>
                ctx.setSearch({
                  status: e.target.value === "posted" ? undefined : e.target.value,
                  page: undefined,
                })
              }
            >
              <option value="posted">Posted</option>
              <option value="reversed">Reversed</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </>
      }
      getCsv={() =>
        d
          ? {
              headers: ["Number", "Date", "Source", "Status", "Memo", "Debit", "Credit"],
              rows: d.rows.map((j) => [
                j.journal_number,
                j.journal_date,
                sourceLabel(j.source_type),
                j.status,
                j.memo ?? "",
                csvMoney(j.total_debit_minor, j.currency_code || ctx.currency),
                csvMoney(j.total_credit_minor, j.currency_code || ctx.currency),
              ]),
              basis: "Current page only; narrow the filters to export a smaller set",
            }
          : null
      }
    >
      <ReportPane
        query={q}
        isEmpty={Boolean(d) && d!.rows.length === 0}
        emptyTitle="No journals"
        emptyDescription="Journals matching the filters will list here."
      >
        {d ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.rows.map((j) => (
                  <TableRow key={j.journal_id}>
                    <TableCell>
                      <JournalLink journalId={j.journal_id} number={j.journal_number} />
                    </TableCell>
                    <TableCell>{fmt.date(j.journal_date)}</TableCell>
                    <TableCell>
                      <SourceLink type={j.source_type} id={j.source_id} />
                    </TableCell>
                    <TableCell>{j.memo ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.amount(j.total_debit_minor, j.currency_code || ctx.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.amount(j.total_credit_minor, j.currency_code || ctx.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PagerBar
              page={d.page}
              pageSize={d.pageSize}
              total={d.total}
              onPage={(p) => ctx.setSearch({ page: p === 0 ? undefined : p + 1 })}
            />
          </>
        ) : null}
      </ReportPane>
    </ReportShell>
  );
}

/* ---------------- Aged receivables / payables ---------------- */

type AgedData = Pick<
  Awaited<ReturnType<typeof getAgedReceivables>>,
  "rows" | "total" | "byBucket" | "varianceMinor" | "tiesToControl" | "excludedUnpostedCount"
> & { controlMinor: number; diagnostic: string | null };

export function AgedView({ ctx, kind }: { ctx: ReportCtx; kind: "ar" | "ap" }) {
  const fmt = useFormat();
  const fetchAr = useServerFn(getAgedReceivablesAsAt);
  const fetchAp = useServerFn(getAgedPayablesAsAt);
  const q = useQuery({
    queryKey: ["report-aged", kind, ctx.companyId, ctx.to],
    queryFn: async (): Promise<AgedData> => {
      if (kind === "ar") {
        // As-at ageing: rebuilt from dated allocations; unapplied receipts/credits shown as negatives.
        const r = await fetchAr({ data: { companyId: ctx.companyId, asOf: ctx.to } });
        const baseTotals = r.totalsByCurrency.find((t) => t.currency_code === r.baseCurrency);
        const total = baseTotals?.total ?? 0;
        const foreign = r.totalsByCurrency.filter((t) => t.currency_code !== r.baseCurrency);
        const variance = total - r.arControlBalanceMinor;
        return {
          rows: r.rows
            .filter((row) => row.currency_code === r.baseCurrency)
            .map((row) => ({ ...row, docs: [] })),
          total,
          byBucket: baseTotals?.byBucket ?? {
            current: 0,
            "1_30": 0,
            "31_60": 0,
            "61_90": 0,
            "90_plus": 0,
          },
          varianceMinor: variance,
          tiesToControl: variance === 0 && foreign.length === 0,
          excludedUnpostedCount: 0,
          controlMinor: r.arControlBalanceMinor,
          diagnostic:
            foreign.length > 0
              ? `Foreign-currency balances (${foreign.map((t) => t.currency_code).join(", ")}) are not included in the ${r.baseCurrency} table above; the control account is in base currency.`
              : r.diagnostic,
        };
      }
      const r = await fetchAp({ data: { companyId: ctx.companyId, asOf: ctx.to } });
      const baseTotals = r.totalsByCurrency.find((t) => t.currency_code === r.baseCurrency);
      const total = baseTotals?.total ?? 0;
      const foreign = r.totalsByCurrency.filter((t) => t.currency_code !== r.baseCurrency);
      const variance = typeof r.varianceMinor === "number" ? r.varianceMinor : total - r.apControlBalanceMinor;
      return {
        rows: r.rows
          .filter((row) => row.currency_code === r.baseCurrency)
          .map((row) => ({ ...row, docs: [] })),
        total,
        byBucket: baseTotals?.byBucket ?? {
          current: 0,
          "1_30": 0,
          "31_60": 0,
          "61_90": 0,
          "90_plus": 0,
        },
        varianceMinor: variance,
        tiesToControl: variance === 0 && foreign.length === 0,
        excludedUnpostedCount: 0,
        controlMinor: r.apControlBalanceMinor,
        diagnostic:
          foreign.length > 0
            ? `Foreign-currency balances (${foreign.map((t) => t.currency_code).join(", ")}) are not included in the ${r.baseCurrency} table above; the control account is in base currency.`
            : r.diagnostic,
      };
    },
  });
  const d = q.data;
  const control = d?.controlMinor ?? 0;
  const title = kind === "ar" ? "Aged Receivables" : "Aged Payables";
  return (
    <ReportShell
      title={title}
      ctx={ctx}
      mode="asof"
      basis={
        kind === "ap"
          ? "Dated payables and allocations · currencies kept separate"
          : "Dated receivables and allocations · currencies kept separate"
      }
      getCsv={() =>
        d
          ? {
              basis:
                kind === "ap"
                  ? "Dated payables; base-currency table only"
                  : "Dated receivables; base-currency table only",
              headers: ["Contact", "Current", "1-30", "31-60", "61-90", "90+", "Total"],
              rows: [
                ...d.rows.map((r) => [
                  r.contact_name,
                  csvMoney(r.current, ctx.currency),
                  csvMoney(r.b_1_30, ctx.currency),
                  csvMoney(r.b_31_60, ctx.currency),
                  csvMoney(r.b_61_90, ctx.currency),
                  csvMoney(r.b_90_plus, ctx.currency),
                  csvMoney(r.total, ctx.currency),
                ]),
                [
                  "Total",
                  csvMoney(d.byBucket.current, ctx.currency),
                  csvMoney(d.byBucket["1_30"], ctx.currency),
                  csvMoney(d.byBucket["31_60"], ctx.currency),
                  csvMoney(d.byBucket["61_90"], ctx.currency),
                  csvMoney(d.byBucket["90_plus"], ctx.currency),
                  csvMoney(d.total, ctx.currency),
                ],
              ],
            }
          : null
      }
    >
      <ReportPane
        query={q}
        isEmpty={Boolean(d) && d!.rows.length === 0 && d!.varianceMinor === 0}
        emptyTitle={kind === "ar" ? "No open receivables" : "No open payables"}
        emptyDescription="Authorised documents with outstanding balances appear here."
      >
        {d ? (
          <>
            <p className="mb-2 text-sm">
              Ageing total {fmt.amount(d.total, ctx.currency)} · Control account{" "}
              {fmt.amount(control, ctx.currency)}{" "}
              <Badge variant={d.tiesToControl ? "secondary" : "destructive"}>
                {d.tiesToControl ? "Ties to control" : "Does not tie, investigate"}
              </Badge>
              {d.excludedUnpostedCount ? (
                <span className="ml-2 text-muted-foreground">
                  ({d.excludedUnpostedCount} unposted document(s) excluded)
                </span>
              ) : null}
            </p>
            {d.diagnostic ? (
              <Alert className="mb-3">
                <AlertDescription>
                  Variance {fmt.amount(d.varianceMinor, ctx.currency)}. {d.diagnostic}
                </AlertDescription>
              </Alert>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">1–30</TableHead>
                  <TableHead className="text-right">31–60</TableHead>
                  <TableHead className="text-right">61–90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.rows.map((r) => (
                  <TableRow key={r.contact_id}>
                    <TableCell>
                      <Link
                        to="/contacts/$contactId"
                        params={{ contactId: r.contact_id }}
                        className="underline-offset-2 hover:underline"
                      >
                        {r.contact_name}
                      </Link>
                    </TableCell>
                    {[r.current, r.b_1_30, r.b_31_60, r.b_61_90, r.b_90_plus, r.total].map(
                      (v, i) => (
                        <TableCell key={i} className="text-right tabular-nums">
                          {fmt.amount(v, ctx.currency)}
                        </TableCell>
                      ),
                    )}
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  {[
                    d.byBucket.current,
                    d.byBucket["1_30"],
                    d.byBucket["31_60"],
                    d.byBucket["61_90"],
                    d.byBucket["90_plus"],
                    d.total,
                  ].map((v, i) => (
                    <TableCell key={i} className="text-right tabular-nums">
                      {fmt.amount(v, ctx.currency)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </>
        ) : null}
      </ReportPane>
    </ReportShell>
  );
}

/* ---------------- Tax control summary ---------------- */

export function TaxSummaryView({ ctx }: { ctx: ReportCtx }) {
  const fmt = useFormat();
  const fetchTax = useServerFn(getTaxReport);
  // An omitted URL basis uses company tax settings; saved views retain explicit overrides.
  const basisChoice = ctx.search.basis;
  const q = useQuery({
    queryKey: ["report-tax", ctx.companyId, ctx.from, ctx.to, basisChoice],
    queryFn: () =>
      fetchTax({
        data: {
          companyId: ctx.companyId,
          from: ctx.from,
          to: ctx.to,
          ...(basisChoice ? { basis: basisChoice } : {}),
        },
      }),
  });
  const d = q.data;
  const basis = d?.basis ?? basisChoice ?? "accrual";
  const accountIds = ctx.search.accountIds?.split(",") ?? null;
  const taxAccounts = [
    ...new Map(
      (d?.detail ?? []).map((line) => [
        line.account_id,
        { id: line.account_id, code: line.account_code, name: line.account_name },
      ]),
    ).values(),
  ];
  const ledgerRows = accountIds
    ? (d?.detail ?? []).filter((line) => accountIds.includes(line.account_id))
    : (d?.detail ?? []);
  return (
    <ReportShell
      title="Tax Summary"
      ctx={ctx}
      mode="range"
      basis={`Document tax lines, ${basis} basis; posted control reconciliation shown separately`}
      extraControls={
        <>
          <div className="space-y-1">
            <Label htmlFor="tax-basis">Accounting basis</Label>
            <select
              id="tax-basis"
              className={selectCls}
              value={basis}
              onChange={(e) =>
                ctx.setSearch({ basis: e.target.value === "cash" ? "cash" : "accrual" })
              }
            >
              <option value="accrual">Accrual (invoice date)</option>
              <option value="cash">Cash (payment date)</option>
            </select>
          </div>
          <ReportAccountMultiSelect
            label="Tax ledger accounts"
            accounts={taxAccounts}
            selected={accountIds ?? undefined}
            onChange={(ids) =>
              ctx.setSearch({ accountIds: ids?.join(",") || undefined, explorePage: undefined })
            }
            disabled={!d || taxAccounts.length === 0}
          />
        </>
      }
      getCsv={() => {
        if (!d) return null;
        if (d.detailMode === "cash_recognition")
          return {
            basis:
              "Cash basis: dated tax recognition; posted tax-control reconciliation is shown separately on screen.",
            headers: [
              "Recognition date",
              "Settlement",
              "Source",
              "Document",
              "Side",
              "Treatment",
              "Net",
              "Output tax",
              "Input tax",
              "Net payable",
            ],
            rows: [
              ...d.cashRecognitionDetails.map((line) => [
                line.recognition_date,
                line.settlement_id ?? "",
                sourceLabel(line.source_type),
                line.source_id,
                line.side === "sales" ? "Sales" : "Purchases",
                line.treatment?.replaceAll("_", " ") ?? "Uncoded",
                csvMoney(line.net_minor, ctx.currency),
                csvMoney(line.output_tax_minor, ctx.currency),
                csvMoney(line.input_tax_minor, ctx.currency),
                csvMoney(line.net_tax_minor, ctx.currency),
              ]),
              [
                "",
                "",
                "Total",
                "",
                "",
                "",
                csvMoney(
                  d.documents.sales_net_minor + d.documents.purchases_net_minor,
                  ctx.currency,
                ),
                csvMoney(d.documents.output_tax_minor, ctx.currency),
                csvMoney(d.documents.input_tax_minor, ctx.currency),
                csvMoney(d.documents.net_tax_minor, ctx.currency),
              ],
            ],
          };
        return {
          headers: ["Date", "Journal", "Source", "Account", "Debit", "Credit"],
          basis: accountIds
            ? "Selected tax control lines; document tax totals remain for the full company."
            : "Full tax-control ledger transaction lines.",
          rows: ledgerRows.map((line) => [
            line.journal_date,
            line.journal_number,
            sourceLabel(line.source_type),
            `${line.account_code} ${line.account_name}`,
            csvMoney(line.debit_minor, ctx.currency),
            csvMoney(line.credit_minor, ctx.currency),
          ]),
        };
      }}
    >
      <ReportPane
        query={q}
        isEmpty={Boolean(d) && d!.taxAccountCount === 0 && d!.detailMode !== "cash_recognition"}
        emptyTitle="No tax accounts"
        emptyDescription="Map tax accounts under Tax → GL mappings, or tag chart accounts with the tax system key."
      >
        {d ? (
          <>
            <Alert className="mb-3">
              <AlertDescription>
                Regime: {d.regime}
                {d.jurisdictionCode ? ` (${d.jurisdictionCode})` : ""}. {d.complianceNote}{" "}
                <Link className="underline" to="/tax">
                  Tax settings and returns
                </Link>
              </AlertDescription>
            </Alert>
            {d.settingsBasis !== basis ? (
              <p className="mb-3 text-xs text-muted-foreground">
                The company files on the {d.settingsBasis} basis.
              </p>
            ) : null}
            <div className="mb-2 grid gap-3 sm:grid-cols-3">
              <Stat
                label="Output tax (from documents)"
                value={fmt.money(d.documents.output_tax_minor, ctx.currency)}
              />
              <Stat
                label="Input tax reclaimable"
                value={fmt.money(d.documents.input_tax_minor, ctx.currency)}
              />
              <Stat
                label="Net payable"
                value={fmt.money(d.documents.net_tax_minor, ctx.currency)}
              />
            </div>
            {d.documents.self_assessed_lines > 0 ? (
              <p className="mb-2 text-xs text-muted-foreground">
                Includes {d.documents.self_assessed_lines} reverse-charge line(s): the tax is
                counted as both output and input tax.
              </p>
            ) : null}
            {d.documents.skippedNoRate > 0 ? (
              <Alert className="mb-2">
                <AlertDescription>
                  {d.documents.skippedNoRate} foreign-currency document(s) have no exchange rate on
                  their journal and are left out.
                </AlertDescription>
              </Alert>
            ) : null}
            {d.documents.rows.length > 0 ? (
              <Table className="mb-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>Side</TableHead>
                    <TableHead>Treatment</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.documents.rows.map((r) => (
                    <TableRow key={`${r.side}-${r.treatment}-${r.self_assessed}`}>
                      <TableCell>{r.side === "sales" ? "Sales" : "Purchases"}</TableCell>
                      <TableCell>
                        {r.treatment.replace(/_/g, " ")}
                        {r.self_assessed ? " (self-assessed)" : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.lines}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(r.net_minor, ctx.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(r.tax_minor, ctx.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
            {d.detailMode === "cash_recognition" && (
              <section aria-label="Cash tax recognition" className="mb-6 space-y-2">
                <h3 className="text-sm font-medium">Cash tax recognition</h3>
                <p className="text-xs text-muted-foreground">
                  These dated source lines reconcile to the document totals above and are included
                  in the download.
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cash date</TableHead>
                        <TableHead>Source document</TableHead>
                        <TableHead>Settlement</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead>Treatment</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="text-right">Output tax</TableHead>
                        <TableHead className="text-right">Input tax</TableHead>
                        <TableHead className="text-right">Net payable</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.cashRecognitionDetails.map((line, index) => (
                        <TableRow
                          key={`${line.source_line_id}-${line.settlement_id ?? "direct"}-${index}`}
                        >
                          <TableCell>{fmt.date(line.recognition_date)}</TableCell>
                          <TableCell>
                            <SourceLink type={line.source_type} id={line.source_id} />
                          </TableCell>
                          <TableCell
                            className="max-w-36 truncate"
                            title={line.settlement_id ?? undefined}
                          >
                            {line.settlement_id ?? "Direct payment"}
                          </TableCell>
                          <TableCell>{line.side === "sales" ? "Sales" : "Purchases"}</TableCell>
                          <TableCell>{line.treatment?.replaceAll("_", " ") ?? "Uncoded"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt.amount(line.net_minor, ctx.currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt.amount(line.output_tax_minor, ctx.currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt.amount(line.input_tax_minor, ctx.currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt.amount(line.net_tax_minor, ctx.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold">
                        <TableCell colSpan={5}>Total</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.amount(
                            d.documents.sales_net_minor + d.documents.purchases_net_minor,
                            ctx.currency,
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.amount(d.documents.output_tax_minor, ctx.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.amount(d.documents.input_tax_minor, ctx.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.amount(d.documents.net_tax_minor, ctx.currency)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}
            <p className="mb-2 text-sm font-medium">
              Posted tax-control reconciliation
              {accountIds ? " · selected accounts shown below" : ""}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              Full-company control totals below are not filtered by the account selection.
            </p>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <Stat
                label="Output (credits)"
                value={fmt.money(d.output_credit_minor, ctx.currency)}
              />
              <Stat label="Input (debits)" value={fmt.money(d.input_debit_minor, ctx.currency)} />
              <Stat label="Net payable" value={fmt.money(d.net_payable_minor, ctx.currency)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Journal</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerRows.map((l, i) => (
                  <TableRow key={`${l.journal_id}-${i}`}>
                    <TableCell>{fmt.date(l.journal_date)}</TableCell>
                    <TableCell>
                      <JournalLink journalId={l.journal_id} number={l.journal_number} />
                    </TableCell>
                    <TableCell>
                      <SourceLink type={l.source_type} id={l.source_id} />
                    </TableCell>
                    <TableCell>
                      {l.account_code} {l.account_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.amount(l.debit_minor, ctx.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.amount(l.credit_minor, ctx.currency)}
                    </TableCell>
                  </TableRow>
                ))}
                {ledgerRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No posted tax ledger lines match the selected accounts.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        ) : null}
      </ReportPane>
    </ReportShell>
  );
}

/* ---------------- Audit trail ---------------- */

export function AuditView({ ctx }: { ctx: ReportCtx }) {
  const fmt = useFormat();
  const fetchAudit = useServerFn(getAuditReport);
  const fetchOptions = useServerFn(getAuditFilterOptions);
  const page = Math.max(0, (ctx.search.page ?? 1) - 1);
  const [open, setOpen] = useState<string | null>(null);
  const optionsQ = useQuery({
    queryKey: ["audit-options", ctx.companyId],
    queryFn: () => fetchOptions({ data: { companyId: ctx.companyId } }),
    retry: false,
  });
  const q = useQuery({
    queryKey: [
      "report-audit",
      ctx.companyId,
      ctx.from,
      ctx.to,
      ctx.search.actor,
      ctx.search.entity,
      ctx.search.action,
      page,
    ],
    retry: false,
    queryFn: () =>
      fetchAudit({
        data: {
          companyId: ctx.companyId,
          from: ctx.from,
          to: ctx.to,
          ...(ctx.search.actor ? { actorId: ctx.search.actor } : {}),
          ...(ctx.search.entity ? { entityType: ctx.search.entity } : {}),
          ...(ctx.search.action ? { action: ctx.search.action } : {}),
          page,
          pageSize: 50,
        },
      }),
  });
  const d = q.data;
  return (
    <ReportShell
      title="Audit Trail"
      ctx={ctx}
      mode="range"
      extraControls={
        <>
          <div className="space-y-1">
            <Label htmlFor="audit-actor">User</Label>
            <LookupSelect
              id="audit-actor"
              ariaLabel="User"
              allowClear={false}
              value={ctx.search.actor ?? "__everyone__"}
              onChange={(id) =>
                ctx.setSearch({
                  actor: id === "__everyone__" ? undefined : id,
                  page: undefined,
                })
              }
              searchPlaceholder="Search user"
              options={[
                { id: "__everyone__", label: "Everyone" },
                ...(optionsQ.data?.actors ?? []).map((a) => ({
                  id: a.id,
                  name: a.name,
                  label: a.name,
                  keywords: a.name,
                })),
              ]}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-entity">Entity</Label>
            <Input
              id="audit-entity"
              placeholder="e.g. journal"
              defaultValue={ctx.search.entity ?? ""}
              onBlur={(e) =>
                ctx.setSearch({ entity: e.target.value.trim() || undefined, page: undefined })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-action">Action</Label>
            <Input
              id="audit-action"
              placeholder="contains…"
              defaultValue={ctx.search.action ?? ""}
              onBlur={(e) =>
                ctx.setSearch({ action: e.target.value.trim() || undefined, page: undefined })
              }
            />
          </div>
        </>
      }
      getCsv={() =>
        d
          ? {
              headers: ["When", "User", "Action", "Entity", "Entity id", "Details"],
              rows: d.events.map((e) => [
                e.created_at,
                e.actor_name,
                e.action,
                e.entity_type,
                e.entity_id ?? "",
                e.details_json,
              ]),
              basis: "Current page only",
            }
          : null
      }
    >
      <ReportPane
        query={q}
        isEmpty={Boolean(d) && d!.events.length === 0}
        emptyTitle="No audit events"
        emptyDescription="Posting and period actions appear here when audited. Viewing needs the audit permission."
      >
        {d ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="print:hidden">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.events.map((e) => (
                  <Fragment key={e.id}>
                    <TableRow>
                      <TableCell>{fmt.dateTime(e.created_at)}</TableCell>
                      <TableCell>{e.actor_name}</TableCell>
                      <TableCell>{e.action}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {e.entity_type} {e.entity_id?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="print:hidden">
                        {e.details_json !== "{}" ? (
                          <button
                            type="button"
                            className="text-xs underline-offset-2 hover:underline"
                            aria-expanded={open === e.id}
                            onClick={() => setOpen(open === e.id ? null : e.id)}
                          >
                            {open === e.id ? "Hide" : "Show"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                    {open === e.id ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                            {JSON.stringify(JSON.parse(e.details_json), null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            <PagerBar
              page={d.page}
              pageSize={d.pageSize}
              total={d.total}
              onPage={(p) => ctx.setSearch({ page: p === 0 ? undefined : p + 1 })}
            />
          </>
        ) : null}
      </ReportPane>
    </ReportShell>
  );
}
