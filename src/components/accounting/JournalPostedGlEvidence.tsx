import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { auditPostedGlEvidence } from "@/lib/accounting/posted-gl-evidence.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";

/** Runs only when requested; never posts or changes accounting data. */
export function JournalPostedGlEvidence({
  companyId,
  journalId,
  status,
}: {
  companyId: string;
  journalId: string;
  status: string;
}) {
  const load = useServerFn(auditPostedGlEvidence);
  const audit = useMutation({
    mutationFn: () => load({ data: { companyId, journalId } }),
  });
  if (status !== "posted") {
    return (
      <p className="text-xs text-muted-foreground">
        A posted GL evidence audit is available after this journal is posted.
      </p>
    );
  }
  return (
    <section
      className="space-y-2 rounded-md border p-3 text-sm"
      aria-label="Posted GL evidence audit"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={audit.isPending}
          onClick={() => audit.mutate()}
        >
          {audit.isPending ? "Checking posted GL…" : "Audit posted GL evidence"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Independent database reads of journal lines, accounts, period and reversal references.
        </span>
      </div>
      {audit.isError ? (
        <p role="alert" className="text-destructive">
          GL audit unavailable: {friendlyAuthError(audit.error)}
        </p>
      ) : null}
      {audit.data ? (
        <div className="space-y-2">
          <p role={audit.data.status === "exceptions" ? "alert" : "status"} className="font-medium">
            {audit.data.status === "passed"
              ? "GL evidence checks passed"
              : audit.data.status === "not_posted"
                ? "Journal is not posted — no GL pass claimed"
                : "GL evidence exceptions require review"}
            {" · "}
            {audit.data.lineCount} lines · {audit.data.accountCount} accounts
          </p>
          <p className="text-xs text-muted-foreground">
            Original currency: {audit.data.currencyCode || "missing"} · Debit:{" "}
            {audit.data.debitMinor ?? "unavailable"} minor units · Credit:{" "}
            {audit.data.creditMinor ?? "unavailable"} minor units
          </p>
          <p className="text-xs text-muted-foreground">
            Accounting period evidence: {audit.data.periodId ?? "not verified"}
            {audit.data.periodStatus ? " · Status: " + audit.data.periodStatus : ""}
          </p>
          {audit.data.issues.length ? (
            <ul className="list-disc space-y-1 pl-5 text-destructive">
              {audit.data.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          ) : null}
          {audit.data.accounts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="p-2">
                      Ledger account
                    </th>
                    <th scope="col" className="p-2 text-right">
                      Debit (minor units)
                    </th>
                    <th scope="col" className="p-2 text-right">
                      Credit (minor units)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.accounts.map((account) => (
                    <tr key={account.accountId} className="border-b">
                      <td className="p-2">
                        {account.code} {account.name}
                      </td>
                      <td className="p-2 text-right font-mono">{account.debitMinor}</td>
                      <td className="p-2 text-right font-mono">{account.creditMinor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            This checks one posted journal's stored GL evidence, not an independently maintained
            ledger, original source document, full subledger balance or FX valuation. A pass is not
            a complete financial-statement reconciliation.
          </p>
        </div>
      ) : null}
    </section>
  );
}
