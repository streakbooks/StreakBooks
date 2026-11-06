import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import { listFirmOnboardingOverview } from "@/lib/firm/firm-workflows.functions";
import { listFirmOnboardingWorkloadContext } from "@/lib/firm/firm-onboarding-workload.functions";
import { listFirmOnboardingTrends } from "@/lib/firm/firm-onboarding-trends.functions";
import {
  onboardingAgeCounts,
  onboardingDailyTrends,
  onboardingOperationalRows,
  onboardingOperationsCsv,
  onboardingTrendCsv,
  type OnboardingAgeFilter,
} from "@/lib/firm/firm-onboarding-reporting";
import { staffOnboardingWorkload } from "@/lib/firm/firm-onboarding-workload";

function saveCsv(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

const ageOptions: Array<{ value: OnboardingAgeFilter; label: string }> = [
  { value: "all", label: "All ages" },
  { value: "not_due", label: "Not yet overdue" },
  { value: "1_7", label: "1–7 days overdue" },
  { value: "8_30", label: "8–30 days overdue" },
  { value: "31_60", label: "31–60 days overdue" },
  { value: "61_plus", label: "61+ days overdue" },
  { value: "unscheduled", label: "No due date" },
];

export function FirmOnboardingReportingPanel({
  firmId,
  clients,
  onChooseClient,
}: {
  firmId: string;
  clients: FirmClientRow[];
  onChooseClient: (companyId: string) => void;
}) {
  const getOverview = useServerFn(listFirmOnboardingOverview);
  const getStaff = useServerFn(listFirmOnboardingWorkloadContext);
  const getTrends = useServerFn(listFirmOnboardingTrends);
  const [selectedCompany, setSelectedCompany] = useState("all");
  const [selectedAssignee, setSelectedAssignee] = useState("all");
  const [age, setAge] = useState<OnboardingAgeFilter>("all");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [days, setDays] = useState<30 | 60 | 90>(30);
  const [exportingOperational, setExportingOperational] = useState(false);
  const [exportingHistory, setExportingHistory] = useState(false);
  const overviewQ = useQuery({
    queryKey: ["firm-onboarding-overview", firmId],
    queryFn: () => getOverview({ data: { firmId } }),
    enabled: Boolean(firmId),
  });
  const staffQ = useQuery({
    queryKey: ["firm-onboarding-workload-context", firmId],
    queryFn: () => getStaff({ data: { firmId } }),
    enabled: Boolean(firmId),
  });
  const historyQ = useQuery({
    queryKey: ["firm-onboarding-trends", firmId, days],
    queryFn: () => getTrends({ data: { firmId, days } }),
    enabled: Boolean(firmId),
  });
  const knownClients = useMemo(
    () => clients.filter((client) => Boolean(client.companies)),
    [clients],
  );
  const clientNames = useMemo(
    () => new Map(knownClients.map((c) => [c.company_id, getFirmClientName(c)])),
    [knownClients],
  );
  const staff = useMemo(() => staffQ.data?.staff ?? [], [staffQ.data?.staff]);
  const visibleIds = useMemo(() => new Set(clientNames.keys()), [clientNames]);
  const effectiveCompany = visibleIds.has(selectedCompany) ? selectedCompany : "all";
  const effectiveAssignee =
    selectedAssignee === "all" || selectedAssignee === "unassigned" ||
      staff.some((member) => member.user_id === selectedAssignee)
      ? selectedAssignee
      : "all";
  const today = new Date().toISOString().slice(0, 10);
  const liveRows = useMemo(
    () => (overviewQ.data ?? []).filter((row) => visibleIds.has(row.company_id)),
    [overviewQ.data, visibleIds],
  );
  const staffNames = useMemo(
    () => new Map(staff.map((person) => [person.user_id, person.display_name])),
    [staff],
  );
  const filtered = useMemo(
    () => onboardingOperationalRows(liveRows, today, {
      companyId: effectiveCompany,
      assigneeId: effectiveAssignee,
      age,
      includeCompleted,
    }),
    [liveRows, today, effectiveCompany, effectiveAssignee, age, includeCompleted],
  );
  const counts = useMemo(() => onboardingAgeCounts(filtered), [filtered]);
  const historicalIds = useMemo(
    () => new Set(
      [...visibleIds].filter((companyId) =>
        effectiveCompany === "all" || companyId === effectiveCompany,
      ),
    ),
    [visibleIds, effectiveCompany],
  );
  const dailyTrends = useMemo(
    () => onboardingDailyTrends(historyQ.data ?? [], historicalIds),
    [historyQ.data, historicalIds],
  );
  const workloads = useMemo(
    () => staff.map((person) => ({
      ...person,
      ...staffOnboardingWorkload(
        liveRows, person.user_id, person.max_open_steps, today,
      ),
    })).sort((a, b) =>
      b.utilizationPercent - a.utilizationPercent || a.display_name.localeCompare(b.display_name),
    ),
    [staff, liveRows, today],
  );
  const operationalReady =
    overviewQ.isSuccess && staffQ.isSuccess && knownClients.length > 0;
  const historicalReady = historyQ.isSuccess && knownClients.length > 0;
  const reportError = overviewQ.error ?? staffQ.error ?? historyQ.error;
  const isLoading = overviewQ.isPending || staffQ.isPending || historyQ.isPending;

  async function exportCurrentOperations() {
    if (!operationalReady || exportingOperational) return;
    setExportingOperational(true);
    try {
      // Reauthorize at download time, not only when the screen first loads.
      const [currentRows, currentStaff] = await Promise.all([
        getOverview({ data: { firmId } }),
        getStaff({ data: { firmId } }),
      ]);
      const authorized = currentRows.filter((row) => visibleIds.has(row.company_id));
      const exportRows = onboardingOperationalRows(authorized, today, {
        companyId: effectiveCompany,
        assigneeId: effectiveAssignee,
        age,
        includeCompleted,
      });
      if (!exportRows.length) {
        toast.message("No authorized tasks match the selected filters");
        return;
      }
      const names = new Map(
        currentStaff.staff.map((person) => [person.user_id, person.display_name]),
      );
      saveCsv(
        `firm-onboarding-operations-${today}.csv`,
        onboardingOperationsCsv(exportRows, clientNames, names),
      );
      toast.success(`Exported ${exportRows.length} authorized task rows`);
    } catch (error) {
      toast.error("Export failed: " + friendlyAuthError(error));
    } finally {
      setExportingOperational(false);
    }
  }

  async function exportObservedHistory() {
    if (!historicalReady || exportingHistory) return;
    setExportingHistory(true);
    try {
      // Refetch under the current session; RLS may have revoked client access.
      const currentSnapshots = await getTrends({ data: { firmId, days } });
      const authorizedTrends = onboardingDailyTrends(currentSnapshots, historicalIds);
      if (!authorizedTrends.length) {
        toast.message("No authorized historical observations are available");
        return;
      }
      saveCsv(
        `firm-onboarding-observed-trend-${today}.csv`,
        onboardingTrendCsv(authorizedTrends),
      );
      toast.success(`Exported ${authorizedTrends.length} observed reporting dates`);
    } catch (error) {
      toast.error("History export failed: " + friendlyAuthError(error));
    } finally {
      setExportingHistory(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4"
      aria-label="Advanced onboarding operational reports">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Onboarding reports and trends</h3>
          <p className="text-sm text-muted-foreground">
            Live overdue ageing and staff comparisons, plus actual daily UTC
            observations for clients you are authorized to access.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={isLoading}
          onClick={() => {
            void overviewQ.refetch();
            void staffQ.refetch();
            void historyQ.refetch();
          }}>
          Refresh reports
        </Button>
      </div>
      {reportError && (
        <p role="alert" className="text-sm text-destructive">
          A report query failed. Only successfully loaded reports can be exported:
          {friendlyAuthError(reportError)}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label>Client</Label>
          <Select value={effectiveCompany}
            onValueChange={setSelectedCompany}>
            <SelectTrigger aria-label="Filter onboarding report by client">
              <SelectValue placeholder="All accessible clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accessible clients</SelectItem>
              {knownClients.map((c) => (
                <SelectItem key={c.company_id} value={c.company_id}>
                  {getFirmClientName(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Assigned staff</Label>
          <Select value={effectiveAssignee}
            onValueChange={setSelectedAssignee}>
            <SelectTrigger aria-label="Filter onboarding report by staff">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assigned staff</SelectItem>
              <SelectItem value="unassigned">Unassigned tasks</SelectItem>
              {staff.map((member) => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {member.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Overdue age</Label>
          <Select value={age}
            onValueChange={(value) => setAge(value as OnboardingAgeFilter)}>
            <SelectTrigger aria-label="Filter overdue ageing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ageOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Completion</Label>
          <Select value={includeCompleted ? "all" : "open"}
            onValueChange={(value) => setIncludeCompleted(value === "all")}>
            <SelectTrigger aria-label="Filter open and completed onboarding tasks">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open tasks only</SelectItem>
              <SelectItem value="all">Include completed tasks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ["Filtered tasks", filtered.length],
          ["1–7 days overdue", counts["1_7"]],
          ["8–30 days overdue", counts["8_30"]],
          ["31+ days overdue", counts["31_60"] + counts["61_plus"]],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums">
              {operationalReady ? value : "—"}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline"
          disabled={!operationalReady || !filtered.length || exportingOperational}
          onClick={() => void exportCurrentOperations()}>
          {exportingOperational ? "Verifying export…" : "Export filtered tasks (CSV)"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Only accessible client tasks and displayed filters are exported.
          CSV formula values are neutralized before download.
        </p>
      </div>
      <div className="max-h-64 overflow-auto rounded-md border">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="p-2">Client and task</th>
              <th className="p-2">Due date</th>
              <th className="p-2">Assigned to</th>
              <th className="p-2">Age</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {operationalReady && filtered.slice(0, 30).map((row) => (
              <tr key={row.company_id + ":" + row.task_key} className="border-t">
                <td className="p-2">
                  <div className="font-medium">{row.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {clientNames.get(row.company_id) ?? "Authorized client"}
                  </div>
                </td>
                <td className="p-2">{row.due_date ?? "—"}</td>
                <td className="p-2">
                  {row.assignee_id
                    ? staffNames.get(row.assignee_id) ?? "Assigned colleague"
                    : "Unassigned"}
                </td>
                <td className="p-2">
                  {row.completed_at ? "Complete"
                    : row.daysOverdue ? `${row.daysOverdue} days overdue`
                      : row.blocked ? "Blocked" : "Not due"}
                </td>
                <td className="p-2">
                  <Button size="sm" variant="outline"
                    onClick={() => onChooseClient(row.company_id)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {operationalReady && !filtered.length && (
          <p className="p-3 text-sm text-muted-foreground">
            No tasks match these filters.
          </p>
        )}
        {filtered.length > 30 && (
          <p className="p-2 text-xs text-muted-foreground">
            Showing the first 30 tasks; CSV includes every filtered task.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Staff workload comparison</h4>
        <p className="text-xs text-muted-foreground">
          Based on the accessible client subset. Capacity is an advisory target.
        </p>
        <div className="max-h-44 space-y-2 overflow-y-auto">
          {operationalReady && workloads.length ? workloads.map((person) => (
            <div key={person.user_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
              <span className="font-medium">{person.display_name}</span>
              <span className="tabular-nums">
                {person.assignedOpen} / {person.capacity} open steps
                {" · "}{person.utilizationPercent}% utilization
                {" · "}{person.overdue} overdue
              </span>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">
              No staff workload comparison available.
            </p>
          )}
        </div>
      </div>
      <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-40 space-y-1">
            <Label>Historical observation window</Label>
            <Select value={String(days)}
              onValueChange={(value) => setDays(Number(value) as 30 | 60 | 90)}>
              <SelectTrigger aria-label="Historical reporting window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline"
            disabled={!historicalReady || !dailyTrends.length || exportingHistory}
            onClick={() => void exportObservedHistory()}>
            {exportingHistory ? "Verifying export…" : "Export observed trends (CSV)"}
          </Button>
        </div>
        <h4 className="text-sm font-semibold">Completion trend (recorded observations only)</h4>
        <p className="text-xs text-muted-foreground">
          Daily snapshots start with the first scheduled capture after migration.
          Previous dates are not reconstructed. Changing accessible clients
          can change the observed reporting population.
          Historical snapshots are per client; staff filters apply only to live tasks.
        </p>
        {historyQ.isPending ? (
          <p className="text-sm text-muted-foreground">Loading daily snapshots…</p>
        ) : historicalReady && !dailyTrends.length ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No recorded daily snapshots yet. The scheduled daily capture
            will populate the first available observation.
          </p>
        ) : historicalReady ? (
          <div className="space-y-2" aria-label="Observed completion percentages by UTC date">
            {dailyTrends.slice(-14).reverse().map((day) => (
              <div key={day.date} className="rounded-md border p-3 text-sm">
                <div className="mb-2 flex flex-wrap justify-between gap-2">
                  <span>{day.date} · {day.clientCount} clients</span>
                  <span className="font-medium tabular-nums">
                    {day.completed}/{day.total} complete · {day.completionPercent}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`Completion percentage on ${day.date}`}
                  aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={day.completionPercent}>
                  <div className="h-full bg-primary"
                    style={{ width: `${day.completionPercent}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {day.overdue} overdue · {day.blocked} blocked ·
                  {" "}{day.unassigned} unassigned
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
