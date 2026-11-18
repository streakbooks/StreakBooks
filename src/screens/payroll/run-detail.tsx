import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  adjustPayrollRunEmployee,
  approvePayrollRun,
  calculatePayrollRunFn,
  getPayrollRunPage,
  markPayrollRunReviewed,
  recalculatePayrollRunFn,
  voidPayrollRun,
} from "@/lib/payroll/runs.functions";
import { getPayrollSettingsPage } from "@/lib/payroll/payroll.functions";
import {
  listPayrollRunJournals,
  postPayrollRun,
  reversePayrollRunAccrual,
} from "@/lib/payroll/payments.functions";
import { formatQuantityFromMicro, parseQuantityMicroOrThrow } from "@/lib/payroll/run-calculation";
import type {
  PayrollComponentTypeRow,
  PayrollRunLineRow,
  PayrollRunPage,
  PayrollRunStatus,
} from "@/lib/payroll/types";
import { fromMinorUnits } from "@/lib/accounting/money";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { TableCard } from "@/components/common/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function hourlyUnitComponentsOnRun(
  empLines: PayrollRunLineRow[],
  components: PayrollComponentTypeRow[],
): PayrollComponentTypeRow[] {
  const byId = new Map(components.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: PayrollComponentTypeRow[] = [];
  for (const line of empLines) {
    const id = line.component_type_id;
    if (!id || seen.has(id)) continue;
    const component = byId.get(id);
    if (!component?.is_active) continue;
    if (component.calculation_method === "hourly" || component.calculation_method === "unit") {
      seen.add(id);
      out.push(component);
    }
  }
  return out.sort((a, b) => a.sort_order - b.sort_order);
}

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
  const navigate = useNavigate();
  const { tab, returnStatus, returnQ, returnSort } = useSearch({ from: "/_authenticated/payroll/runs/$runId" });
  const listReturnSearch = { status: returnStatus, q: returnQ, sort: returnSort };
  const setTab = (nextTab: string) => {
    if (nextTab !== "employees" && nextTab !== "journals" && nextTab !== "payments") return;
    if (nextTab === "journals" && !canAccountingView) return;
    navigate({
      to: "/payroll/runs/$runId",
      params: { runId },
      search: { tab: nextTab, returnStatus, returnQ, returnSort },
    });
  };
  const fetchPage = useServerFn(getPayrollRunPage);
  const fetchJournals = useServerFn(listPayrollRunJournals);
  const calcRun = useServerFn(calculatePayrollRunFn);
  const recalcRun = useServerFn(recalculatePayrollRunFn);
  const reviewRun = useServerFn(markPayrollRunReviewed);
  const approveRun = useServerFn(approvePayrollRun);
  const voidRun = useServerFn(voidPayrollRun);
  const postRun = useServerFn(postPayrollRun);
  const reverseAccrual = useServerFn(reversePayrollRunAccrual);
  const adjustEmployee = useServerFn(adjustPayrollRunEmployee);
  const fetchSettings = useServerFn(getPayrollSettingsPage);

  const [accrualReverseOpen, setAccrualReverseOpen] = useState(false);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [accrualReversalDate, setAccrualReversalDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [adjustTarget, setAdjustTarget] = useState<{
    employeeId: string;
    name: string;
    runEmployeeId: string;
  } | null>(null);
  const [adjustAmounts, setAdjustAmounts] = useState<Record<string, string>>({});
  const [adjustQuantities, setAdjustQuantities] = useState<Record<string, string>>({});

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
      setVoidConfirmOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const reverseAccrualMut = useMutation({
    mutationFn: () =>
      reverseAccrual({
        data: {
          companyId: company!.id,
          runId,
          reversalDate: accrualReversalDate,
        },
      }),
    onSuccess: () => {
      toast.success("Accrual reversed — run returned to approved");
      setAccrualReverseOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const settingsQ = useQuery({
    queryKey: ["payroll-settings-page", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canPrepare && adjustTarget !== null,
  });

  const adjustMut = useMutation({
    mutationFn: () => {
      if (!adjustTarget) throw new Error("No employee selected");
      const currency = pageQ.data?.run.currency ?? "GBP";
      const allComponents = settingsQ.data?.components ?? [];
      const manualComponents = allComponents.filter(
        (c: PayrollComponentTypeRow) => c.calculation_method === "manual" && c.is_active,
      );
      const empLines = linesByRunEmployee.get(adjustTarget.runEmployeeId) ?? [];
      const quantityComponents = hourlyUnitComponentsOnRun(empLines, allComponents);

      const lines: Array<{
        componentTypeId: string;
        amountMinor: number;
        quantityMicro?: number;
      }> = [];

      for (const c of manualComponents) {
        const raw = adjustAmounts[c.id];
        if (raw === undefined || raw.trim() === "") continue;
        const amountMinor = Number(parseMinorOrThrow(raw, currency, c.name));
        lines.push({ componentTypeId: c.id, amountMinor });
      }

      for (const c of quantityComponents) {
        const raw = adjustQuantities[c.id];
        if (raw === undefined || raw.trim() === "") continue;
        const unitLabel =
          c.calculation_method === "hourly" ? `Hours for ${c.name}` : `Quantity for ${c.name}`;
        const quantityMicro = parseQuantityMicroOrThrow(raw, unitLabel);
        lines.push({ componentTypeId: c.id, amountMinor: 0, quantityMicro });
      }

      if (lines.length === 0) {
        throw new Error("Enter at least one adjustment before saving.");
      }

      return adjustEmployee({
        data: {
          companyId: company!.id,
          runId,
          employeeId: adjustTarget.employeeId,
          lines,
        },
      });
    },
    onSuccess: () => {
      toast.success("Adjustments saved — use Recalculate to apply them to run totals");
      setAdjustTarget(null);
      setAdjustAmounts({});
      setAdjustQuantities({});
      invalidate();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending || !company || !canView) {
    return (
      <ListWorkspace
          title="Payroll run"
          actions={
            <Button asChild variant="outline" size="sm">
              <Link to="/payroll/runs" search={listReturnSearch}>All runs</Link>
            </Button>
          }
        >
        <PayrollSubnav current="runs" />
        {isPending ? (
          <LoadingState />
        ) : !company ? (
          <CompanyEmptyState title="No organisation" description="Select a company first." />
        ) : (
          <EmptyState title="No payroll access" description="Ask for payroll.view permission." />
        )}
      </ListWorkspace>
    );
  }
  if (pageQ.isPending || pageQ.isError) {
    return (
      <ListWorkspace title="Payroll run" actions={<Button asChild variant="outline" size="sm"><Link to="/payroll/runs" search={listReturnSearch}>All runs</Link></Button>} >
        <PayrollSubnav current="runs" />
        {pageQ.isPending ? (
          <LoadingState />
        ) : (
          <ErrorState
            title="Could not load run"
            description={friendlyAuthError(pageQ.error)}
            onRetry={() => pageQ.refetch()}
          />
        )}
      </ListWorkspace>
    );
  }

  const { run, schedule, employees, lines, payments, net_outstanding_minor } =
    pageQ.data as PayrollRunPage;
  const isMutable = !["approved", "posted", "paid", "complete", "void"].includes(run.status);
  const canReverseAccrual = canPost && Boolean(run.accrual_journal_id) && run.net_paid_minor === 0;
  const linesByRunEmployee = new Map<string, typeof lines>();
  for (const line of lines) {
    const list = linesByRunEmployee.get(line.run_employee_id) ?? [];
    list.push(line);
    linesByRunEmployee.set(line.run_employee_id, list);
  }
  const settingsComponents = settingsQ.data?.components ?? [];
  const manualComponents = settingsComponents.filter(
    (c: PayrollComponentTypeRow) => c.calculation_method === "manual" && c.is_active,
  );
  const adjustHourlyUnitComponents = adjustTarget
    ? hourlyUnitComponentsOnRun(
        linesByRunEmployee.get(adjustTarget.runEmployeeId) ?? [],
        settingsComponents,
      )
    : [];

  const openEmployeeAdjust = (employeeId: string, name: string, runEmployeeId: string) => {
    const empLines = linesByRunEmployee.get(runEmployeeId) ?? [];
    const initialAmounts: Record<string, string> = {};
    const initialQuantities: Record<string, string> = {};
    for (const line of empLines) {
      if (!line.is_variable || !line.component_type_id) continue;
      if (line.quantity_micro != null) {
        initialQuantities[line.component_type_id] = formatQuantityFromMicro(line.quantity_micro);
      } else {
        initialAmounts[line.component_type_id] = fromMinorUnits(line.amount_minor, run.currency);
      }
    }
    setAdjustAmounts(initialAmounts);
    setAdjustQuantities(initialQuantities);
    setAdjustTarget({ employeeId, name, runEmployeeId });
  };

  const busy =
    calcMut.isPending ||
    recalcMut.isPending ||
    reviewMut.isPending ||
    approveMut.isPending ||
    postMut.isPending ||
    voidMut.isPending ||
    reverseAccrualMut.isPending ||
    adjustMut.isPending;

  return (
    <ListWorkspace
        title={run.run_number}
        description={
          schedule
            ? `${schedule.name} · ${fmt.date(run.period_start)} – ${fmt.date(run.period_end)}`
            : `${fmt.date(run.period_start)} – ${fmt.date(run.period_end)}`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/payroll/runs" search={listReturnSearch}>All runs</Link>
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
                <Link to="/payroll/payments" search={{ runId: run.id }}>
                  Payments
                </Link>
              </Button>
            ) : null}
          </div>
        }
      >
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
            ((run.requires_approval && run.status === "reviewed") ||
              (!run.requires_approval &&
                run.calculated_at &&
                (run.status === "calculated" || run.status === "reviewed"))) ? (
              <Button size="sm" disabled={busy} onClick={() => approveMut.mutate()}>
                Approve &amp; generate payslips
              </Button>
            ) : null}
            {canApprove && run.requires_approval && run.status === "calculated" ? (
              <span className="text-sm text-muted-foreground self-center">
                Mark reviewed before approval
              </span>
            ) : null}
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => setVoidConfirmOpen(true)}
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
        {canReverseAccrual ? (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setAccrualReversalDate(new Date().toISOString().slice(0, 10));
              setAccrualReverseOpen(true);
            }}
          >
            Reverse accrual
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
          <TabsTrigger value="journals" disabled={!canAccountingView} title={!canAccountingView ? "Requires accounting.view permission" : undefined}>Journal entries</TabsTrigger>
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
                  {canPrepare && isMutable ? <TableHead className="w-[120px]" /> : null}
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
                    {canPrepare && isMutable ? (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            openEmployeeAdjust(emp.id, `${emp.first_name} ${emp.last_name}`, re.id)
                          }
                        >
                          Adjust
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </TabsContent>

        <TabsContent value="journals" className="mt-4">
          {!canAccountingView ? (
            <div className="space-y-3">
              <EmptyState
                title="Accounting access required"
                description="Journal entries require accounting.view."
              />
              <Button asChild variant="outline" size="sm">
                <Link
                  to="/payroll/runs/$runId"
                  params={{ runId }}
                  search={{ tab: "employees", returnStatus, returnQ, returnSort }}
                >
                  Return to employees
                </Link>
              </Button>
            </div>
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
                      {canAccountingView ? (
                        <Link
                          to="/accounting"
                          search={{ tab: "journals", journal: journal.id }}
                          className="text-primary hover:underline"
                        >
                          Journal #{journal.journal_number}
                        </Link>
                      ) : (
                        <>Journal #{journal.journal_number}</>
                      )}{" "}
                      · {fmt.date(journal.journal_date)}
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

      <AlertDialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this payroll run?</AlertDialogTitle>
            <AlertDialogDescription>
              This cancels the run in draft or calculated state. Generated figures are discarded and
              the run cannot be approved or posted unless you create a new run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voidMut.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={voidMut.isPending}
              onClick={() => voidMut.mutate()}
            >
              Void run
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={accrualReverseOpen} onOpenChange={setAccrualReverseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse payroll accrual?</AlertDialogTitle>
            <AlertDialogDescription>
              Posts a reversing journal and returns this run to approved. Only available when no
              net-pay payments have been recorded for the run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="pr-accrual-reverse-date">Reversal date</Label>
            <Input
              id="pr-accrual-reverse-date"
              type="date"
              value={accrualReversalDate}
              onChange={(e) => setAccrualReversalDate(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverseAccrualMut.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={reverseAccrualMut.isPending || !accrualReversalDate}
              onClick={() => reverseAccrualMut.mutate()}
            >
              Reverse accrual
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={adjustTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdjustTarget(null);
            setAdjustAmounts({});
            setAdjustQuantities({});
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adjust run inputs</DialogTitle>
            <DialogDescription>
              {adjustTarget
                ? `Period hours, units, or one-off amounts for ${adjustTarget.name}. Saved values apply on the next Calculate or Recalculate.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {settingsQ.isPending ? (
            <LoadingState />
          ) : manualComponents.length === 0 && adjustHourlyUnitComponents.length === 0 ? (
            <EmptyState
              title="Nothing to adjust yet"
              description="Calculate the run first so hourly or unit lines appear, or add manual component types in payroll settings."
            />
          ) : (
            <div className="space-y-6">
              {adjustHourlyUnitComponents.length > 0 ? (
                <section className="space-y-3">
                  <h3 className="text-sm font-medium">Hours &amp; units</h3>
                  <ul className="space-y-3">
                    {adjustHourlyUnitComponents.map((c: PayrollComponentTypeRow) => (
                      <li key={c.id} className="grid gap-1">
                        <Label htmlFor={`adj-qty-${c.id}`}>
                          {c.name} ({c.code})
                        </Label>
                        <Input
                          id={`adj-qty-${c.id}`}
                          inputMode="decimal"
                          placeholder={
                            c.calculation_method === "hourly"
                              ? "Hours this period"
                              : "Units this period"
                          }
                          value={adjustQuantities[c.id] ?? ""}
                          onChange={(e) =>
                            setAdjustQuantities((prev) => ({ ...prev, [c.id]: e.target.value }))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {manualComponents.length > 0 ? (
                <section className="space-y-3">
                  <h3 className="text-sm font-medium">Manual amounts</h3>
                  <ul className="space-y-3">
                    {manualComponents.map((c: PayrollComponentTypeRow) => (
                      <li key={c.id} className="grid gap-1">
                        <Label htmlFor={`adj-${c.id}`}>
                          {c.name} ({c.code})
                        </Label>
                        <Input
                          id={`adj-${c.id}`}
                          inputMode="decimal"
                          placeholder={`Amount (${run.currency})`}
                          value={adjustAmounts[c.id] ?? ""}
                          onChange={(e) =>
                            setAdjustAmounts((prev) => ({ ...prev, [c.id]: e.target.value }))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                adjustMut.isPending ||
                settingsQ.isPending ||
                (manualComponents.length === 0 && adjustHourlyUnitComponents.length === 0)
              }
              onClick={() => adjustMut.mutate()}
            >
              Save adjustments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
