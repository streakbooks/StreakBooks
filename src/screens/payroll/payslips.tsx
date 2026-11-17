import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listPayrollPayslips } from "@/lib/payroll/runs.functions";
import { payrollPayslipsToCsv, payslipNetBalances } from "@/lib/payroll/payslip-list-export";
import { downloadCsv } from "@/lib/reports/csv";
import type { PayrollPayslipsListPage, PayslipPaymentStatus } from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { TableCard } from "@/components/common/table-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  const canExport = useCanDo("payroll.reports.view");
  const fmt = useFormat();
  const fetchList = useServerFn(listPayrollPayslips);
  const navigate = useNavigate({ from: "/payroll/payslips/" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"issued-newest" | "issued-oldest" | "employee">("issued-newest");

  const listQ = useQuery({
    queryKey: ["payroll-payslips", company?.id, runIdFilter ?? null],
    queryFn: () =>
      fetchList({
        data: {
          companyId: company!.id,
          runId: runIdFilter ?? null,
          employeeId: null,
        },
      }),
    enabled: Boolean(company?.id) && canView,
  });

  const filteredPayslips = useMemo(() => {
    const rows = (listQ.data as PayrollPayslipsListPage | undefined)?.payslips ?? [];
    const term = search.trim().toLocaleLowerCase();
    return rows
      .filter(({ payslip, employee, run }) => {
        if (paymentStatusFilter && payslip.payment_status !== paymentStatusFilter) return false;
        if (employeeIdFilter && employee.id !== employeeIdFilter) return false;
        if (!term) return true;
        const values = [
          payslip.payslip_number,
          employee.employee_number,
          employee.first_name,
          employee.last_name,
          run.run_number,
        ];
        return values.some((value) => value.toLocaleLowerCase().includes(term));
      })
      .sort((a, b) => {
        if (sort === "employee") {
          const first = `${a.employee.first_name} ${a.employee.last_name}`;
          const second = `${b.employee.first_name} ${b.employee.last_name}`;
          return first.localeCompare(second);
        }
        return sort === "issued-oldest"
          ? a.payslip.issued_at.localeCompare(b.payslip.issued_at)
          : b.payslip.issued_at.localeCompare(a.payslip.issued_at);
      });
  }, [listQ.data, paymentStatusFilter, employeeIdFilter, search, sort]);

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

  const hasFilters = Boolean(paymentStatusFilter || employeeIdFilter || search.trim());
  const clearFilters = () => {
    setSearch("");
    setSort("issued-newest");
    setSearchFilters({ paymentStatus: null, employeeId: null });
  };

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Payslips" description="Employee payslips for posted runs.">
        <EmptyState title="No payroll access" description="Ask for payroll.view permission." />
      </ListWorkspace>
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
    <ListWorkspace
      title="Payslips"
      description="Issued payslips from approved payroll runs."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canExport && list.available ? (
            <Button
              size="sm"
              variant="outline"
              disabled={filteredPayslips.length === 0}
              onClick={() =>
                downloadCsv("payroll-payslips-filtered.csv", payrollPayslipsToCsv(filteredPayslips))
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Export filtered CSV
            </Button>
          ) : null}
          {runIdFilter ? (
            <Link
              to="/payroll/runs/$runId"
              params={{ runId: runIdFilter }}
              className="text-sm text-primary hover:underline"
            >
              Back to run
            </Link>
          ) : null}
        </div>
      }
      subnav={<PayrollSubnav current="payslips" />}
    >
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
          {employeeOptions.length > 1 || employeeIdFilter ? (
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
          <div className="grid gap-1.5">
            <Label htmlFor="payslip-search">Search payslips</Label>
            <Input
              id="payslip-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Number, employee or run…"
              className="w-full sm:w-60"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payslip-sort">Sort by</Label>
            <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
              <SelectTrigger id="payslip-sort" className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="issued-newest">Issued: newest first</SelectItem>
                <SelectItem value="issued-oldest">Issued: oldest first</SelectItem>
                <SelectItem value="employee">Employee name</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasFilters ? (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
          <p className="w-full text-xs text-muted-foreground" aria-live="polite">
            Showing {filteredPayslips.length} of {list.payslips.length} payslips
          </p>
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
          description="Try clearing filters or changing your search."
          action={
            <Button size="sm" variant="outline" onClick={clearFilters}>
              Clear filters
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
                <TableHead className="text-right">Outstanding</TableHead>
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
                  <TableCell className="text-right font-mono text-sm">
                    {fmt.money(payslipNetBalances(payslip).outstandingMinor, run.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </ListWorkspace>
  );
}
