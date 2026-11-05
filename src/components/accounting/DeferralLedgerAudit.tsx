import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { auditDeferralLedger } from "@/lib/accounting/deferral-ledger-audit.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";

export function DeferralLedgerAudit({
  companyId,
  scheduleId,
}: {
  companyId: string;
  scheduleId: string;
}) {
  const load = useServerFn(auditDeferralLedger);
  const audit = useMutation({
    mutationFn: () => load({ data: { companyId, scheduleId } }),
  });

  return (
    <div className="my-3 space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={audit.isPending}
          onClick={() => audit.mutate()}
        >
          {audit.isPending ? "Auditing journals…" : "Audit linked recognition journals"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Read-only check of linked posted journal lines, not the original bill or invoice.
        </span>
      </div>
      {audit.isError ? (
        <p className="text-destructive" role="alert">
          Audit unavailable: {friendlyAuthError(audit.error)}
        </p>
      ) : null}
      {audit.data ? (
        <div className="space-y-2">
          <p role="status">
            {audit.data.entries.length} recognition periods checked · {audit.data.exceptionCount}{" "}
            exception(s) · allocation difference {audit.data.differenceMinor ?? "unavailable"}{" "}
            minor units
          </p>
          {audit.data.scheduleIssues.map((issue) => (
            <p key={issue} className="text-destructive" role="alert">
              {issue}
            </p>
          ))}
          {audit.data.entries.filter((entry) => entry.status !== "matched").map((entry) => (
            <div key={entry.entryId} className="rounded-md bg-muted/50 p-2">
              Period {entry.periodNo}: {entry.status}
              {entry.journalId ? ` · Journal ${entry.journalId}` : ""}
              {entry.issues.map((issue) => (
                <p key={issue} className="text-destructive">
                  {issue}
                </p>
              ))}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            A reversed recognition requires review even if its original journal balanced.
            This audit does not establish the balance of the source deferral account.
          </p>
        </div>
      ) : null}
    </div>
  );
}
