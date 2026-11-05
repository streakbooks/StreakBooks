import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  approvePayrollRun,
  calculatePayrollRunFn,
  getPayrollRunPage,
  markPayrollRunReviewed,
  recalculatePayrollRunFn,
  voidPayrollRun,
} from "@/lib/payroll/runs.functions";
import type { PayrollRunPage, PayrollRunStatus } from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { TableCard } from "@/components/common/table-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABEL: Record<PayrollRunStatus, string> = {
  draft: "Draft",
  calculated: "Calculated",
  reviewed: "Reviewed",
  approved: "Approved",
  posted: "Posted",
  paid: "Paid",
  complete: "Complete",
  void: "Void",
};

export function PayrollRunDetailPage({ runId }: { runId: string }) {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const canPrepare = useCanDo("payroll.run.prepare");
  const canApprove = useCanDo("payroll.run.approve");
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const fetchPage = useServerFn(getPayrollRunPage);
  const calcRun = useServerFn(calculatePayrollRunFn);
  const recalcRun = useServerFn(recalculatePayrollRunFn);
  const reviewRun = useServerFn(markPayrollRunReviewed);
  const approveRun = useServerFn(approvePayrollRun);
  const voidRun = useServerFn(voidPayrollRun);

  const pageQ = useQuery({
    queryKey: ["payroll-run", company?.id, runId],
    queryFn: () => fetchPage({ data: { companyId: company!.id, runId } }),
    enabled: Boolean(company?.id) && canView,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["payroll-run", company?.id, runId] });
    queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    queryClient.invalidateQueries({ queryKey: ["payroll-payslips"] });
  };

  const calcMut = useMutation({
    mutationFn: () => calcRun({ data: { companyId: company!.id, runId } }),
    onSuccess: () => {
      toast.success("Payroll calculated");
      invalidate();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const recalcMut = useMutation({
    mutationFn: () => recalcRun({ data: { companyId: company!.id, runId } }),
    onSuccess: () => {
      toast.success("Payroll recalculated");
      invalidate();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const reviewMut = useMutation({
    mutationFn: () => reviewRun({ data: { companyId: company!.id, runId } }),
    onSuccess: () => {
      toast.success("Marked as reviewed");
      invalidate();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const approveMut = useMutation({
    mutationFn: () => approveRun({ data: { companyId: company!.id, runId } }),
    onSuccess: () => {
      toast.success("Run approved — payslips generated");
      invalidate();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const voidMut = useMutation({
    mutationFn: () => voidRun({ data: { companyId: company!.id, runId } }),
    onSuccess: () => {
      toast.success("Run voided");
      invalidate();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <>
        <PageHeader title="Payroll run" />
        <EmptyState title="No payroll access" description="Ask for payroll.view permission." />
      </>
    );
  }
  if (pageQ.isPending) return <LoadingState />;
  if (pageQ.isError) {
    return (
      <ErrorState
        title="Could not load run"
        description={friendlyAuthError(pageQ.error)}
        onRetry={() => pageQ.refetch()}
      />
    );
  }

  const { run, schedule, employees, lines } = pageQ.data as PayrollRunPage;
  const isMutable = !["approved", "posted", "paid", "complete", "void"].includes(run.status);
  const linesByRunEmployee = new Map<string, typeof lines>();
  for (const line of lines) {
    const list = linesByRunEmployee.get(line.run_employee_id) ?? [];
    list.push(line);
    linesByRunEmployee.set(line.run_employee_id, list);
  }

  const busy =
    calcMut.isPending ||
    recalcMut.isPending ||
    reviewMut.isPending ||
    approveMut.isPending ||
    voidMut.isPending;

  return (
    <>
      <PageHeader
        title={run.run_number}
        description={
          schedule
            ? `${schedule.name} · ${fmt.date(run.period_start)} – ${fmt.date(run.period_end)}`
            : `${fmt.date(run.period_start)} – ${fmt.date(run.period_end)}`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/payroll/runs">All runs</Link>
            </Button>
            {run.status === "approved" ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/payroll/payslips" search={{ runId: run.id }}>
                  View payslips
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <PayrollSubnav current="runs" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge>{STATUS_LABEL[run.status]}</Badge>
        {canPrepare && isMutable ? (
          <>
            {run.status === "draft" || run.calculated_at == null ? (
              <Button size="sm" disabled={busy} onClick={() => calcMut.mutate()}>
                Calculate
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => recalcMut.mutate()}
              >
                Recalculate
              </Button>
            )}
            {run.status === "calculated" && run.requires_approval ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => reviewMut.mutate()}
              >
                Mark reviewed
              </Button>
            ) : null}
            {canApprove &&
            (run.status === "calculated" ||
              run.status === "reviewed" ||
              (!run.requires_approval && run.calculated_at)) ? (
              <Button size="sm" disabled={busy} onClick={() => approveMut.mutate()}>
                Approve &amp; generate payslips
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => voidMut.mutate()}
            >
              Void run
            </Button>
          </>
        ) : null}
      </div>

      {(run.status === "posted" || run.status === "paid") && (
        <Alert className="mb-4">
          <AlertDescription>
            Posting journals and bank payments are available in Basic Global Payroll Batch 5.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gross</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-lg">
            {fmt.money(run.gross_minor, run.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deductions</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-lg">
            {fmt.money(run.deductions_minor, run.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net pay</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-lg">
            {fmt.money(run.net_minor, run.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Employer cost
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-lg">
            {fmt.money(run.employer_cost_minor, run.currency)}
          </CardContent>
        </Card>
      </div>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Deductions</TableHead>
              <TableHead className="text-right">Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map(({ run_employee: re, employee: emp }) => (
              <TableRow key={re.id}>
                <TableCell>
                  <div className="font-medium">
                    {emp.first_name} {emp.last_name}
                  </div>
                  <div className="text-xs text-muted-foreground">{emp.employee_number}</div>
                  {(linesByRunEmployee.get(re.id)?.length ?? 0) > 0 ? (
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {linesByRunEmployee.get(re.id)?.map((l) => (
                        <li key={l.id}>
                          {l.name}: {fmt.money(l.amount_minor, run.currency)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt.money(re.gross_minor, run.currency)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt.money(re.deductions_minor, run.currency)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt.money(re.net_minor, run.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </>
  );
}
