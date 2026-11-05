import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import { listPayrollRunJournals, postPayrollRun } from "@/lib/payroll/payments.functions";
import type { PayrollRunPage, PayrollRunStatus } from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { TableCard } from "@/components/common/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const canPost = useCanDo("payroll.run.post");
  const canAccountingView = useCanDo("accounting.view");
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("employees");
  const fetchPage = useServerFn(getPayrollRunPage);
  const fetchJournals = useServerFn(listPayrollRunJournals);
  const calcRun = useServerFn(calculatePayrollRunFn);
  const recalcRun = useServerFn(recalculatePayrollRunFn);
  const reviewRun = useServerFn(markPayrollRunReviewed);
  const approveRun = useServerFn(approvePayrollRun);
  const voidRun = useServerFn(voidPayrollRun);
  const postRun = useServerFn(postPayrollRun);

  const pageQ = useQuery({
    queryKey: ["payroll-run", company?.id, runId],
    queryFn: () => fetchPage({ data: { companyId: company!.id, runId } }),
    enabled: Boolean(company?.id) && canView,
  });

  const journalsQ = useQuery({
    queryKey: ["payroll-run-journals", company?.id, runId],
    queryFn: () => fetchJournals({ data: { companyId: company!.id, runId } }),
    enabled: Boolean(company?.id) && canView && canAccountingView && tab === "journals",
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["payroll-run", company?.id, runId] });
    queryClient.invalidateQueries({ queryKey: ["payroll-run-journals", company?.id, runId] });
    queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    queryClient.invalidateQueries({ queryKey: ["payroll-payslips"] });
    queryClient.invalidateQueries({ queryKey: ["payroll-payments"] });
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

  const postMut = useMutation({
    mutationFn: () => postRun({ data: { companyId: company!.id, runId } }),
    onSuccess: () => {
      toast.success("Payroll posted to the ledger");
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

  const { run, schedule, employees, lines, payments, net_outstanding_minor } =
    pageQ.data as PayrollRunPage;
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
    postMut.isPending ||
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
            {run.status !== "draft" && run.status !== "void" ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/payroll/payslips" search={{ runId: run.id }}>
                  View payslips
                </Link>
              </Button>
            ) : null}
            {run.accrual_journal_id ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/payroll/payments">Payments</Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <PayrollSubnav current="runs" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge>{STATUS_LABEL[run.status]}</Badge>
        {run.posted_at ? (
          <span className="text-sm text-muted-foreground">
            Posted {fmt.dateTime(run.posted_at)}
          </span>
        ) : null}
        {run.accrual_journal_id && net_outstanding_minor > 0 ? (
          <span className="text-sm text-muted-foreground">
            Net outstanding {fmt.money(net_outstanding_minor, run.currency)}
          </span>
        ) : null}
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
        {canPost && run.status === "approved" && !run.accrual_journal_id ? (
          <Button size="sm" disabled={busy} onClick={() => postMut.mutate()}>
            Post to ledger
          </Button>
        ) : null}
      </div>

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
              Net paid / outstanding
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-lg">
            {fmt.money(run.net_paid_minor, run.currency)}
            {run.accrual_journal_id ? (
              <span className="block text-sm font-normal text-muted-foreground">
                Outstanding {fmt.money(net_outstanding_minor, run.currency)}
              </span>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="journals">Journal entries</TabsTrigger>
          <TabsTrigger value="payments">Payment history</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="mt-4">
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Pay status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(({ run_employee: re, employee: emp, payslip }) => (
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
                    <TableCell>
                      {payslip ? <Badge variant="outline">{payslip.payment_status}</Badge> : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </TabsContent>

        <TabsContent value="journals" className="mt-4">
          {!canAccountingView ? (
            <EmptyState
              title="Accounting access required"
              description="Journal entries require accounting.view."
            />
          ) : !run.accrual_journal_id ? (
            <EmptyState
              title="Not posted yet"
              description="Post this run to create accrual journal entries."
            />
          ) : journalsQ.isPending ? (
            <LoadingState />
          ) : journalsQ.isError ? (
            <ErrorState
              title="Could not load journals"
              description={friendlyAuthError(journalsQ.error)}
              onRetry={() => journalsQ.refetch()}
            />
          ) : !journalsQ.data?.journals.length ? (
            <EmptyState
              title="No journals"
              description="No ledger entries were found for this run."
            />
          ) : (
            <div className="space-y-4">
              {journalsQ.data.journals.map((journal) => (
                <section key={journal.id} className="rounded-md border p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">
                      Journal #{journal.journal_number} · {fmt.date(journal.journal_date)}
                    </span>
                    <Badge variant="outline">{journal.source_type}</Badge>
                  </div>
                  {journal.memo ? (
                    <p className="mb-2 text-sm text-muted-foreground">{journal.memo}</p>
                  ) : null}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {journal.lines.map((line) => (
                        <TableRow key={`${journal.id}-${line.account_code}-${line.debit_minor}`}>
                          <TableCell>
                            {line.account_code} {line.account_name}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {line.debit_minor ? fmt.money(line.debit_minor, run.currency) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {line.credit_minor ? fmt.money(line.credit_minor, run.currency) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          {payments.length === 0 ? (
            <EmptyState
              title="No payments recorded"
              description={
                run.accrual_journal_id
                  ? "Record net-pay payments from the Payments screen."
                  : "Post the run before recording payments."
              }
            />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{fmt.date(p.payment_date)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmt.money(p.amount_minor, run.currency)}
                      </TableCell>
                      <TableCell>{p.reference ?? "—"}</TableCell>
                      <TableCell>{p.status === "reversed" ? "Reversed" : "Posted"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
