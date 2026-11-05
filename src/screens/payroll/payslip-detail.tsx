import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { documentFileName } from "@/lib/documents/helpers";
import {
  type PayslipSnapshot,
  payslipDeductions,
  payslipEarnings,
  payslipEmployerLines,
} from "@/lib/payroll/payslip-snapshot";
import { getPayrollPayslipPage } from "@/lib/payroll/runs.functions";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { PRINT_CSS } from "@/components/documents/DocumentSheet";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";

function parseSnapshot(raw: PayslipSnapshot): PayslipSnapshot | null {
  if (raw.version !== 1) return null;
  return raw;
}

function PayslipLineTable({
  rows,
  currency,
  fmtMoney,
}: {
  rows: { code: string; name: string; amountMinor: number }[];
  currency: string;
  fmtMoney: (minor: number, code: string) => string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">None</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="pb-1 text-left font-semibold text-muted-foreground">Description</th>
          <th className="num pb-1 text-right font-semibold text-muted-foreground">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((line) => (
          <tr key={line.code} className="doc-keep">
            <td className="py-1 pr-4">{line.name}</td>
            <td className="num py-1 font-mono">{fmtMoney(line.amountMinor, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
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

  const printFileName = useMemo(() => {
    if (!pageQ.data) return null;
    return documentFileName("Payslip", pageQ.data.payslip.payslip_number, payslipId);
  }, [pageQ.data, payslipId]);

  useEffect(() => {
    if (!printFileName) return;
    const previous = document.title;
    document.title = printFileName;
    return () => {
      document.title = previous;
    };
  }, [printFileName]);

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
  const brandingName =
    snapshot?.branding.brandingName ?? snapshot?.branding.companyName ?? company.name;
  const footerNote = payslip.footer_note ?? snapshot?.branding.footerNote;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={payslip.payslip_number}
          description={`Pay run ${run.run_number}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/payroll/payslips">All payslips</Link>
              </Button>
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print / Save as PDF
              </Button>
            </div>
          }
        />
        <PayrollSubnav current="payslips" />
        <p className="mb-4 hidden text-xs text-muted-foreground sm:block">
          In the print dialog choose &ldquo;Save as PDF&rdquo; as the destination to download a PDF.
        </p>
      </div>

      <article className="doc-sheet relative mx-auto max-w-[820px] rounded-md border border-border bg-card p-8 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <style>{PRINT_CSS}</style>
        <header className="doc-keep mb-6 flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-xl font-semibold">{brandingName}</h2>
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
          <div className="doc-keep mb-6 text-sm">
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
          <PayslipLineTable rows={earnings} currency={currency} fmtMoney={fmt.money} />
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Deductions
          </h3>
          <PayslipLineTable rows={deductions} currency={currency} fmtMoney={fmt.money} />
        </section>

        {snapshot?.branding.showEmployerCosts && employer.length > 0 ? (
          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Employer contributions
            </h3>
            <PayslipLineTable rows={employer} currency={currency} fmtMoney={fmt.money} />
          </section>
        ) : null}

        {totals ? (
          <dl className="doc-keep grid gap-2 border-t pt-4 text-sm sm:grid-cols-2">
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

        {footerNote ? (
          <footer className="doc-keep mt-8 border-t pt-4 text-xs text-muted-foreground">
            {footerNote}
          </footer>
        ) : null}
      </article>
    </>
  );
}
