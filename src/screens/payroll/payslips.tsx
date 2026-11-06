import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listPayrollPayslips } from "@/lib/payroll/runs.functions";
import type { PayrollPayslipsListPage, PayslipPaymentStatus } from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { TableCard } from "@/components/common/table-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PayrollPayslipsPage({
  runIdFilter,
  paymentStatusFilter,
  employeeIdFilter,
}: {
  runIdFilter?: string | null;
  paymentStatusFilter?: PayslipPaymentStatus | null;
  employeeIdFilter?: string | null;
}) {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const fmt = useFormat();
  const fetchList = useServerFn(listPayrollPayslips);
  const navigate = useNavigate({ from: "/payroll/payslips/" });

  const listQ = useQuery({
    queryKey: ["payroll-payslips", company?.id, runIdFilter ?? null, employeeIdFilter ?? null],
    queryFn: () =>
      fetchList({
        data: {
          companyId: company!.id,
          runId: runIdFilter ?? null,
          employeeId: employeeIdFilter ?? null,
        },
      }),
    enabled: Boolean(company?.id) && canView,
  });

  const filteredPayslips = useMemo(() => {
    const rows = (listQ.data as PayrollPayslipsListPage | undefined)?.payslips ?? [];
    if (!paymentStatusFilter) return rows;
    return rows.filter(({ payslip }) => payslip.payment_status === paymentStatusFilter);
  }, [listQ.data, paymentStatusFilter]);

  const employeeOptions = useMemo(() => {
    const rows = (listQ.data as PayrollPayslipsListPage | undefined)?.payslips ?? [];
    const byId = new Map<string, string>();
    for (const { employee } of rows) {
      if (!byId.has(employee.id)) {
        byId.set(employee.id, `${employee.first_name} ${employee.last_name}`.trim());
      }
    }
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [listQ.data]);

  const setSearchFilters = (patch: {
    paymentStatus?: PayslipPaymentStatus | null;
    employeeId?: string | null;
  }) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        runId: runIdFilter ?? undefined,
        paymentStatus:
          patch.paymentStatus === undefined
            ? (paymentStatusFilter ?? undefined)
            : (patch.paymentStatus ?? undefined),
        employeeId:
          patch.employeeId === undefined
            ? (employeeIdFilter ?? undefined)
            : (patch.employeeId ?? undefined),
      }),
    });
  };

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

      {list.available ? (
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="payslip-payment-filter">Payment status</Label>
            <Select
              value={paymentStatusFilter ?? "all"}
              onValueChange={(value) =>
                setSearchFilters({
                  paymentStatus: value === "all" ? null : (value as PayslipPaymentStatus),
                })
              }
            >
              <SelectTrigger id="payslip-payment-filter" className="w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {employeeOptions.length > 1 ? (
            <div className="grid gap-1.5">
              <Label htmlFor="payslip-employee-filter">Employee</Label>
              <Select
                value={employeeIdFilter ?? "all"}
                onValueChange={(value) =>
                  setSearchFilters({ employeeId: value === "all" ? null : value })
                }
              >
                <SelectTrigger id="payslip-employee-filter" className="w-[220px]">
                  <SelectValue placeholder="All employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {employeeOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

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
      ) : filteredPayslips.length === 0 ? (
        <EmptyState
          title="No matching payslips"
          description="Try clearing filters or approve a payroll run first."
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
              {filteredPayslips.map(({ payslip, employee, run }) => (
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
