import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { auditFxRevaluationLedger } from "@/lib/accounting/fx-revaluation-ledger-audit.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";

/** One on-demand period-end audit, attached to its existing revaluation history row. */
export function FxRevaluationLedgerAudit({
  companyId,
  runId,
}: {
  companyId: string;
  runId: string;
}) {
  const fetchAudit = useServerFn(auditFxRevaluationLedger);
  const audit = useMutation({
    mutationFn: () => fetchAudit({ data: { companyId, runId } }),
  });

  return (
    <div className="my-2 space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={audit.isPending}
          onClick={() => audit.mutate()}
        >
          {audit.isPending ? "Checking journals…" : "Audit GL & reversals"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Read-only: posted amounts, currency accounts, and scheduled reversals.
        </span>
      </div>
      {audit.isError ? (
        <p className="text-destructive" role="alert">
          Journal audit unavailable: {friendlyAuthError(audit.error)}
        </p>
      ) : null}
      {audit.data ? (
        <div className="space-y-2">
          <p role="status">
            {audit.data.journalCount} journal(s) checked · {audit.data.exceptionCount} exception(s)
            · {audit.data.reversedCount} fully reversed
          </p>
          <p className="text-xs text-muted-foreground">
            Unrealised gains: expected {audit.data.expectedGainMinor ?? "unavailable"} · verified{" "}
            {audit.data.actualGainMinor ?? "unavailable"} base minor units. Losses: expected{" "}
            {audit.data.expectedLossMinor ?? "unavailable"} · verified{" "}
            {audit.data.actualLossMinor ?? "unavailable"} base minor units.
          </p>
          {audit.data.differences.map((difference) => (
            <p key={difference} className="text-destructive" role="alert">
              {difference}
            </p>
          ))}
          {audit.data.items.map((item) => (
            <div key={item.journalId} className="space-y-1 rounded-md bg-muted/50 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={item.status === "exception" ? "text-destructive" : ""}>
                  {item.currencyCode ?? "Unknown currency"} · {item.status} · reversal{" "}
                  {item.reversalStatus ?? "unavailable"}
                </span>
                <Link
                  className="text-primary underline"
                  to="/accounting"
                  search={{ tab: "journals", journal: item.journalId }}
                >
                  View journal
                </Link>
              </div>
              {item.issues.map((issue) => (
                <p key={issue} className="text-destructive" role="alert">
                  {issue}
                </p>
              ))}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Journal integrity audit only. It does not recalculate foreign-currency balances at
            historical exchange rates or certify the full trial balance.
          </p>
        </div>
      ) : null}
    </div>
  );
}
