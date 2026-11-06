import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, RefreshCw, Search } from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { todayIso } from "@/lib/accounting/fiscal-year";
import { isReportDate } from "@/lib/reports/date-validation";
import { getFixedAssetReconciliation } from "@/lib/fixed-assets/reconciliation.functions";
import { fixedAssetReconciliationCsv } from "@/lib/fixed-assets/reconciliation";
import {
  explainReconciliationDifference,
  selectReconciliationReviewRows,
  summarizeReconciliationExceptions,
} from "@/lib/fixed-assets/reconciliation-review";
import { ErrorState, LoadingState } from "@/components/common/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ViewStatus = "all" | "variance" | "matched";

export function AssetReconciliationPanel({ companyId }: { companyId: string }) {
  const fmt = useFormat();
  const today = useMemo(() => todayIso(), []);
  const [asOf, setAsOf] = useState(today);
  const [filter, setFilter] = useState<ViewStatus>("all");
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<"account" | "largest_difference">("largest_difference");
  const [page, setPage] = useState(0);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const validDate = isReportDate(asOf) && asOf <= today;
  const fetchReport = useServerFn(getFixedAssetReconciliation);
  const report = useQuery({
    queryKey: ["fixed-assets", companyId, "reconciliation", asOf],
    enabled: Boolean(companyId) && validDate,
    queryFn: () => fetchReport({ data: { companyId, asOf } }),
  });
  const currentReport = report.data?.asOf === asOf ? report.data : null;
  const reviewed = useMemo(() => {
    if (!currentReport) return { rows: [], summary: null, issue: null as string | null };
    try {
      return {
        rows: selectReconciliationReviewRows(currentReport.rows, {
          status: filter, query: search, order,
        }),
        summary: summarizeReconciliationExceptions(currentReport.rows),
        issue: null as string | null,
      };
    } catch (error) {
      return {
        rows: [],
        summary: null,
        issue: error instanceof Error ? error.message : "Invalid reconciliation data.",
      };
    }
  }, [currentReport, filter, search, order]);
  const rows = reviewed.rows;
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const shown = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const explained = shown.find((row) => row.accountId === expandedAccount) ?? null;
  const exportCsv = () => {
    if (!currentReport || report.isFetching || !validDate || reviewed.issue) return;
    const csv = fixedAssetReconciliationCsv(currentReport, rows);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "linkbooks-fixed-asset-reconciliation-" + asOf + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="space-y-1">
          <Label htmlFor="fixed-assets-reconcile-date">As at</Label>
          <Input
            id="fixed-assets-reconcile-date"
            type="date"
            value={asOf}
            max={today}
            aria-invalid={!validDate}
            onChange={(event) => {
              setAsOf(event.target.value);
              setPage(0);
              setExpandedAccount(null);
            }}
            className="w-48"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fixed-assets-reconcile-status">Show</Label>
          {/* lookup-fixed-enum: Three static reconciliation status options. */}
          <select
            id="fixed-assets-reconcile-status"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as ViewStatus);
              setPage(0);
              setExpandedAccount(null);
            }}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All accounts</option>
            <option value="variance">Differences only</option>
            <option value="matched">Matching only</option>
          </select>
        </div>
        <div className="relative min-w-48 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search reconciliation GL accounts"
            className="pl-9"
            placeholder="Account code or name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
              setExpandedAccount(null);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="asset-reconcile-order">Order</Label>
          <select
            id="asset-reconcile-order"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={order}
            onChange={(event) => {
              setOrder(event.target.value as typeof order);
              setPage(0);
              setExpandedAccount(null);
            }}
          >
            <option value="largest_difference">Largest differences first</option>
            <option value="account">GL account code</option>
          </select>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={report.isFetching || !validDate}
          onClick={() => void report.refetch()}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!currentReport || report.isFetching || reviewed.issue !== null || !validDate}
          onClick={exportCsv}
        >
          <Download className="mr-2 size-4" />
          Export filtered CSV
        </Button>
        <p className="max-w-xl text-xs text-muted-foreground">
          Read-only comparison of register cost and accumulated depreciation against posted GL
          balances in the organisation base currency. Debit balances are positive, credit balances
          negative. It never creates an adjustment.
        </p>
      </div>
      {!validDate ? (
        <Alert variant="destructive">
          <AlertDescription>Choose a valid calendar date on or before today.</AlertDescription>
        </Alert>
      ) : report.isPending ? (
        <LoadingState />
      ) : report.isError ? (
        <ErrorState
          title="Could not reconcile fixed assets"
          description={friendlyAuthError(report.error)}
          onRetry={() => void report.refetch()}
        />
      ) : reviewed.issue ? (
        <Alert variant="destructive">
          <AlertDescription>Reconciliation data requires review: {reviewed.issue}</AlertDescription>
        </Alert>
      ) : currentReport && reviewed.summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Registered assets", value: String(currentReport.registeredAssetCount) },
              { label: "Accounts compared", value: String(currentReport.rows.length) },
              { label: "Matching accounts", value: String(currentReport.matchedCount) },
              { label: "Accounts with differences", value: String(currentReport.varianceCount) },
            ].map((metric) => (
              <div className="rounded-lg border bg-card p-4" key={metric.label}>
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{metric.value}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Net difference (GL minus register):{" "}
            <strong className="tabular-nums">
              {fmt.money(currentReport.netDifferenceMinor, currentReport.currency)}
            </strong>
            . Differences across accounts can offset; inspect individual rows, not only the net.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Gross absolute differences",
                value: fmt.money(reviewed.summary.grossDifferenceMinor, currentReport.currency),
                description: "Differences do not offset each other",
              },
              {
                label: "GL greater than register",
                value: String(reviewed.summary.glGreater),
                description: "Accounts with higher posted GL net debit",
              },
              {
                label: "GL lower than register",
                value: String(reviewed.summary.glLower),
                description: "Accounts with lower posted GL net debit",
              },
            ].map((item) => (
              <div key={item.label} className="min-w-0 rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 break-words text-lg font-semibold tabular-nums">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
          {currentReport.varianceCount > 0 ? (
            <Alert>
              <AlertDescription>
                {currentReport.varianceCount} account
                {currentReport.varianceCount === 1 ? " needs" : "s need"} review. Differences may
                arise from uncategorised capital purchases, opening-balance journals, disposals,
                account mapping or other legitimate GL movements. Do not post a balancing journal
                without investigating the source transactions.
              </AlertDescription>
            </Alert>
          ) : null}
          {rows.length === 0 ? (
            <p className="rounded-lg border p-6 text-sm text-muted-foreground">
              {currentReport.rows.length === 0
                ? "No registered fixed-asset accounts were found for this date."
                : "No accounts match the selected status."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GL account</TableHead>
                    <TableHead className="text-right">Register cost</TableHead>
                    <TableHead className="text-right">Register accumulated</TableHead>
                    <TableHead className="text-right">Register net</TableHead>
                    <TableHead className="text-right">Posted GL net</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Explore</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.accountCode}
                        </span>{" "}
                        <span className="font-medium">{row.accountName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {row.linkedAssets} currently linked asset
                          {row.linkedAssets === 1 ? "" : "s"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(row.registerCostMinor, currentReport.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(row.registerAccumulatedMinor, currentReport.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(row.registerNetMinor, currentReport.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(row.ledgerNetMinor, currentReport.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(row.differenceMinor, currentReport.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "matched" ? "secondary" : "outline"}>
                          {row.status === "matched" ? "Matches" : "Review"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            aria-expanded={expandedAccount === row.accountId}
                            onClick={() =>
                              setExpandedAccount((id) => id === row.accountId ? null : row.accountId)
                            }
                          >
                            Explain
                          </Button>
                        <Button variant="link" size="sm" asChild>
                          <Link
                            to="/reports/$reportId"
                            params={{ reportId: "general-ledger" }}
                            search={{
                              account: row.accountId,
                              // Match the reconciliation's inception-to-date ledger, not the
                              // reports page's default current fiscal-year range.
                              from: "0001-01-01",
                              to: asOf,
                              basis: "accrual",
                            }}
                          >
                            GL entries
                          </Link>
                        </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {pages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Page {currentPage + 1} of {pages}, {rows.length} accounts match filters
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  disabled={currentPage === 0}
                  onClick={() => { setPage(currentPage - 1); setExpandedAccount(null); }}
                >Previous</Button>
                <Button size="sm" variant="outline"
                  disabled={currentPage >= pages - 1}
                  onClick={() => { setPage(currentPage + 1); setExpandedAccount(null); }}
                >Next</Button>
              </div>
            </div>
          ) : null}
          {explained ? (
            <section className="space-y-2 rounded-lg border bg-muted/20 p-4" aria-live="polite">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {explained.accountCode} · {explained.accountName}
                  </h3>
                  <p className="text-sm font-medium">
                    {explainReconciliationDifference(explained.differenceMinor).heading}
                  </p>
                </div>
                <Button size="sm" variant="ghost"
                  onClick={() => setExpandedAccount(null)}>Close explanation</Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {explainReconciliationDifference(explained.differenceMinor).explanation}
              </p>
              <p className="text-xs text-muted-foreground">
                Difference = posted GL debit minus credit, less register cost minus
                accumulated depreciation. Review GL entries, linked assets, opening balances,
                manual adjustments and disposal dates. This is a read-only explanation:
                there is no automatic journal or recorded approval.
              </p>
            </section>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Scope: {currentReport.scope}. As-at values reflect the current stored asset mapping,
            historical purchases, accumulated depreciation and disposal dates. This comparison
            is not an atomic posting snapshot, does not prove that every capital purchase has a
            register entry and does not reconcile tax depreciation. Recheck if posting changes
            occur during the review.
          </p>
        </>
      ) : null}
    </div>
  );
}
