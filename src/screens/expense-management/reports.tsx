import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementLoadingShell } from "@/components/expenses/ExpenseManagementLoadingShell";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  EXPENSE_REPORTS_MIGRATION,
  exportExpenseClaimsReport,
  getExpenseManagementReport,
  listExpenseClaimAuditEvents,
} from "@/lib/expenses/expenses.functions";
import { buildExpenseClaimsExportCsv, defaultExpenseReportRange } from "@/lib/expenses/reports";
import type { Permission } from "@/lib/permissions";

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExpenseManagementReportsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("expenses.export" as Permission) ||
    can("expenses.view" as Permission) ||
    can("expenses.audit" as Permission) ||
    can("expenses.admin" as Permission);
  const canExport =
    can("expenses.export" as Permission) ||
    can("expenses.admin" as Permission) ||
    can("expenses.audit" as Permission);
  const rangeDefaults = useMemo(() => defaultExpenseReportRange(), []);
  const [fromDate, setFromDate] = useState(rangeDefaults.fromDate);
  const [toDate, setToDate] = useState(rangeDefaults.toDate);

  const fetchReport = useServerFn(getExpenseManagementReport);
  const fetchExport = useServerFn(exportExpenseClaimsReport);
  const fetchAudit = useServerFn(listExpenseClaimAuditEvents);

  const reportQ = useQuery({
    queryKey: ["expense-management-report", company?.id, fromDate, toDate],
    queryFn: () =>
      fetchReport({
        data: { companyId: company!.id, fromDate, toDate },
      }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const auditQ = useQuery({
    queryKey: ["expense-claim-audit-events", company?.id],
    queryFn: () => fetchAudit({ data: { companyId: company!.id, limit: 40 } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const exportMut = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Select a company first.");
      return fetchExport({
        data: { companyId: company.id, fromDate, toDate },
      });
    },
    onSuccess: (payload) => {
      const csv = buildExpenseClaimsExportCsv({
        rows: payload.rows,
        fromDate: payload.fromDate,
        toDate: payload.toDate,
      });
      downloadTextFile(`expense-claims-${payload.fromDate}-to-${payload.toDate}.csv`, csv);
      toast.success(`Exported ${payload.rows.length} claim row(s).`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Reports" subnav={<ExpenseManagementSubnav current="reports" />}>
        <EmptyState
          title="No access"
          description="Ask an administrator for expenses.view, expenses.export, or expenses.audit."
        />
      </ListWorkspace>
    );
  }
  if (reportQ.isLoading) {
    return <ExpenseManagementLoadingShell title="Reports" current="reports" />;
  }
  if (reportQ.isError) {
    const message = friendlyAuthError(reportQ.error);
    return (
      <ListWorkspace
        title="Reports"
        description="Expenses"
        subnav={<ExpenseManagementSubnav current="reports" />}
      >
        {message.includes("20261107147000") ? (
          <Alert>
            <AlertTitle>Database update required</AlertTitle>
            <AlertDescription>{EXPENSE_REPORTS_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <QueryErrorState queries={[reportQ]} title="Could not load expense report" />
        )}
      </ListWorkspace>
    );
  }

  const report = reportQ.data!;
  const currency = company.base_currency ?? "USD";

  return (
    <ListWorkspace
      title="Reports"
      description="Claim volumes, open aging, CSV export and recent audit events."
      actions={
        canExport ? (
          <Button size="sm" disabled={exportMut.isPending} onClick={() => exportMut.mutate()}>
            {exportMut.isPending ? "Exporting…" : "Export claims CSV"}
          </Button>
        ) : null
      }
      subnav={<ExpenseManagementSubnav current="reports" />}
    >
      <section className="mb-6 grid max-w-xl gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="em-report-from">From</Label>
          <Input
            id="em-report-from"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="em-report-to">To</Label>
          <Input
            id="em-report-to"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
      </section>

      <div className="mb-8 flex flex-wrap gap-2">
        <Badge variant="secondary">{report.totals.claimCount} claims</Badge>
        <Badge variant="outline">Total {fromMinorUnits(report.totals.totalMinor, currency)}</Badge>
        <Badge variant="outline">
          Reimbursable {fromMinorUnits(report.totals.reimbursableMinor, currency)}
        </Badge>
        <Badge variant="outline">
          {report.fromDate} → {report.toDate}
        </Badge>
      </div>

      <section className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-base font-semibold">By approval status</h2>
          <StatusTable rows={report.byApprovalStatus} currency={currency} />
        </div>
        <div className="space-y-3">
          <h2 className="text-base font-semibold">By reimbursement status</h2>
          <StatusTable rows={report.byReimbursementStatus} currency={currency} />
        </div>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-base font-semibold">Open claim aging</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <AgingCard label="0–7 days" value={report.openAging.days0to7} />
          <AgingCard label="8–30 days" value={report.openAging.days8to30} />
          <AgingCard label="31–90 days" value={report.openAging.days31to90} />
          <AgingCard label="90+ days" value={report.openAging.days90Plus} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Recent audit events</h2>
        {auditQ.isLoading ? (
          <LoadingState />
        ) : auditQ.isError ? (
          <QueryErrorState queries={[auditQ]} title="Could not load audit events" />
        ) : (auditQ.data ?? []).length === 0 ? (
          <EmptyState
            title="No claim events yet"
            description="Submit, approve, post and reimburse activity will appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Claim</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(auditQ.data ?? []).map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {event.actedAt.slice(0, 19).replace("T", " ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{event.eventType}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{event.claimId}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {event.note ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </ListWorkspace>
  );
}

function StatusTable({
  rows,
  currency,
}: {
  rows: Array<{ status: string; claimCount: number; totalMinor: number }>;
  currency: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No claims in this period.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Count</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.status}>
            <TableCell>{row.status}</TableCell>
            <TableCell>{row.claimCount}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fromMinorUnits(row.totalMinor, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AgingCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
