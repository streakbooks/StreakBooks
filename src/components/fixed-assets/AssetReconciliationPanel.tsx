import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, RefreshCw } from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { todayIso } from "@/lib/accounting/fiscal-year";
import { getFixedAssetReconciliation } from "@/lib/fixed-assets/reconciliation.functions";
import { fixedAssetReconciliationCsv } from "@/lib/fixed-assets/reconciliation";
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
  const fetchReport = useServerFn(getFixedAssetReconciliation);
  const report = useQuery({
    queryKey: ["fixed-assets", companyId, "reconciliation", asOf],
    enabled: Boolean(companyId) && Boolean(asOf) && asOf <= today,
    queryFn: () => fetchReport({ data: { companyId, asOf } }),
  });
  const rows = (report.data?.rows ?? []).filter(
    (row) => filter === "all" || row.status === filter,
  );
  const exportCsv = () => {
    if (!report.data || report.isFetching || report.data.asOf !== asOf) return;
    const csv = fixedAssetReconciliationCsv(report.data, rows);
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
            onChange={(event) => setAsOf(event.target.value)}
            className="w-48"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fixed-assets-reconcile-status">Show</Label>
          <select
            /* lookup-fixed-enum: Three static reconciliation status options. */
            id="fixed-assets-reconcile-status"
            value={filter}
            onChange={(event) => setFilter(event.target.value as ViewStatus)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All accounts</option>
            <option value="variance">Differences only</option>
            <option value="matched">Matching only</option>
          </select>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={report.isFetching || !asOf || asOf > today}
          onClick={() => void report.refetch()}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!report.data || report.isFetching || report.data.asOf !== asOf}
          onClick={exportCsv}
        >
          <Download className="mr-2 size-4" />
          Export visible CSV
        </Button>
        <p className="max-w-xl text-xs text-muted-foreground">
          Read-only comparison of register cost and accumulated depreciation against posted GL
          balances in the organisation base currency. Debit balances are positive, credit balances
          negative. It never creates an adjustment.
        </p>
      </div>
      {!asOf || asOf > today ? (
        <Alert variant="destructive">
          <AlertDescription>Choose a valid date on or before today.</AlertDescription>
        </Alert>
      ) : report.isPending ? (
        <LoadingState />
      ) : report.isError ? (
        <ErrorState
          title="Could not reconcile fixed assets"
          description={friendlyAuthError(report.error)}
          onRetry={() => void report.refetch()}
        />
      ) : report.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Registered assets", value: String(report.data.registeredAssetCount) },
              { label: "Accounts compared", value: String(report.data.rows.length) },
              { label: "Matching accounts", value: String(report.data.matchedCount) },
              { label: "Accounts with differences", value: String(report.data.varianceCount) },
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
              {fmt.money(report.data.netDifferenceMinor, report.data.currency)}
            </strong>
            . Differences across accounts can offset; inspect individual rows, not only the net.
          </p>
          {report.data.varianceCount > 0 ? (
            <Alert>
              <AlertDescription>
                {report.data.varianceCount} account
                {report.data.varianceCount === 1 ? " needs" : "s need"} review. Differences may
                arise from uncategorised capital purchases, opening-balance journals, disposals,
                account mapping or other legitimate GL movements. Do not post a balancing journal
                without investigating the source transactions.
              </AlertDescription>
            </Alert>
          ) : null}
          {rows.length === 0 ? (
            <p className="rounded-lg border p-6 text-sm text-muted-foreground">
              {report.data.rows.length === 0
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
                  {rows.map((row) => (
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
                        {fmt.amount(row.registerCostMinor, report.data.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(row.registerAccumulatedMinor, report.data.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(row.registerNetMinor, report.data.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(row.ledgerNetMinor, report.data.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.amount(row.differenceMinor, report.data.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "matched" ? "secondary" : "outline"}>
                          {row.status === "matched" ? "Matches" : "Review"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="link" size="sm" asChild>
                          <Link
                            to="/reports/$reportId"
                            params={{ reportId: "general-ledger" }}
                            search={{
                              account: row.accountId,
                              to: asOf,
                              basis: "accrual",
                            }}
                          >
                            GL entries
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Scope: {report.data.scope}. As-at values reflect the current stored asset mapping,
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
