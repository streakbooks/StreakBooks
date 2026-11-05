import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listPayrollPayslips } from "@/lib/payroll/runs.functions";
import type { PayrollPayslipsListPage } from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { TableCard } from "@/components/common/table-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PayrollPayslipsPage({ runIdFilter }: { runIdFilter?: string | null }) {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const fmt = useFormat();
  const fetchList = useServerFn(listPayrollPayslips);

  const listQ = useQuery({
    queryKey: ["payroll-payslips", company?.id, runIdFilter ?? null],
    queryFn: () =>
      fetchList({
        data: { companyId: company!.id, runId: runIdFilter ?? null },
      }),
    enabled: Boolean(company?.id) && canView,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <>
        <PageHeader title="Payslips" />
        <EmptyState title="No payroll access" description="Ask for payroll.view permission." />
      </>
    );
  }
  if (listQ.isPending) return <LoadingState />;
  if (listQ.isError) {
    return (
      <ErrorState
        title="Could not load payslips"
        description={friendlyAuthError(listQ.error)}
        onRetry={() => listQ.refetch()}
      />
    );
  }

  const list = listQ.data as PayrollPayslipsListPage;

  return (
    <>
      <PageHeader
        title="Payslips"
        description="Issued payslips from approved payroll runs."
        actions={
          runIdFilter ? (
            <Link
              to="/payroll/runs/$runId"
              params={{ runId: runIdFilter }}
              className="text-sm text-primary hover:underline"
            >
              Back to run
            </Link>
          ) : null
        }
      />
      <PayrollSubnav current="payslips" />

      {!list.available ? (
        <Alert>
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{list.migrationMessage}</AlertDescription>
        </Alert>
      ) : list.payslips.length === 0 ? (
        <EmptyState
          title="No payslips yet"
          description="Approve a payroll run to generate payslips for each employee."
          action={
            <Button asChild size="sm">
              <Link to="/payroll/runs">Go to runs</Link>
            </Button>
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payslip</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.payslips.map(({ payslip, employee, run }) => (
                <TableRow key={payslip.id}>
                  <TableCell>
                    <Link
                      to="/payroll/payslips/$payslipId"
                      params={{ payslipId: payslip.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {payslip.payslip_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {employee.first_name} {employee.last_name}
                    <div className="text-xs text-muted-foreground">{employee.employee_number}</div>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/payroll/runs/$runId"
                      params={{ runId: run.id }}
                      className="text-sm hover:underline"
                    >
                      {run.run_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmt.date(run.period_start)} – {fmt.date(run.period_end)}
                  </TableCell>
                  <TableCell className="text-sm">{fmt.dateTime(payslip.issued_at)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{payslip.payment_status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmt.money(payslip.snapshot.totals?.netPayMinor ?? 0, run.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </>
  );
}
