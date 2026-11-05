import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { auditRecentRealisedFx } from "@/lib/accounting/fx-ledger-audit.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FxRealisedLedgerAudit({ companyId }: { companyId: string }) {
  const load = useServerFn(auditRecentRealisedFx);
  const audit = useMutation({
    mutationFn: () => load({ data: { companyId } }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Realised FX journal integrity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={audit.isPending}
            onClick={() => audit.mutate()}
          >
            {audit.isPending ? "Checking FX journals…" : "Audit recent FX journals"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Read-only comparison with posted journal lines, allocation references and FX tags.
          </span>
        </div>
        {audit.isError ? (
          <p className="text-destructive" role="alert">
            Could not audit FX journals: {friendlyAuthError(audit.error)}
          </p>
        ) : null}
        {audit.data ? (
          <div className="space-y-2">
            <p role="status">
              {audit.data.rowsChecked} of the most recent {audit.data.limit} eligible FX postings
              checked · {audit.data.exceptions} requiring review
              {audit.data.hasMore ? " · More history exists beyond this sample" : ""}
            </p>
            {audit.data.rows
              .filter((row) => row.status !== "matched")
              .map((row) => (
                <div key={row.recordId} className="rounded-md border p-2">
                  <p className="font-medium">
                    {row.currencyCode} · {row.status} · gain/loss{" "}
                    {row.gainLossMinor ?? "unavailable"} base minor units
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {row.journalId ? `Journal ${row.journalId}` : "Linked journal unavailable"}
                  </p>
                  {row.issues.map((issue) => (
                    <p key={issue} className="text-destructive">
                      {issue}
                    </p>
                  ))}
                </div>
              ))}
            <p className="text-xs text-muted-foreground">
              Reversed entries require review but are not necessarily errors. This does not verify
              the underlying document-rate calculation or complete account-level FX balances.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
