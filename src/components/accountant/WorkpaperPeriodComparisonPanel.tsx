import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAccountWorkpapers, listWorkpaperLedger } from "@/lib/accountant/workpapers.functions";
import {
  compareWorkpaperPeriods,
  type ComparedLedgerAccount,
} from "@/lib/accountant/workpaper-period-comparison";
import {
  WORKPAPER_STATE_LABELS,
  type AccountWorkpaper,
  type WorkpaperReviewState,
} from "@/lib/accountant/workpapers";
import { useFormat } from "@/hooks/use-format";
import { toCsv } from "@/lib/sales/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusLabel(state: WorkpaperReviewState | "unsafe" | "not_available"): string {
  if (state === "unsafe") return "Unsafe balance";
  if (state === "not_available") return "Not available";
  return WORKPAPER_STATE_LABELS[state];
}

/**
 * Compare two independently loaded snapshots of the authoritative ledger.
 * Never copies historical evidence, preparation status or review sign-off.
 */
export function WorkpaperPeriodComparisonPanel({
  companyId,
  asOf,
  current,
  currentPapers,
}: {
  companyId: string;
  asOf: string;
  current: ComparedLedgerAccount[];
  currentPapers: AccountWorkpaper[];
}) {
  const fmt = useFormat();
  const [previousAsOf, setPreviousAsOf] = useState("");
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(previousAsOf) &&
    /^\d{4}-\d{2}-\d{2}$/.test(asOf) &&
    previousAsOf < asOf;
  const fetchLedger = useServerFn(listWorkpaperLedger);
  const fetchWorkpapers = useServerFn(listAccountWorkpapers);
  const previousLedger = useQuery({
    queryKey: ["account-workpapers-trial", companyId, previousAsOf],
    enabled: valid,
    queryFn: () => fetchLedger({ data: { companyId, asOf: previousAsOf } }),
  });
  const previousPapers = useQuery({
    queryKey: ["account-workpapers", companyId, previousAsOf],
    enabled: valid,
    queryFn: () => fetchWorkpapers({ data: { companyId, asOf: previousAsOf } }),
  });
  const comparison = useMemo(
    () =>
      valid && previousLedger.data && previousPapers.data
        ? compareWorkpaperPeriods(
            current,
            previousLedger.data.rows as ComparedLedgerAccount[],
            currentPapers,
            previousPapers.data,
          )
        : [],
    [valid, previousLedger.data, previousPapers.data, current, currentPapers],
  );
  const busy = valid && (previousLedger.isPending || previousPapers.isPending);
  const failed = valid && (previousLedger.isError || previousPapers.isError);
  const refresh = () => {
    void previousLedger.refetch();
    void previousPapers.refetch();
  };
  const exportComparison = () => {
    const csv = toCsv(
      [
        "Account code",
        "Account name",
        "Current as of",
        "Previous as of",
        "Current GL minor",
        "Previous GL minor",
        "Signed movement minor",
        "Current review state",
        "Previous review state",
        "Current evidence reference",
        "Previous evidence reference",
        "Review movement",
      ],
      comparison.map((row) => [
        row.code,
        row.name,
        asOf,
        previousAsOf,
        row.currentMinor,
        row.previousMinor,
        row.movementMinor,
        statusLabel(row.currentState),
        statusLabel(row.previousState),
        row.currentEvidenceReference,
        row.previousEvidenceReference,
        row.requiresInvestigation ? "Yes" : "No",
      ]),
    );
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      "linkbooks-workpaper-period-variance-" + previousAsOf + "-to-" + asOf + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-3 rounded-xl border p-4" aria-label="Workpaper period comparison">
      <h3 className="font-semibold">Prior-period balance comparison</h3>
      <p className="text-sm text-muted-foreground">
        Compare the current posted balances against an earlier date, see movement and check whether
        each period has its own supporting workpaper. This is read-only. Earlier sign-offs and
        evidence references are displayed for reference, never copied into the current period.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          Compare with date
          <Input
            type="date"
            aria-label="Prior workpaper comparison date"
            max={asOf}
            value={previousAsOf}
            onChange={(event) => setPreviousAsOf(event.target.value)}
          />
        </label>
        <Button size="sm" variant="outline" disabled={!valid || busy} onClick={refresh}>
          Refresh comparison
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!valid || busy || failed || !comparison.length}
          onClick={exportComparison}
        >
          Export comparison CSV
        </Button>
      </div>
      {previousAsOf && !valid ? (
        <p role="alert" className="text-sm text-destructive">
          Select a comparison date earlier than the current workpaper review date ({asOf}).
        </p>
      ) : null}
      {busy ? <LoadingState /> : null}
      {failed ? (
        <QueryErrorState
          queries={[previousLedger, previousPapers]}
          title="Prior-period comparison unavailable"
        />
      ) : null}
      {valid && !busy && !failed ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{comparison.length} balance-sheet accounts</Badge>
            <Badge variant="secondary">
              {comparison.filter((row) => row.requiresInvestigation).length} needing movement or
              evidence review
            </Badge>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Prior balance</TableHead>
                  <TableHead className="text-right">Current balance</TableHead>
                  <TableHead className="text-right">Movement</TableHead>
                  <TableHead>Prior review</TableHead>
                  <TableHead>Current review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      <strong>{row.code}</strong> {row.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.previousMinor === null ? "—" : fmt.money(row.previousMinor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.currentMinor === null ? "—" : fmt.money(row.currentMinor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.movementMinor === null ? (
                        "Unavailable"
                      ) : row.movementMinor === 0 ? (
                        "—"
                      ) : (
                        <strong>{fmt.money(row.movementMinor)}</strong>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{statusLabel(row.previousState)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.currentState === "reviewed" ? "secondary" : "outline"}>
                        {statusLabel(row.currentState)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Any movement deserves an explanation, even when both dates were independently reviewed.
            Missing historical accounts and unsafe balances are never converted to zero. A signed
            previous workpaper does not approve the new period.
          </p>
        </>
      ) : null}
    </section>
  );
}
