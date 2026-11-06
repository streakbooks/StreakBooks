import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTaxGlComparison } from "@/lib/tax/tax-return.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useFormat } from "@/hooks/use-format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/common/states";

type Basis = "cash" | "accrual";

/** Opt-in diagnostic: no extra GL query unless the user opens this comparison. */
export function TaxGlComparisonPanel({
  companyId, periodStart, periodEnd, basis,
}: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  basis: Basis;
}) {
  const [expanded, setExpanded] = useState(false);
  const fetchComparison = useServerFn(getTaxGlComparison);
  const f = useFormat();
  const query = useQuery({
    queryKey: ["tax-gl-compare", companyId, periodStart, periodEnd, basis],
    enabled: expanded,
    queryFn: () => fetchComparison({
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
        <Button size="sm" variant="outline" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Hide comparison" : "Review GL activity"}
        </Button>
      </CardHeader>
      {expanded ? (
        <CardContent className="space-y-4">
          {query.isPending ? <LoadingState /> : query.isError ? (
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
                    Tax return recognition follows payments, while these GL movements follow journal dates.
                    The difference is not a cash-basis reconciliation result.
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
                    {([
                      ["Return calculation", "returnMinor"],
                      ["Posted source documents", "documentMinor"],
                      ["Reversal journals", "reversalMinor"],
                      ["Other GL activity", "otherMinor"],
                      ["All GL movements", "totalMinor"],
                      ["Document + reversal − return", "documentAndReversalDifferenceMinor"],
                    ] as const).map(([label, field]) => (
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
                  <p>Calculated return: <strong>{f.money(result.netReturnMinor, result.currency)}</strong></p>
                  <p>Document and reversal journals: <strong>{f.money(result.netDocumentAndReversalMinor, result.currency)}</strong></p>
                  <p>All GL movements: <strong>{f.money(result.netAllGlMinor, result.currency)}</strong></p>
                  <p>Diagnostic difference: <strong>{f.money(result.netDiagnosticDifferenceMinor, result.currency)}</strong></p>
                </div>
                <p className="text-xs text-muted-foreground">
                  A zero difference is not proof of statutory compliance or a completed reconciliation.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Output tax shows credits less debits; input tax shows debits less credits.
                The comparison is based only on the two configured accounts.
                No reconciliation adjustment is posted.
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                {result.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
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
