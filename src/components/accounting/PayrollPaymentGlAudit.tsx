import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { auditPayrollPaymentGl } from "@/lib/accounting/payroll-payment-gl-audit.functions";
import { Button } from "@/components/ui/button";

/** On-demand read-only Payroll payment and net-pay liability GL review. */
export function PayrollPaymentGlAudit({
  companyId,
  paymentId,
  journalId,
}: {
  companyId: string;
  paymentId: string;
  journalId: string;
}) {
  const load = useServerFn(auditPayrollPaymentGl);
  const audit = useMutation({
    mutationFn: () => load({ data: { companyId, paymentId, journalId } }),
  });
  return (
    <section
      className="space-y-2 rounded-md border p-3 text-sm"
      aria-label="Payroll payment GL reconciliation"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={audit.isPending}
          onClick={() => audit.mutate()}
        >
          {audit.isPending ? "Auditing payroll payment…" : "Reconcile Payroll payment to GL"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Checks payment allocation, net-pay liability, clearing account and linked reversal
          journals.
        </span>
      </div>
      {audit.isError ? (
        <p role="alert" className="text-destructive">
          Payroll payment GL audit unavailable: {friendlyAuthError(audit.error)}
        </p>
      ) : null}
      {audit.data ? (
        <div className="space-y-2">
          <p className="font-medium" role={audit.data.state === "exceptions" ? "alert" : "status"}>
            {audit.data.state === "matched"
              ? "Payroll payment and posted GL match"
              : audit.data.state === "attention"
                ? "Payroll payment matches GL but has unallocated funds"
                : audit.data.state === "reversed"
                  ? "Payroll payment and linked reversal entries match"
                  : "Payroll payment / GL exceptions need review"}
          </p>
          <p className="text-xs text-muted-foreground">
            {audit.data.currency} minor units · Payment: {audit.data.paymentMinor ?? "unavailable"}
            {" · "} Allocated: {audit.data.allocatedMinor ?? "unavailable"}
            {" · "} Unallocated: {audit.data.unallocatedMinor ?? "unavailable"}
            {" · "}
            {audit.data.allocationCount} allocations
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b">
                  <th scope="col" className="p-2">
                    Journal
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Debit (minor)
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Credit (minor)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <th scope="row" className="p-2">
                    Original
                  </th>
                  <td className="p-2 text-right font-mono">
                    {audit.data.originalTotals.debitMinor}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {audit.data.originalTotals.creditMinor}
                  </td>
                </tr>
                {audit.data.reversalTotals ? (
                  <tr className="border-b">
                    <th scope="row" className="p-2">
                      Reversal
                    </th>
                    <td className="p-2 text-right font-mono">
                      {audit.data.reversalTotals.debitMinor}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {audit.data.reversalTotals.creditMinor}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {audit.data.issues.length ? (
            <ul className="list-disc space-y-1 pl-5 text-destructive">
              {audit.data.issues.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : null}
          {audit.data.warnings.length ? (
            <ul className="list-disc space-y-1 pl-5 text-amber-700 dark:text-amber-300">
              {audit.data.warnings.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : null}
          {audit.data.accounts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="p-2">
                      GL account
                    </th>
                    <th scope="col" className="p-2">
                      Side
                    </th>
                    <th scope="col" className="p-2 text-right">
                      Expected / Posted
                    </th>
                    <th scope="col" className="p-2 text-right">
                      Reversal expected / posted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.accounts.map((x) => (
                    <tr className="border-b" key={x.accountId + x.side}>
                      <td className="p-2">
                        {x.code || "Missing account"} {x.name}
                        <span className="block text-muted-foreground font-mono">{x.accountId}</span>
                      </td>
                      <td className="p-2">{x.side}</td>
                      <td
                        className={
                          "p-2 text-right font-mono " +
                          (!x.matched ? "text-destructive font-semibold" : "")
                        }
                      >
                        {x.expectedOriginalMinor} / {x.actualOriginalMinor}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {x.expectedReversalMinor === null
                          ? "—"
                          : x.expectedReversalMinor + " / " + (x.actualReversalMinor ?? "missing")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            This is a single-payment GL audit, not proof of full payroll-run liability settlement,
            cash/bank statement reconciliation or statutory compliance. Current Payroll settings may
            differ from the historical posting configuration.
          </p>
        </div>
      ) : null}
    </section>
  );
}
