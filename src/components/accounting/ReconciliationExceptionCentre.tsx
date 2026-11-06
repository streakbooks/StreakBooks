import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCanDo } from "@/hooks/use-can";
import { runLedgerHealthCheck } from "@/lib/accounting/ledger-health.functions";
import { auditRecentRealisedFx } from "@/lib/accounting/fx-ledger-audit.functions";
import { auditFxRevaluationLedger } from "@/lib/accounting/fx-revaluation-ledger-audit.functions";
import { auditDeferralLedger } from "@/lib/accounting/deferral-ledger-audit.functions";
import { listDeferrals } from "@/lib/accounting/deferrals.functions";
import { getFxOverview } from "@/lib/accounting/fx.functions";
import { getPayrollLiabilityRollforward } from "@/lib/accounting/payroll-liability-rollforward.functions";
import {
  createExceptionSnapshot, exceptionSnapshotCsv, filterExceptionFindings,
  type AuditCapture, type ExceptionFilter, type ExceptionSource,
} from "@/lib/accounting/reconciliation-exceptions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { HealthReport } from "@/lib/accounting/ledger-health";
import type { FxRealisedAuditResult } from "@/lib/accounting/fx-ledger-audit";
import type { FxRunAuditReport } from "@/lib/accounting/fx-revaluation-ledger-audit";
import type { DeferralAuditResult } from "@/lib/accounting/deferral-ledger-audit";
import type { LiabilityRollforwardResult } from "@/lib/accounting/payroll-liability-rollforward";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCES: { key: ExceptionSource; name: string }[] = [
  { key: "ledger", name: "Ledger health" },
  { key: "fx_realised", name: "Realised FX" },
  { key: "fx_revaluation", name: "FX revaluation" },
  { key: "deferrals", name: "Deferrals" },
  { key: "payroll", name: "Payroll liability" },
  { key: "fixed_assets", name: "Fixed assets" },
];
function capture<T>(result: T | undefined, isError: boolean, error: unknown): AuditCapture<T> {
  return isError
    ? { state: "unavailable", message: friendlyAuthError(error) }
    : result ? { state: "checked", result } : { state: "not_run" };
}
function scopeTab(source: ExceptionSource): "health" | "fx" | "deferrals" {
  return source === "fx_realised" || source === "fx_revaluation" ? "fx"
    : source === "deferrals" ? "deferrals" : "health";
}

/**
 * Exception review is deliberately session-only (not persisted or an approval).
 * Each audit keeps its original permissions, row bounds and RLS enforcement.
 */
export function ReconciliationExceptionCentre({ companyId }: { companyId: string }) {
  const canPayroll = useCanDo("payroll.view");
  const fetchHealth = useServerFn(runLedgerHealthCheck);
  const fetchRealised = useServerFn(auditRecentRealisedFx);
  const fetchReval = useServerFn(auditFxRevaluationLedger);
  const fetchDeferral = useServerFn(auditDeferralLedger);
  const fetchPayroll = useServerFn(getPayrollLiabilityRollforward);
  const fetchSchedules = useServerFn(listDeferrals);
  const fetchRevaluations = useServerFn(getFxOverview);
  const ledger = useMutation({ mutationFn: () => fetchHealth({ data: { companyId } }) });
  const realised = useMutation({ mutationFn: () => fetchRealised({ data: { companyId } }) });
  const revaluation = useMutation({
    mutationFn: (runId: string) => fetchReval({ data: { companyId, runId } }),
  });
  const deferrals = useMutation({
    mutationFn: (scheduleId: string) => fetchDeferral({ data: { companyId, scheduleId } }),
  });
  const payroll = useMutation({
    mutationFn: (range: { from: string; to: string }) =>
      fetchPayroll({ data: { companyId, ...range } }),
  });
  const recentSchedules = useMutation({
    mutationFn: () => fetchSchedules({ data: { companyId, page: 1 } }),
  });
  const recentRevaluations = useMutation({
    mutationFn: () => fetchRevaluations({ data: { companyId } }),
  });
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [revalId, setRevalId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<ExceptionFilter["source"]>("all");
  const [severity, setSeverity] = useState<ExceptionFilter["severity"]>("all");
  const [reviewFilter, setReviewFilter] = useState<ExceptionFilter["review"]>("unreviewed");
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set());

  const ledgerPayload = ledger.data && "report" in ledger.data ? ledger.data.report : undefined;
  const ledgerCapture: AuditCapture<HealthReport> = ledger.data && "unavailable" in ledger.data
    ? { state: "unavailable", message: ledger.data.unavailable }
    : capture(ledgerPayload, ledger.isError, ledger.error);
  const realisedCapture: AuditCapture<FxRealisedAuditResult> = capture(
    realised.data, realised.isError, realised.error,
  );
  const revalCapture: AuditCapture<FxRunAuditReport> = capture(
    revaluation.data, revaluation.isError, revaluation.error,
  );
  const deferralCapture: AuditCapture<DeferralAuditResult> = capture(
    deferrals.data, deferrals.isError, deferrals.error,
  );
  const payrollCapture: AuditCapture<LiabilityRollforwardResult> = canPayroll
    ? capture(payroll.data, payroll.isError, payroll.error)
    : { state: "unavailable", message: "Requires both Payroll and Accounting viewing permissions." };
  const snapshot = createExceptionSnapshot({
    ledger: ledgerCapture,
    realisedFx: realisedCapture,
    revaluation: revalCapture,
    deferrals: deferralCapture,
    payroll: payrollCapture,
  });
  const filtered = filterExceptionFindings(snapshot.findings, {
    source, severity, search, review: reviewFilter,
  }, reviewed);
  const reviewedCount = snapshot.findings.filter(row => reviewed.has(row.key)).length;
  const hasPending = ledger.isPending || realised.isPending || revaluation.isPending ||
    deferrals.isPending || payroll.isPending ||
    recentSchedules.isPending || recentRevaluations.isPending;
  const clearReviews = () => setReviewed(new Set());
  const exportCsv = () => {
    const csv = exceptionSnapshotCsv(snapshot, reviewed);
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), csv], {
      type: "text/csv;charset=utf-8",
    }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "linkbooks-reconciliation-exceptions-" + companyId.slice(0,8) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reconciliation Exception Centre</CardTitle>
          <CardDescription>
            Consolidate verified findings from existing read-only Accounting audits.
            Checks run only when requested, not automatically on page load.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => {
              clearReviews();
              ledger.mutate();
              realised.mutate();
            }} disabled={hasPending}>
              {ledger.isPending || realised.isPending ? "Checking books…" : "Run core ledger and realised FX checks"}
            </Button>
            <Button type="button" variant="outline" disabled={snapshot.findings.length === 0 && snapshot.coverage.every(x => x.state === "not_run")}
              onClick={exportCsv}>Export findings and coverage CSV</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-semibold">Payroll liability</p>
              <div className="flex flex-wrap gap-2">
                <div className="space-y-1">
                  <Label htmlFor="exc-from">From</Label>
                  <Input id="exc-from" type="date" className="max-w-40" value={rangeFrom}
                    onChange={e => { setRangeFrom(e.target.value); payroll.reset(); clearReviews(); }}/>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exc-to">To</Label>
                  <Input id="exc-to" type="date" className="max-w-40" value={rangeTo}
                    onChange={e => { setRangeTo(e.target.value); payroll.reset(); clearReviews(); }}/>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={
                !canPayroll || !rangeFrom || !rangeTo || rangeFrom > rangeTo || hasPending
              } onClick={() => { clearReviews(); payroll.mutate({ from: rangeFrom, to: rangeTo }); }}>
                Audit selected Payroll period
              </Button>
              <p className="text-xs text-muted-foreground">
                Current net-pay account only, base currency. Permissioned server check.
              </p>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-semibold">Deferral recognition</p>
              <Label htmlFor="exc-schedule">Schedule ID</Label>
              <Input id="exc-schedule" value={scheduleId} placeholder="Select or enter schedule UUID"
                onChange={e => { setScheduleId(e.target.value); deferrals.reset(); clearReviews(); }}/>
              <Button type="button" variant="ghost" size="sm" disabled={hasPending}
                onClick={() => recentSchedules.mutate()}>
                {recentSchedules.isPending ? "Loading schedules…" : "Load recent schedules"}
              </Button>
              {recentSchedules.data ? (
                <select aria-label="Recent deferral schedules" value=""
                  className="w-full rounded-md border bg-background p-2 text-xs"
                  onChange={e => { setScheduleId(e.target.value); deferrals.reset(); clearReviews(); }}>
                  <option value="">Choose a schedule</option>
                  {recentSchedules.data.rows.map(row => (
                    <option value={row.id} key={row.id}>{row.name} · {row.reference}</option>
                  ))}
                </select>
              ) : null}
              {recentSchedules.isError ? <p role="alert" className="text-xs text-destructive">
                Schedules unavailable: {friendlyAuthError(recentSchedules.error)}
              </p> : null}
              {recentSchedules.data && recentSchedules.data.total > recentSchedules.data.rows.length ? (
                <p className="text-xs text-muted-foreground">
                  Showing latest {recentSchedules.data.rows.length} of {recentSchedules.data.total}.
                  Older schedules can be entered by UUID.
                </p>
              ) : null}
              <Button type="button" variant="outline" size="sm" disabled={!UUID.test(scheduleId) || hasPending}
                onClick={() => { clearReviews(); deferrals.mutate(scheduleId); }}>
                Audit selected schedule
              </Button>
              <p className="text-xs text-muted-foreground">
                Find schedules in <Link to="/accounting" search={{ tab: "deferrals" }} className="underline">Prepayments & deferred income</Link>.
              </p>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-semibold">Unrealised FX</p>
              <Label htmlFor="exc-reval">Revaluation run ID</Label>
              <Input id="exc-reval" value={revalId} placeholder="Select or enter revaluation UUID"
                onChange={e => { setRevalId(e.target.value); revaluation.reset(); clearReviews(); }}/>
              <Button type="button" variant="ghost" size="sm" disabled={hasPending}
                onClick={() => recentRevaluations.mutate()}>
                {recentRevaluations.isPending ? "Loading FX runs…" : "Load recent FX runs"}
              </Button>
              {recentRevaluations.data?.available ? (
                <select aria-label="Recent FX revaluation runs" value=""
                  className="w-full rounded-md border bg-background p-2 text-xs"
                  onChange={e => { setRevalId(e.target.value); revaluation.reset(); clearReviews(); }}>
                  <option value="">Choose a revaluation</option>
                  {recentRevaluations.data.runs.map(row => (
                    <option value={row.id} key={row.id}>{row.as_of_date} · Run {row.seq}</option>
                  ))}
                </select>
              ) : null}
              {recentRevaluations.isError || recentRevaluations.data?.unavailableReason ? (
                <p role="alert" className="text-xs text-destructive">
                  FX runs unavailable: {recentRevaluations.data?.unavailableReason ??
                    friendlyAuthError(recentRevaluations.error)}
                </p>
              ) : null}
              <Button type="button" variant="outline" size="sm" disabled={!UUID.test(revalId) || hasPending}
                onClick={() => { clearReviews(); revaluation.mutate(revalId); }}>
                Audit selected revaluation
              </Button>
              <p className="text-xs text-muted-foreground">
                Find runs in <Link to="/accounting" search={{ tab: "fx" }} className="underline">FX & reversals</Link>.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Audit coverage</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {snapshot.coverage.map(row => (
                <div key={row.source} className="rounded-md border p-3 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{row.label}</span>
                    <span className={row.state === "unavailable" ? "text-destructive" : "text-muted-foreground"}>
                      {row.state === "not_run" ? "Not checked" :
                        row.state === "checked" ? "Checked" :
                          row.state === "partial" ? "Partial coverage" : "Unavailable"}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{row.note}</p>
                  {row.checkedCount !== null ? <p className="mt-1">Records or checks evaluated: {row.checkedCount}</p> : null}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm" role="status">
            <span><strong>{snapshot.errors}</strong> error findings</span>
            <span><strong>{snapshot.warnings}</strong> warning findings</span>
            <span><strong>{reviewedCount}/{snapshot.findings.length}</strong> reviewed in this session</span>
            <span>{snapshot.coverage.filter(row => row.state === "checked").length} fully checked source(s) of {snapshot.coverage.length}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            A zero finding count is not an all-clear when audits are not run, partial, or unavailable.
            Session review checkmarks are local to this screen: not persisted and not an approval or accounting sign-off.
            Rerunning an audit clears these checkmarks.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exception review</CardTitle>
          <CardDescription>Search, filter, inspect and acknowledge findings for this browser session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1">
              <Label htmlFor="exc-search">Search findings</Label>
              <Input id="exc-search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Reference, journal, message, or module"/>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exc-source">Source</Label>
              <select id="exc-source" className="h-9 rounded-md border bg-background px-2 text-sm" value={source}
                onChange={e => setSource(e.target.value as ExceptionFilter["source"])}>
                <option value="all">All modules</option>
                {SOURCES.map(x => <option key={x.key} value={x.key}>{x.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exc-severity">Severity</Label>
              <select id="exc-severity" className="h-9 rounded-md border bg-background px-2 text-sm" value={severity}
                onChange={e => setSeverity(e.target.value as ExceptionFilter["severity"])}>
                <option value="all">All severities</option><option value="error">Errors</option>
                <option value="warning">Warnings</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exc-review">Review status</Label>
              <select id="exc-review" className="h-9 rounded-md border bg-background px-2 text-sm" value={reviewFilter}
                onChange={e => setReviewFilter(e.target.value as ExceptionFilter["review"])}>
                <option value="unreviewed">Not reviewed</option>
                <option value="reviewed">Reviewed this session</option>
                <option value="all">All findings</option>
              </select>
            </div>
          </div>
          <p role="status" className="text-xs text-muted-foreground">
            Showing {filtered.length} of {snapshot.findings.length} exception findings. One Ledger Health
            row may represent more than one underlying finding; see its displayed count.
          </p>
          {filtered.length === 0 ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              {snapshot.findings.length === 0
                ? "No findings have been returned. Run available audits and review the coverage above."
                : "No findings match your filters. Change severity, source or session review status."}
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {filtered.map(item => (
                <li key={item.key} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <Checkbox aria-label={"Reviewed in this session: " + item.title}
                      checked={reviewed.has(item.key)}
                      onCheckedChange={checked => setReviewed(old => {
                        const next = new Set(old);
                        if (checked === true) next.add(item.key); else next.delete(item.key);
                        return next;
                      })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">
                        <span className={item.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-300"}>
                          {item.severity === "error" ? "Error" : "Review"}
                        </span>
                        {" · "}{item.title} {item.findingCount > 1 ? "(" + item.findingCount + " findings)" : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{item.detail}</p>
                      {item.reference ? <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Source: {item.reference}</p> : null}
                    </div>
                    <div className="flex flex-col gap-1 text-xs">
                      {item.journalId ? (
                        <Link to="/accounting" search={{ tab: "journals", journal: item.journalId }}
                          className="text-primary underline">Open journal</Link>
                      ) : null}
                      {item.source === "fixed_assets" ? (
                        <Link to="/fixed-assets" className="text-primary underline">Review Fixed Assets</Link>
                      ) : (
                        <Link to="/accounting" search={{ tab: scopeTab(item.source) }}
                          className="text-primary underline">Open module</Link>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="text-xs text-muted-foreground">
            Fixed Assets audit coverage is not connected to this centre in this batch.
            <Link to="/fixed-assets" className="ml-1 underline">Open Fixed Assets for independent review.</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
