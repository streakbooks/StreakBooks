import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableCard } from "@/components/common/table-card";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
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
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useDebounced } from "@/hooks/use-debounced";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listHrEmployees } from "@/lib/hr/hr.functions";

export function HrEmployeesPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const fetchList = useServerFn(listHrEmployees);
  const [statusFilter, setStatusFilter] = useState("active");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);

  const listQ = useQuery({
    queryKey: ["hr-employees", company?.id, statusFilter, q],
    queryFn: () =>
      fetchList({
        data: {
          companyId: company!.id,
          status: statusFilter,
          ...(q ? { search: q } : {}),
        },
      }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Employees" description="Workforce directory">
        <EmptyState title="No HR access" description="Ask an administrator for hr.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Employees"
      description="HR profiles share Payroll employee identity — organisation and lifecycle live here; pay runs stay in Payroll."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employees" }]}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/payroll/employees">Payroll employees</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/payroll/employees">New employee</Link>
          </Button>
        </div>
      }
    >
      <HrSubnav current="employees" />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, number or email"
          aria-label="Search employees"
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" aria-label="Status filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listQ.isPending ? (
        <LoadingState />
      ) : listQ.isError ? (
        <ErrorState
          title="Could not load employees"
          description={friendlyAuthError(listQ.error)}
          onRetry={() => listQ.refetch()}
        />
      ) : !listQ.data?.items.length ? (
        <EmptyState
          title="No employees found"
          description="Create employees in Payroll first. HR then attaches organisation and lifecycle data to the same records."
          action={
            <Button asChild>
              <Link to="/payroll/employees">Go to Payroll employees</Link>
            </Button>
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQ.data.items.map((row) => {
                const displayName = row.preferredName
                  ? `${row.preferredName} (${row.firstName} ${row.lastName})`
                  : `${row.firstName} ${row.lastName}`;
                return (
                  <TableRow key={row.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        to="/hr/employees/$employeeId"
                        params={{ employeeId: row.id }}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {row.employeeNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/hr/employees/$employeeId"
                        params={{ employeeId: row.id }}
                        className="hover:underline"
                      >
                        {displayName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.departmentName ?? row.payrollDepartment ?? "—"}</TableCell>
                    <TableCell>{row.designationName ?? row.payrollDesignation ?? "—"}</TableCell>
                    <TableCell>{row.locationName ?? row.payrollWorkLocation ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </ListWorkspace>
  );
}
