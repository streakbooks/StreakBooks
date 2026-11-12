import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getPayrollSettingsPage } from "@/lib/payroll/payroll.functions";
import { suggestNextRunPeriod } from "@/lib/payroll/suggest-run-period";
import { createPayrollRun, listPayrollRuns } from "@/lib/payroll/runs.functions";
import { PAYROLL_RUN_STATUSES, type PayrollRunStatus } from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { TableCard } from "@/components/common/table-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

function statusVariant(
  status: PayrollRunStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved" || status === "complete") return "default";
  if (status === "void") return "destructive";
  if (status === "draft") return "outline";
  return "secondary";
}

export function PayrollRunsPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const canPrepare = useCanDo("payroll.run.prepare");
  const fmt = useFormat();
  const navigate = useNavigate();
  const listSearch = useSearch({ from: "/_authenticated/payroll/runs/" });
  const statusFilter = listSearch.status;
  const runSearch = listSearch.q;
  const runSort = listSearch.sort;
  const updateListSearch = (patch: Partial<typeof listSearch>) => {
    navigate({ to: "/payroll/runs", search: (previous) => ({ ...previous, ...patch }), replace: true });
  };
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listPayrollRuns);
  const fetchSettings = useServerFn(getPayrollSettingsPage);
  const createRun = useServerFn(createPayrollRun);

  const [createOpen, setCreateOpen] = useState(false);
  const [scheduleId, setScheduleId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [userEditedDates, setUserEditedDates] = useState(false);

  const settingsQ = useQuery({
    queryKey: ["payroll-settings-page", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const listQ = useQuery({
    queryKey: ["payroll-runs", company?.id],
    queryFn: () =>
      fetchList({
        data: {
          companyId: company!.id,
          status: null,
        },
      }),
    enabled: Boolean(company?.id) && canView,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createRun({
        data: {
          companyId: company!.id,
          payScheduleId: scheduleId,
          periodStart,
          periodEnd,
          paymentDate,
        },
      }),
    onSuccess: (run) => {
      toast.success(`Payroll run ${run.run_number} created`);
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      navigate({ to: "/payroll/runs/$runId", params: { runId: run.id } });
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  useEffect(() => {
    if (!createOpen || !scheduleId || userEditedDates) return;
    const settings = settingsQ.data;
    const list = listQ.data;
    if (!settings || !list?.available) return;
    const schedule = settings.schedules.find((s) => s.is_active && s.id === scheduleId);
    if (!schedule) return;
    const suggested = suggestNextRunPeriod({
      schedule,
      payrollStartDate: settings.settings?.payroll_start_date ?? null,
      priorRuns: list.runs,
    });
    if (!suggested) return;
    setPeriodStart(suggested.periodStart);
    setPeriodEnd(suggested.periodEnd);
    setPaymentDate(suggested.paymentDate);
  }, [createOpen, scheduleId, settingsQ.data, listQ.data, userEditedDates]);

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <>
        <PageHeader title="Payroll runs" description="Prepare and approve pay runs." />
        <EmptyState title="No payroll access" description="Ask for payroll.view permission." />
      </>
    );
  }
  if (settingsQ.isPending || listQ.isPending) return <LoadingState />;
  if (settingsQ.isError) {
    return (
      <ErrorState
        title="Could not load payroll"
        description={friendlyAuthError(settingsQ.error)}
        onRetry={() => settingsQ.refetch()}
      />
    );
  }
  if (listQ.isError) {
    return (
      <ErrorState
        title="Could not load runs"
        description={friendlyAuthError(listQ.error)}
        onRetry={() => listQ.refetch()}
      />
    );
  }

  const settings = settingsQ.data;
  const list = listQ.data;
  const schedules = settings.schedules.filter((s) => s.is_active);
  const scheduleName = (id: string) =>
    settings.schedules.find((s) => s.id === id)?.name ?? "Unknown schedule";
  // Status/search filters must never hide periods from the next-run suggestion.
  const searchTerm = runSearch.trim().toLocaleLowerCase();
  const matchingRuns = list.runs
    .filter((run) => statusFilter === "all" || run.status === statusFilter)
    .filter((run) =>
      !searchTerm ||
      [run.run_number, scheduleName(run.pay_schedule_id), run.period_start, run.period_end]
        .some((value) => value.toLocaleLowerCase().includes(searchTerm)),
    )
    .sort((a, b) =>
      runSort === "period-newest"
        ? b.period_start.localeCompare(a.period_start)
        : runSort === "payment-oldest"
          ? a.payment_date.localeCompare(b.payment_date)
          : b.payment_date.localeCompare(a.payment_date),
    );
  const hasListFilters = statusFilter !== "all" || runSearch.trim() !== "";
  const clearListFilters = () => {
    updateListSearch({ status: "all", q: "" });
  };
  const invalidPeriod = Boolean(periodStart && periodEnd && periodEnd < periodStart);
  const overlappingRun =
    scheduleId && periodStart && periodEnd
      ? list.runs.find(
          (run) =>
            run.pay_schedule_id === scheduleId &&
            run.status !== "void" &&
            run.period_start <= periodEnd &&
            run.period_end >= periodStart,
        )
      : null;

  return (
    <>
      <PageHeader
        title="Payroll runs"
        description="Create pay runs, calculate amounts, review and approve."
        actions={
          canPrepare && list.available ? (
            <Button size="sm" onClick={() => {
                setUserEditedDates(false);
                setCreateOpen(true);
              }}>
              <Plus className="mr-2 h-4 w-4" />
              New run
            </Button>
          ) : null
        }
      />
      <PayrollSubnav current="runs" />

      {!list.available ? (
        <Alert>
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{list.migrationMessage}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Label htmlFor="run-status-filter" className="sr-only">
              Filter by status
            </Label>
            <Select value={statusFilter} onValueChange={(status) => updateListSearch({ status })}>
              <SelectTrigger id="run-status-filter" className="w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PAYROLL_RUN_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={runSearch}
              onChange={(event) => updateListSearch({ q: event.target.value.slice(0, 120) })}
              placeholder="Search run, schedule or period…"
              aria-label="Search payroll runs"
              className="w-full sm:w-64"
            />
            <Select
              value={runSort}
              onValueChange={(value) => updateListSearch({ sort: value as typeof runSort })}
            >
              <SelectTrigger className="w-[190px]" aria-label="Sort payroll runs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="payment-newest">Payment date: newest</SelectItem>
                <SelectItem value="payment-oldest">Payment date: oldest</SelectItem>
                <SelectItem value="period-newest">Period: newest</SelectItem>
              </SelectContent>
            </Select>
            {hasListFilters ? (
              <Button variant="ghost" size="sm" onClick={clearListFilters}>
                Clear filters
              </Button>
            ) : null}
            <p className="w-full text-xs text-muted-foreground" aria-live="polite">
              Showing {matchingRuns.length} of {list.runs.length} payroll runs
            </p>
          </div>

          <TableCard>
            {matchingRuns.length === 0 ? (
              <EmptyState
                title={list.runs.length === 0 ? "No payroll runs yet" : "No matching payroll runs"}
                description={
                  list.runs.length === 0
                    ? "Create a run for a pay schedule and period."
                    : "Try another status, search term or clear your filters."
                }
                action={
                  hasListFilters ? (
                    <Button size="sm" variant="outline" onClick={clearListFilters}>
                      Clear filters
                    </Button>
                  ) : canPrepare ? (
                    <Button size="sm" onClick={() => {
                setUserEditedDates(false);
                setCreateOpen(true);
              }}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create run
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Net pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchingRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Link
                          to="/payroll/runs/$runId"
                          params={{ runId: run.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {run.run_number}
                        </Link>
                      </TableCell>
                      <TableCell>{scheduleName(run.pay_schedule_id)}</TableCell>
                      <TableCell>
                        {fmt.date(run.period_start)} – {fmt.date(run.period_end)}
                      </TableCell>
                      <TableCell>{fmt.date(run.payment_date)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(run.status)}>
                          {STATUS_LABEL[run.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmt.money(run.net_minor, run.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableCard>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New payroll run</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="run-schedule">Pay schedule</Label>
              <Select
                value={scheduleId}
                onValueChange={(value) => {
                  setScheduleId(value);
                  setUserEditedDates(false);
                }}
              >
                <SelectTrigger id="run-schedule">
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  {schedules.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="period-start">Period start</Label>
                <Input
                  id="period-start"
                  type="date"
                  value={periodStart}
                  onChange={(e) => {
                    setUserEditedDates(true);
                    setPeriodStart(e.target.value);
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="period-end">Period end</Label>
                <Input
                  id="period-end"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => {
                    setUserEditedDates(true);
                    setPeriodEnd(e.target.value);
                  }}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-date">Payment date</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => {
                  setUserEditedDates(true);
                  setPaymentDate(e.target.value);
                }}
              />
            </div>
            {invalidPeriod ? (
              <p className="text-sm text-destructive" role="alert">
                Period end must be on or after period start.
              </p>
            ) : null}
            {overlappingRun ? (
              <Alert>
                <AlertTitle>Overlapping pay period</AlertTitle>
                <AlertDescription>
                  This period overlaps {overlappingRun.run_number}. Verify the dates to avoid
                  duplicate payroll; supplementary runs may intentionally overlap.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !scheduleId || !periodStart || !periodEnd || !paymentDate || invalidPeriod || createMut.isPending
              }
              onClick={() => createMut.mutate()}
            >
              Create run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
