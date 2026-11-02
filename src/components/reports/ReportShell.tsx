import { useReportActivity } from "@/hooks/use-report-activity";
import { useCanDo } from "@/hooks/use-can";
import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, ChevronDown } from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { CsvCell } from "@/lib/reports/csv";
import { exportVisibleReport } from "@/lib/reports/visible-export.functions";
import { downloadReportFile } from "@/lib/reports/download";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { sourceLabel, sourceTarget } from "@/lib/reports/links";
import type { ReportSearch } from "@/lib/reports/search";
import type { ReportPresentation } from "@/lib/reports/report-document";
import { EmptyState, ErrorState, ReportSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReportPeriodSelect } from "./ReportPeriodSelect";
import { SavedViews } from "./SavedViews";

export type ReportCtx = {
  /** Catalogue id of the report; enables saved views. */
  reportId?: string;
  companyId: string;
  companyName: string;
  currency: string;
  fyEndMonth?: number;
  fyEndDay?: number;
  from: string;
  to: string;
  search: ReportSearch;
  setSearch: (patch: Partial<Record<keyof ReportSearch, unknown>>) => void;
};

export type CsvExport = { headers: string[]; rows: CsvCell[][]; basis?: string };

export function ReportShell({
  title,
  ctx,
  mode,
  showColumns,
  extraControls,
  toolbarActions,
  hidePrint = false,
  headerPresentation,
  capturedAt,
  getCsv,
  basis,
  children,
}: {
  title: string;
  ctx: ReportCtx;
  /** `range` shows From + To; `asof` shows a single "As at" date. */
  mode: "range" | "asof";
  showColumns?: "pl" | "bs";
  extraControls?: ReactNode;
  toolbarActions?: ReactNode;
  /** Standard financial statements use a consolidated export menu instead of print controls. */
  hidePrint?: boolean;
  headerPresentation?: ReportPresentation | undefined;
  capturedAt?: string | undefined;
  getCsv?: () => CsvExport | null;
  basis?: string | undefined;
  children: ReactNode;
}) {
  useReportActivity(
    ctx.companyId,
    ctx.reportId,
    undefined,
    mode === "asof" ? ctx.to : ctx.from,
    ctx.to,
    ctx.search,
  );
  const fmt = useFormat();
  const navigate = useNavigate();
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    void navigate({ to: "/reports", search: { tab: "standard", from: ctx.from, to: ctx.to } });
  };
  const canExport = useCanDo("reports.export");
  const exportFn = useServerFn(exportVisibleReport);
  const fileExport = useMutation({
    mutationFn: (format: "pdf" | "xlsx" | "csv") => {
      const csv = getCsv?.();
      if (!csv) throw new Error("Load the report before exporting");
      return exportFn({
        data: {
          companyId: ctx.companyId,
          reportId: ctx.reportId ?? title,
          title,
          companyName: ctx.companyName,
          currency: ctx.currency,
          from: ctx.from,
          to: ctx.to,
          basis: csv.basis ?? basis ?? "",
          headers: csv.headers,
          rows: csv.rows.map((row) => row.map((cell) => (cell == null ? "" : String(cell)))),
          format,
        },
      });
    },
    onSuccess: downloadReportFile,
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const period =
    mode === "asof" ? `As at ${fmt.date(ctx.to)}` : `${fmt.date(ctx.from)} to ${fmt.date(ctx.to)}`;

  return (
    <div className="report-shell space-y-4">
      <div className="print:hidden">
        <Button size="sm" variant="ghost" onClick={handleBack}>
          <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
          Back
        </Button>
      </div>
      {/* Shared report header: identical on screen, print and PDF */}
      <header
        className="print:mb-4"
        style={{ textAlign: headerPresentation?.headerAlignment ?? "center" }}
      >
        {(() => {
          const company =
            headerPresentation?.showCompanyName === false ? null : (
              <p key="company" className="text-sm text-muted-foreground">
                {ctx.companyName}
              </p>
            );
          const titleLine =
            headerPresentation?.showReportTitle === false ? null : (
              <h1 key="title" className="text-2xl font-semibold tracking-tight">
                {title}
              </h1>
            );
          return headerPresentation?.headerOrder === "title-first" ? (
            <>
              {titleLine}
              {company}
            </>
          ) : (
            <>
              {company}
              {titleLine}
            </>
          );
        })()}
        {headerPresentation?.showReportPeriod !== false && (
          <p className="text-sm text-muted-foreground">
            {period} · {ctx.currency}
          </p>
        )}
        {basis ? <p className="text-xs text-muted-foreground">{basis}</p> : null}
        {capturedAt && !Number.isNaN(Date.parse(capturedAt)) && (
          <>
            {headerPresentation?.showDatePrepared && (
              <p className="text-xs text-muted-foreground">
                Prepared: {new Date(capturedAt).toISOString().slice(0, 10)}
              </p>
            )}
            {headerPresentation?.showTimePrepared && (
              <p className="text-xs text-muted-foreground">
                Prepared time: {new Date(capturedAt).toISOString().slice(11, 19)} UTC
              </p>
            )}
          </>
        )}
        {!headerPresentation && (
          <p className="hidden text-xs text-muted-foreground print:block">
            Generated {fmt.dateTime(new Date().toISOString())}
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <ReportPeriodSelect
          from={ctx.from}
          to={ctx.to}
          fyMonth={ctx.fyEndMonth ?? 12}
          fyDay={ctx.fyEndDay ?? 31}
          onChange={(range) => ctx.setSearch(range)}
        />
        {mode === "range" ? (
          <div className="space-y-1">
            <Label htmlFor="report-from">From</Label>
            <Input
              id="report-from"
              type="date"
              value={ctx.from}
              onChange={(e) => e.target.value && ctx.setSearch({ from: e.target.value })}
            />
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="report-to">{mode === "asof" ? "As at" : "To"}</Label>
          <Input
            id="report-to"
            type="date"
            value={ctx.to}
            onChange={(e) => e.target.value && ctx.setSearch({ to: e.target.value })}
          />
        </div>
        {showColumns === "pl" ? (
          <div className="space-y-1">
            <Label htmlFor="report-columns">Columns</Label>
            <select
              id="report-columns"
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:h-11"
              value={ctx.search.columns ?? "none"}
              onChange={(e) =>
                ctx.setSearch({ columns: e.target.value === "none" ? undefined : e.target.value })
              }
            >
              <option value="none">Selected period only</option>
              <option value="prior_period">Compare with prior period</option>
              <option value="prior_year">Compare with prior year</option>
              <option value="month">By month</option>
              <option value="quarter">By quarter</option>
            </select>
          </div>
        ) : null}
        {showColumns === "bs" ? (
          <div className="space-y-1">
            <Label htmlFor="report-compare">Compare</Label>
            <select
              id="report-compare"
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:h-11"
              value={ctx.search.compare ?? "none"}
              onChange={(e) =>
                ctx.setSearch({ compare: e.target.value === "none" ? undefined : e.target.value })
              }
            >
              <option value="none">No comparison</option>
              <option value="prior_month">Prior month end</option>
              <option value="prior_year">Same date last year</option>
              <option value="months">Last 6 month ends</option>
            </select>
          </div>
        ) : null}
        {extraControls}
        <div className="ml-auto flex flex-wrap gap-2">
          {toolbarActions}
          {getCsv && !hidePrint && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canExport || fileExport.isPending}
                  aria-label="Download report"
                >
                  <Download className="mr-2 size-4" aria-hidden="true" />
                  {fileExport.isPending ? "Preparing…" : "Download"}
                  <ChevronDown className="ml-2 size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => fileExport.mutate("pdf")}>
                  PDF document (.pdf)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => fileExport.mutate("xlsx")}>
                  Excel workbook (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => fileExport.mutate("csv")}>
                  CSV data (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <SavedViews ctx={ctx} />

      {children}
    </div>
  );
}

export function ReportPane({
  query,
  isEmpty,
  emptyTitle,
  emptyDescription,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  isEmpty?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
}) {
  if (query.isPending) return <ReportSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load report"
        description={friendlyAuthError(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (isEmpty) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return <>{children}</>;
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent
        className={`text-lg font-semibold tabular-nums ${tone === "bad" ? "text-destructive" : ""}`}
      >
        {value}
      </CardContent>
    </Card>
  );
}

/** Link from a ledger line to the journal behind it. */
export function JournalLink({ journalId, number }: { journalId: string; number: number | string }) {
  if (!journalId) return <span className="font-mono text-xs">#{number}</span>;
  return (
    <Link
      to="/accounting"
      search={{ tab: "journals", journal: journalId }}
      className="font-mono text-xs underline-offset-2 hover:underline"
    >
      #{number}
    </Link>
  );
}

/** Link to the source document of a journal (invoice, bill, ...) when the app has a page for it. */
export function SourceLink({
  type,
  id,
}: {
  type: string | null | undefined;
  id: string | null | undefined;
}) {
  const target = sourceTarget(type, id);
  const label = sourceLabel(type);
  if (!target) return <span className="text-xs text-muted-foreground">{label}</span>;
  const cls = "text-xs underline-offset-2 hover:underline";
  switch (target.kind) {
    case "sales_invoice":
      return (
        <Link to="/sales/invoices/$invoiceId" params={{ invoiceId: target.id }} className={cls}>
          {label}
        </Link>
      );
    case "sales_credit_note":
      return (
        <Link
          to="/sales/credit-notes/$creditNoteId"
          params={{ creditNoteId: target.id }}
          className={cls}
        >
          {label}
        </Link>
      );
    case "purchase_bill":
      return (
        <Link to="/purchases/bills/$billId" params={{ billId: target.id }} className={cls}>
          {label}
        </Link>
      );
    case "purchase_credit_note":
      return (
        <Link
          to="/purchases/credit-notes/$creditNoteId"
          params={{ creditNoteId: target.id }}
          className={cls}
        >
          {label}
        </Link>
      );
    case "expense":
      return (
        <Link to="/purchases/expenses/$expenseId" params={{ expenseId: target.id }} className={cls}>
          {label}
        </Link>
      );
    case "supplier_payment":
      return (
        <Link to="/purchases/payments/$paymentId" params={{ paymentId: target.id }} className={cls}>
          {label}
        </Link>
      );
  }
}

/** Drill-down link to the account transactions report, carrying the period (RP-05). */
export function AccountLink({
  accountId,
  from,
  to,
  children,
}: {
  accountId: string;
  from: string;
  to: string;
  children: ReactNode;
}) {
  if (accountId.startsWith("__")) return <>{children}</>;
  return (
    <Link
      to="/reports/$reportId"
      params={{ reportId: "general-ledger" }}
      search={{ account: accountId, from, to }}
      className="underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

export function PagerBar({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex items-center justify-between text-sm print:hidden">
      <span className="text-muted-foreground">
        {total === 0
          ? "0 rows"
          : `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)} of ${total}`}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
