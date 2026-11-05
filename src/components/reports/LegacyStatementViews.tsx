// Core statement rendering remains available when the optional reporting suite is frozen.
import { StatementBasisSelect } from "./StatementBasisSelect";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useFormat } from "@/hooks/use-format";
import { csvMoney } from "@/lib/reports/csv";
import { getProfitAndLoss, getBalanceSheet } from "@/lib/reports/report.functions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountLink, ReportPane, ReportShell, Stat, type ReportCtx } from "./ReportShell";
type StatementRow = {
  kind: "heading" | "account" | "subtotal" | "total";
  label: string;
  code?: string;
  accountId?: string;
  amounts: number[];
};

function StatementTable({
  rows,
  columns,
  ctx,
  drillFrom,
}: {
  rows: StatementRow[];
  columns: Array<{ label: string; from?: string; to?: string }>;
  ctx: ReportCtx;
  /** Period start used for drill-down links (balance sheet drills from the financial year start). */
  drillFrom: string;
}) {
  const fmt = useFormat();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          {columns.map((c) => (
            <TableHead key={c.label} className="text-right" aria-sort="none">
              {c.label}
              {c.from && c.to ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  {fmt.date(c.from)} – {fmt.date(c.to)}
                </span>
              ) : c.to ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  {fmt.date(c.to)}
                </span>
              ) : null}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => {
          if (r.kind === "heading") {
            return (
              <TableRow key={`${r.label}-${i}`} className="bg-muted/40">
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-xs font-semibold uppercase tracking-wide"
                >
                  {r.label}
                </TableCell>
              </TableRow>
            );
          }
          const bold = r.kind !== "account";
          return (
            <TableRow
              key={`${r.accountId ?? r.label}-${i}`}
              className={r.kind === "total" ? "border-t-2" : undefined}
            >
              <TableCell className={`${bold ? "font-semibold" : "pl-6"}`}>
                {r.accountId ? (
                  <AccountLink
                    accountId={r.accountId}
                    from={drillFrom}
                    to={ctx.to}
                    basis={ctx.search.basis}
                  >
                    {r.code ? <span className="mr-2 text-muted-foreground">{r.code}</span> : null}
                    {r.label}
                  </AccountLink>
                ) : (
                  r.label
                )}
              </TableCell>
              {r.amounts.map((a, j) => (
                <TableCell
                  key={j}
                  className={`text-right tabular-nums ${bold ? "font-semibold" : ""}`}
                >
                  {fmt.amount(a, ctx.currency)}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function statementCsv(rows: StatementRow[], columns: Array<{ label: string }>, currency: string) {
  return {
    headers: ["Code", "Account", ...columns.map((c) => c.label)],
    rows: rows.map((r) => [
      r.code ?? "",
      r.kind === "heading" ? r.label.toUpperCase() : r.label,
      ...(r.kind === "heading"
        ? columns.map(() => "")
        : r.amounts.map((a) => csvMoney(a, currency))),
    ]),
  };
}

export function LegacyProfitLossView({ ctx }: { ctx: ReportCtx }) {
  const fmt = useFormat();
  const fetchPl = useServerFn(getProfitAndLoss);
  const columnsMode = ctx.search.columns ?? "none";
  const q = useQuery({
    queryKey: ["report-pl", ctx.companyId, ctx.from, ctx.to, columnsMode, ctx.search.basis],
    queryFn: () =>
      fetchPl({
        data: {
          companyId: ctx.companyId,
          from: ctx.from,
          to: ctx.to,
          columns: columnsMode,
          ...(ctx.search.basis ? { basis: ctx.search.basis } : {}),
        },
      }),
  });
  const d = q.data;
  const rows = (d?.statement ?? []) as StatementRow[];
  const cols = d?.columns ?? [];
  return (
    <ReportShell
      title="Profit and Loss"
      ctx={ctx}
      mode="range"
      showColumns="pl"
      basis={d?.basis}
      extraControls={
        <StatementBasisSelect
          basis={ctx.search.basis ?? "accrual"}
          report="profit-and-loss"
          onChange={(basis) => ctx.setSearch({ basis })}
        />
      }
      getCsv={() => (d ? { ...statementCsv(rows, cols, ctx.currency), basis: d.basis } : null)}
    >
      <ReportPane
        query={q}
        isEmpty={
          Boolean(d) && rows.every((r) => r.kind === "heading" || r.amounts.every((a) => a === 0))
        }
        emptyTitle="No income or expense in range"
        emptyDescription="Post revenue or expense journals in this period."
      >
        {d ? (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-4 print:hidden">
              <Stat label="Revenue" value={fmt.money(d.revenue, ctx.currency)} />
              <Stat label="Gross profit" value={fmt.money(d.grossProfit, ctx.currency)} />
              <Stat
                label="Operating expenses"
                value={fmt.money(d.operatingExpense, ctx.currency)}
              />
              <Stat label="Net profit" value={fmt.money(d.net, ctx.currency)} />
            </div>
            <StatementTable rows={rows} columns={cols} ctx={ctx} drillFrom={ctx.from} />
          </>
        ) : null}
      </ReportPane>
    </ReportShell>
  );
}

export function LegacyBalanceSheetView({ ctx }: { ctx: ReportCtx }) {
  const fmt = useFormat();
  const fetchBs = useServerFn(getBalanceSheet);
  const compare = ctx.search.compare ?? "none";
  const q = useQuery({
    queryKey: ["report-bs", ctx.companyId, ctx.to, compare, ctx.search.basis],
    queryFn: () =>
      fetchBs({
        data: {
          companyId: ctx.companyId,
          asOf: ctx.to,
          compare,
          ...(ctx.search.basis ? { basis: ctx.search.basis } : {}),
        },
      }),
  });
  const d = q.data;
  const rows = (d?.statement ?? []) as StatementRow[];
  const cols = (d?.columns ?? []).map((c) => ({ label: fmt.date(c.label), to: c.asOf }));
  return (
    <ReportShell
      title="Balance Sheet"
      ctx={ctx}
      mode="asof"
      showColumns="bs"
      basis={d?.basis}
      extraControls={
        <StatementBasisSelect
          basis={ctx.search.basis ?? "accrual"}
          report="profit-and-loss"
          onChange={(basis) => ctx.setSearch({ basis })}
        />
      }
      getCsv={() => (d ? { ...statementCsv(rows, cols, ctx.currency), basis: d.basis } : null)}
    >
      <ReportPane
        query={q}
        isEmpty={
          Boolean(d) && rows.every((r) => r.kind === "heading" || r.amounts.every((a) => a === 0))
        }
        emptyTitle="No balance sheet balances"
        emptyDescription="Post assets, liabilities or equity."
      >
        {d ? (
          <>
            {!d.equationHolds ? (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  Accounting equation does not hold (assets ≠ liabilities + equity). Investigate
                  journals.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="mb-4 grid gap-3 sm:grid-cols-4 print:hidden">
              <Stat label="Assets" value={fmt.money(d.assets, ctx.currency)} />
              <Stat label="Liabilities" value={fmt.money(d.liabilities, ctx.currency)} />
              <Stat label="Equity" value={fmt.money(d.equity, ctx.currency)} />
              <Stat
                label="Current year earnings"
                value={fmt.money(d.currentYearEarningsMinor, ctx.currency)}
              />
            </div>
            <StatementTable
              rows={rows}
              columns={cols}
              ctx={ctx}
              drillFrom={d.fyStart ?? ctx.from}
            />
          </>
        ) : null}
      </ReportPane>
    </ReportShell>
  );
}
