import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTaxGlComparison } from "@/lib/tax/tax-return.functions";
import { TaxGlReviewPanel } from "@/components/tax/TaxGlReviewPanel";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useFormat } from "@/hooks/use-format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/common/states";

type Basis = "cash" | "accrual";

/** Opt-in diagnostic: no extra GL query unless the user opens this comparison. */
export function TaxGlComparisonPanel({
  companyId,
  periodStart,
  periodEnd,
  basis,
}: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  basis: Basis;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const canViewGl = useCanDo("accounting.view");
  const fetchComparison = useServerFn(getTaxGlComparison);
  const f = useFormat();
  const query = useQuery({
    queryKey: ["tax-gl-compare", companyId, periodStart, periodEnd, basis],
    enabled: expanded && canViewGl,
    queryFn: () =>
      fetchComparison({
        data: { companyId, periodStart, periodEnd, basis },
      }),
  });

  const result = query.data;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Tax return / GL comparison</CardTitle>
          <p className="text-xs text-muted-foreground">
            Read-only review of tax source documents against posted control-account activity.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!canViewGl}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Hide comparison" : "Review GL activity"}
        </Button>
      </CardHeader>
      {expanded ? (
        <CardContent className="space-y-4">
          {!canViewGl ? (
            <p className="text-xs text-muted-foreground">Accounting view permission is required.</p>
          ) : query.isPending ? (
            <LoadingState />
          ) : query.isError ? (
            <ErrorState
              title="GL comparison could not be loaded"
              description={friendlyAuthError(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : result?.available === false ? (
            <Alert>
              <AlertTitle>GL account mappings required</AlertTitle>
              <AlertDescription>
                {result.reason} Set them under the Tax / GL mappings tab.
              </AlertDescription>
            </Alert>
          ) : result?.available === true ? (
            <>
              <p className="text-sm text-muted-foreground">
                Period: {f.date(result.periodStart)} to {f.date(result.periodEnd)} ·
                {result.journalLines} control-account journal lines
              </p>
              {result.basis === "cash" ? (
                <Alert>
                  <AlertTitle>Cash basis — informational comparison only</AlertTitle>
                  <AlertDescription>
                    Tax return recognition follows payments, while these GL movements follow journal
                    dates. The difference is not a cash-basis reconciliation result.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Movement</TableHead>
                      <TableHead className="text-right">Output tax</TableHead>
                      <TableHead className="text-right">Input tax</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(
                      [
                        ["Return calculation", "returnMinor"],
                        ["Posted source documents", "documentMinor"],
                        ["Reversal journals", "reversalMinor"],
                        ["Other GL activity", "otherMinor"],
                        ["All GL movements", "totalMinor"],
                        ["Document + reversal − return", "documentAndReversalDifferenceMinor"],
                      ] as const
                    ).map(([label, field]) => (
                      <TableRow key={field}>
                        <TableCell>{label}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.money(result.output[field], result.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.money(result.input[field], result.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-1 rounded-md border p-3 text-sm">
                <p className="font-medium">Net tax payable comparison</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <p>
                    Calculated return:{" "}
                    <strong>{f.money(result.netReturnMinor, result.currency)}</strong>
                  </p>
                  <p>
                    Document and reversal journals:{" "}
                    <strong>{f.money(result.netDocumentAndReversalMinor, result.currency)}</strong>
                  </p>
                  <p>
                    All GL movements:{" "}
                    <strong>{f.money(result.netAllGlMinor, result.currency)}</strong>
                  </p>
                  <p>
                    Diagnostic difference:{" "}
                    <strong>{f.money(result.netDiagnosticDifferenceMinor, result.currency)}</strong>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  A zero difference is not proof of statutory compliance or a completed
                  reconciliation.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Output tax shows credits less debits; input tax shows debits less credits. The
                comparison is based only on the two configured accounts. No reconciliation
                adjustment is posted.
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                {result.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
              <div className="space-y-3">
                <Button size="sm" variant="outline" onClick={() => setShowEvidence((v) => !v)}>
                  {showEvidence
                    ? "Hide journal evidence"
                    : `Show journal evidence (${result.evidence.total})`}
                </Button>
                {showEvidence ? (
                  <div className="space-y-2 overflow-x-auto">
                    {result.evidence.truncated ? (
                      <p className="text-xs text-muted-foreground">
                        Showing the latest 100 journal lines only. Open Accounting for the complete
                        ledger.
                      </p>
                    ) : null}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date / Journal</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Signed GL movement</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.evidence.rows.map((entry) => (
                          <TableRow key={entry.lineId}>
                            <TableCell>
                              {entry.journalId ? (
                                <Link
                                  to="/accounting"
                                  search={{ tab: "journals", journal: entry.journalId }}
                                  className="underline"
                                >
                                  {f.date(entry.journalDate)} · #{entry.journalNumber}
                                </Link>
                              ) : (
                                f.date(entry.journalDate)
                              )}
                            </TableCell>
                            <TableCell>
                              {entry.accountCode} · {entry.accountName} ({entry.accountSide})
                            </TableCell>
                            <TableCell>{entry.sourceType.replaceAll("_", " ")}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {f.money(entry.movementMinor, result.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
              <TaxGlReviewPanel
                companyId={companyId}
                periodStart={result.periodStart}
                periodEnd={result.periodEnd}
                basis={result.basis}
                outputAccountId={result.outputAccountId}
                inputAccountId={result.inputAccountId}
                snapshot={result.snapshot}
              />
              <Button size="sm" variant="outline" asChild>
                <Link to="/reports/$reportId" params={{ reportId: "tax-summary" }}>
                  Open detailed GL Tax Summary
                </Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
                Refresh posted activity
              </Button>
            </>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
