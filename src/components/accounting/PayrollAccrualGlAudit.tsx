import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { auditPayrollAccrualGl } from "@/lib/accounting/payroll-accrual-gl-audit.functions";
import { Button } from "@/components/ui/button";

/**
 * Cross-module read-only audit; only available on a payroll-run accrual journal.
 * It does not post, reverse, settle or recalculate payroll.
 */
export function PayrollAccrualGlAudit({
  companyId,
  runId,
  journalId,
}: {
  companyId: string;
  runId: string;
  journalId: string;
}) {
  const auditFn = useServerFn(auditPayrollAccrualGl);
  const audit = useMutation({
    mutationFn: () => auditFn({ data: { companyId, runId, journalId } }),
  });
  return (
    <section className="space-y-2 rounded-md border p-3 text-sm" aria-label="Payroll accrual and GL tie-out">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={audit.isPending}
          onClick={() => audit.mutate()}
        >
          {audit.isPending ? "Checking payroll source…" : "Reconcile Payroll accrual to GL"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Compares this run's included payroll components with its posted accrual journal.
        </span>
      </div>
      {audit.isError ? (
        <p role="alert" className="text-destructive">
          Payroll source audit unavailable: {friendlyAuthError(audit.error)}
        </p>
      ) : null}
      {audit.data ? (
        <div className="space-y-2">
          <p role={audit.data.status === "exceptions" ? "alert" : "status"} className="font-medium">
            {audit.data.status === "matched"
              ? "Payroll accrual matches posted GL evidence"
              : "Payroll accrual and GL have exceptions"}
            {" · "}{audit.data.sourceLineCount} source lines
            {" · "}{audit.data.ledgerLineCount} journal lines
          </p>
          <p className="text-xs text-muted-foreground">
            Currency: {audit.data.currency} (original minor units)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b">
                  <th scope="col" className="p-2">Side</th>
                  <th scope="col" className="p-2 text-right">Expected (minor)</th>
                  <th scope="col" className="p-2 text-right">Posted (minor)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <th scope="row" className="p-2">Debit</th>
                  <td className="p-2 text-right font-mono">{audit.data.expectedDebitMinor}</td>
                  <td className="p-2 text-right font-mono">{audit.data.postedDebitMinor}</td>
                </tr>
                <tr className="border-b">
                  <th scope="row" className="p-2">Credit</th>
                  <td className="p-2 text-right font-mono">{audit.data.expectedCreditMinor}</td>
                  <td className="p-2 text-right font-mono">{audit.data.postedCreditMinor}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {audit.data.issues.length ? (
            <ul className="list-disc space-y-1 pl-5 text-destructive">
              {audit.data.issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          ) : null}
          {audit.data.accounts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="p-2">GL account</th>
                    <th scope="col" className="p-2">Side</th>
                    <th scope="col" className="p-2 text-right">Expected</th>
                    <th scope="col" className="p-2 text-right">Posted</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.accounts.map((row) => (
                    <tr key={row.accountId + row.side} className="border-b">
                      <td className="p-2"><span className="font-medium">{row.accountCode ? row.accountCode + " · " + (row.accountName ?? "") : "Unverified account"}</span><span className="block text-muted-foreground font-mono">{row.accountId}</span></td>
                      <td className="p-2">{row.side}</td>
                      <td className="p-2 text-right font-mono">{row.expectedMinor}</td>
                      <td className={"p-2 text-right font-mono " + (row.matched ? "" : "text-destructive font-semibold")}>
                        {row.postedMinor}{row.matched ? "" : " (differs)"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Read-only source-to-GL accrual check. Does not verify net-pay payments,
            statutory payroll compliance, other ledger postings or exchange-rate valuations.
          </p>
        </div>
      ) : null}
    </section>
  );
}
