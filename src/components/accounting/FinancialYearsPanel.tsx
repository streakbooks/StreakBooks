import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listPeriods, unlockPeriod, type PeriodRow } from "@/lib/accounting/accounting.functions";
import { useCanDo } from "@/hooks/use-can";
import {
  assertPeriodStillLocked,
  filterFinancialYears,
  financialYearSummary,
  financialYearsCsv,
  type FinancialYearFilter,
} from "@/lib/accounting/financial-years-review";
import { createFinancialYear } from "@/lib/accounting/period-close.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useFormat } from "@/hooks/use-format";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** AC-01: financial years / accounting periods, with creation for any date (past or future). */
export function FinancialYearsPanel({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const f = useFormat();
  const canLock = useCanDo("periods.lock");
  const canCreate = useCanDo("accounting.post");
  const fetchPeriods = useServerFn(listPeriods);
  const doCreate = useServerFn(createFinancialYear);
  const doUnlock = useServerFn(unlockPeriod);
  const [date, setDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<FinancialYearFilter>("all");
  const [search, setSearch] = useState("");

  const periods = useQuery({
    queryKey: ["periods", companyId],
    queryFn: () => fetchPeriods({ data: { companyId } }),
  });

  const create = useMutation({
    mutationFn: () => doCreate({ data: { companyId, date } }),
    onSuccess: async () => {
      toast.success("Financial year ready");
      setDate("");
      await qc.invalidateQueries({ queryKey: ["periods", companyId] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const unlock = useMutation({
    mutationFn: async (period: PeriodRow) => {
      const latest = await fetchPeriods({ data: { companyId } });
      assertPeriodStillLocked(
        period,
        latest.find((row) => row.id === period.id),
      );
      return doUnlock({ data: { periodId: period.id } });
    },
    onSuccess: async () => {
      toast.success("Period unlocked");
      await qc.invalidateQueries({ queryKey: ["periods", companyId] });
    },
    onError: async (e) => {
      toast.error(friendlyAuthError(e));
      await qc.invalidateQueries({ queryKey: ["periods", companyId] });
    },
  });

  const rows = periods.data ?? [];
  const counts = financialYearSummary(rows);
  const shown = filterFinancialYears(rows, statusFilter, search);
  const exportPeriods = () => {
    const csv = financialYearsCsv(rows);
    const url = URL.createObjectURL(
      new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "linkbooks-financial-years.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a financial year</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Posting to a date with no period creates its financial year automatically. Use this to
            prepare a year ahead, or to load prior-year history. Locked dates are never reopened.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="fy-date">Any date in the year</Label>
              <Input
                id="fy-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <Button
              disabled={!canCreate || !date || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create financial year
            </Button>
          </div>
        </CardContent>
      </Card>

      {periods.isPending ? (
        <LoadingState />
      ) : periods.isError ? (
        <QueryErrorState queries={[periods]} title="Could not load periods" />
      ) : !periods.isSuccess ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No accounting periods"
          description="Add a financial year above, or use Ensure CoA & periods."
        />
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="financial-year-status">Status</Label>
                <select
                  id="financial-year-status"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as FinancialYearFilter)}
                >
                  {/* lookup-fixed-enum: Period status labels, not financial records. */}
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="locked">Locked</option>
                </select>
              </div>
              <div className="min-w-44 flex-1 space-y-1">
                <Label htmlFor="financial-year-search">Find a financial year</Label>
                <Input
                  id="financial-year-search"
                  value={search}
                  placeholder="Year, name or date"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Button variant="outline" onClick={exportPeriods}>
                Export periods CSV
              </Button>
            </div>
            <p role="status" className="text-xs text-muted-foreground">
              {counts.open} open · {counts.locked} locked · {counts.total} total. Showing{" "}
              {shown.length} matching periods. Export includes the full catalogue.
            </p>
            {shown.length === 0 ? (
              <p className="rounded-md border p-4 text-sm text-muted-foreground">
                No financial years match. Change the search or status filter.
              </p>
            ) : null}
            {shown.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.date(p.start_date)} → {f.date(p.end_date)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.status === "open" ? "secondary" : "outline"}>{p.status}</Badge>
                  {p.status === "open" ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/accounting" search={{ tab: "close", period: p.id }}>
                        Review &amp; lock
                      </Link>
                    </Button>
                  ) : null}
                  {p.status === "locked" && canLock ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={unlock.isPending}
                      onClick={() => {
                        const message = `Unlock ${p.name} (${p.start_date} to ${p.end_date})? This reopens the period for new and backdated postings. Check with your financial controller before proceeding.`;
                        if (window.confirm(message)) unlock.mutate(p);
                      }}
                    >
                      Unlock
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              All locks are initiated from Period close, where the latest checklist is reviewed
              before locking. Unlocking is a separate financial control; use it only with approval.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
