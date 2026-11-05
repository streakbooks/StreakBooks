import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  type PayslipSnapshot,
  payslipDeductions,
  payslipEarnings,
  payslipEmployerLines,
} from "@/lib/payroll/payslip-snapshot";
import { getPayrollPayslipPage } from "@/lib/payroll/runs.functions";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function parseSnapshot(raw: PayslipSnapshot): PayslipSnapshot | null {
  if (raw.version !== 1) return null;
  return raw;
}

export function PayrollPayslipDetailPage({ payslipId }: { payslipId: string }) {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const fmt = useFormat();
  const fetchPage = useServerFn(getPayrollPayslipPage);

  const pageQ = useQuery({
    queryKey: ["payroll-payslip", company?.id, payslipId],
    queryFn: () => fetchPage({ data: { companyId: company!.id, payslipId } }),
    enabled: Boolean(company?.id) && canView,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <>
        <PageHeader title="Payslip" />
        <EmptyState title="No payroll access" description="Ask for payroll.view permission." />
      </>
    );
  }
  if (pageQ.isPending) return <LoadingState />;
  if (pageQ.isError) {
    return (
      <ErrorState
        title="Could not load payslip"
        description={friendlyAuthError(pageQ.error)}
        onRetry={() => pageQ.refetch()}
      />
    );
  }

  const { payslip, run } = pageQ.data;
  const snapshot = parseSnapshot(payslip.snapshot as PayslipSnapshot);
  const currency = snapshot?.branding.currency ?? run.currency;
  const earnings = snapshot ? payslipEarnings(snapshot) : [];
  const deductions = snapshot ? payslipDeductions(snapshot) : [];
  const employer = snapshot ? payslipEmployerLines(snapshot) : [];
  const totals = snapshot?.totals;

  return (
    <>
      <style>{`
        @media print {
          nav[aria-label="Payroll sections"],
          header,
          .payslip-no-print { display: none !important; }
          .payslip-print-area { box-shadow: none !important; border: none !important; }
        }
      `}</style>
      <PageHeader
        title={payslip.payslip_number}
        description={`Pay run ${run.run_number}`}
        actions={
          <div className="payslip-no-print flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/payroll/payslips">All payslips</Link>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        }
      />
      <div className="payslip-no-print">
        <PayrollSubnav current="payslips" />
      </div>

      <article className="payslip-print-area mx-auto max-w-3xl rounded-lg border bg-card p-8 shadow-sm">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {snapshot?.branding.brandingName ?? snapshot?.branding.companyName ?? company.name}
            </h2>
            <p className="text-sm text-muted-foreground">Payslip · {payslip.payslip_number}</p>
          </div>
          <div className="text-right text-sm">
            <p>
              Period: {fmt.date(run.period_start)} – {fmt.date(run.period_end)}
            </p>
            <p>Payment date: {fmt.date(run.payment_date)}</p>
            <p>Issued: {fmt.dateTime(payslip.issued_at)}</p>
          </div>
        </header>

        {snapshot ? (
          <div className="mb-6 text-sm">
            <p className="font-medium">{snapshot.employee.displayName}</p>
            <p className="text-muted-foreground">{snapshot.employee.employeeNumber}</p>
            {snapshot.employee.department ? (
              <p className="text-muted-foreground">{snapshot.employee.department}</p>
            ) : null}
          </div>
        ) : null}

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Earnings
          </h3>
          <ul className="space-y-1 text-sm">
            {earnings.map((line) => (
              <li key={line.code} className="flex justify-between gap-4">
                <span>{line.name}</span>
                <span className="font-mono">{fmt.money(line.amountMinor, currency)}</span>
              </li>
            ))}
            {earnings.length === 0 ? (
              <li className="text-muted-foreground">No earnings lines</li>
            ) : null}
          </ul>
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Deductions
          </h3>
          <ul className="space-y-1 text-sm">
            {deductions.map((line) => (
              <li key={line.code} className="flex justify-between gap-4">
                <span>{line.name}</span>
                <span className="font-mono">{fmt.money(line.amountMinor, currency)}</span>
              </li>
            ))}
            {deductions.length === 0 ? (
              <li className="text-muted-foreground">No deductions</li>
            ) : null}
          </ul>
        </section>

        {snapshot?.branding.showEmployerCosts && employer.length > 0 ? (
          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Employer contributions
            </h3>
            <ul className="space-y-1 text-sm">
              {employer.map((line) => (
                <li key={line.code} className="flex justify-between gap-4">
                  <span>{line.name}</span>
                  <span className="font-mono">{fmt.money(line.amountMinor, currency)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Separator className="my-4" />

        {totals ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">Gross earnings</dt>
              <dd className="font-mono font-medium">
                {fmt.money(totals.grossEarningsMinor, currency)}
              </dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">Total deductions</dt>
              <dd className="font-mono font-medium">
                {fmt.money(totals.employeeDeductionsMinor, currency)}
              </dd>
            </div>
            <div className="flex justify-between border-t pt-2 sm:col-span-2 sm:block">
              <dt className="text-base font-semibold">Net pay</dt>
              <dd className="font-mono text-lg font-semibold">
                {fmt.money(totals.netPayMinor, currency)}
              </dd>
            </div>
          </dl>
        ) : null}

        {payslip.footer_note || snapshot?.branding.footerNote ? (
          <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
            {payslip.footer_note ?? snapshot?.branding.footerNote}
          </footer>
        ) : null}
      </article>
    </>
  );
}
