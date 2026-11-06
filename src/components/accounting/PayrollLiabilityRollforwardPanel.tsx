import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPayrollLiabilityRollforward } from "@/lib/accounting/payroll-liability-rollforward.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * One-account period roll-forward of posted base-currency ledger entries.
 * This is an explicit request; it never queries Payroll data on page load.
 */
export function PayrollLiabilityRollforwardPanel({ companyId }: { companyId: string }) {
  const load = useServerFn(getPayrollLiabilityRollforward);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const audit = useMutation({
    mutationFn: () => load({ data: { companyId, from, to } }),
  });
  const report = audit.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payroll liability roll-forward</CardTitle>
        <CardDescription>
          Inspect the configured net-pay liability GL balance from opening to closing date,
          with posted Payroll run/payment source matching. Read-only; company base currency.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="payroll-liability-from">From</Label>
            <Input id="payroll-liability-from" type="date" value={from}
              onChange={(event) => { setFrom(event.target.value); audit.reset(); }}
              className="w-auto" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payroll-liability-to">To</Label>
            <Input id="payroll-liability-to" type="date" value={to}
              onChange={(event) => { setTo(event.target.value); audit.reset(); }}
              className="w-auto" />
          </div>
          <Button type="button" variant="outline" disabled={!from || !to || from > to || audit.isPending}
            onClick={() => audit.mutate()}>
            {audit.isPending ? "Reviewing Payroll liability…" : "Run liability roll-forward"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Choose up to 367 calendar days. Opening is all posted GL activity before From;
          closing is all posted GL activity through To. No ledger entries are modified.
        </p>
        {audit.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Payroll liability audit unavailable: {friendlyAuthError(audit.error)}
          </p>
        ) : null}
        {report ? (
          <div className="space-y-3">
            <p role={report.status === "exceptions" ? "alert" : "status"}
              className={"text-sm font-semibold " +
                (report.status === "exceptions" ? "text-destructive" : "text-foreground")}>
              {report.status === "matched"
                ? "GL roll-forward and available Payroll source matches passed"
                : report.status === "attention"
                  ? "GL roll-forward balanced — review unresolved source or reversal warnings"
                  : "Payroll liability exceptions require investigation"}
              {" · "}{report.start} to {report.end}
            </p>
            <p className="text-xs text-muted-foreground">
              Account {report.accountCode} · {report.accountName} · {report.currency} base-currency minor units
              {" · "}{report.sourceRunCount} runs · {report.paymentCount} payments · {report.lineCount} GL lines
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="px-2 py-1 text-left">Payroll net-pay liability (credit-normal)</th>
                    <th scope="col" className="px-2 py-1 text-right">Base minor units</th>
                  </tr>
                </thead>
                <tbody className="[&_tr]:border-b [&_td]:px-2 [&_td]:py-2">
                  <tr><td>Opening credit balance</td><td className="text-right font-mono">{report.openingCreditMinor}</td></tr>
                  <tr><td>Matched in-period Payroll accruals (+)</td><td className="text-right font-mono">{report.accrualCreditMinor}</td></tr>
                  <tr><td>Matched in-period Payroll payments (−)</td><td className="text-right font-mono">{report.paymentDebitMinor}</td></tr>
                  <tr><td>Reversal net movement (+/−)</td><td className="text-right font-mono">{report.reversalNetCreditMinor}</td></tr>
                  <tr><td>Other/unclassified GL movement (+/−)</td><td className="text-right font-mono">{report.otherNetCreditMinor}</td></tr>
                  <tr className="font-semibold"><td>Closing GL credit balance</td><td className="text-right font-mono">{report.closingCreditMinor}</td></tr>
                  <tr><td>Reconstructed closing balance</td><td className="text-right font-mono">{report.reconstructedClosingCreditMinor}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="space-y-1 rounded-md border p-3 text-xs">
              <p>Expected active Payroll accrual credits: <span className="font-mono">{report.expectedRunAccrualCreditMinor}</span></p>
              <p>Accrual source-to-GL difference: <span className="font-mono">{report.accrualVarianceMinor}</span></p>
              <p>Expected Payroll payment debits: <span className="font-mono">{report.expectedPaymentDebitMinor}</span></p>
              <p>Payment source-to-GL difference: <span className="font-mono">{report.paymentVarianceMinor}</span></p>
              <p className="text-muted-foreground">These totals are only comparable for source items in company base currency.</p>
            </div>
            {report.issues.length ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">{report.issues.length} exceptions</p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                  {report.issues.map((item,i) => (
                    <li key={i}>
                      {item.message}
                      {item.sourceId ? " · Source: " + item.sourceId : ""}
                      {item.journalId ? " · Journal: " + item.journalId : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.warnings.length ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">Further review</p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {report.warnings.map((warning,i) => <li key={i}>{warning}</li>)}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              This is a snapshot of one currently configured liability account, not independent Payroll
              lifetime balance, payslip settlement, bank statement reconciliation, tax compliance,
              or proof of historical account mappings. Reversed Payroll runs can require separate
              investigation; non-base-currency source-to-GL comparisons require FX evidence.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
