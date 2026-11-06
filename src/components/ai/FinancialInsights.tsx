import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, RefreshCw, ShieldCheck, TrendingDown } from "lucide-react";
import { getManagementMetrics } from "@/lib/reports/ecosystem.functions";
import { todayIso, monthStart } from "@/lib/accounting/fiscal-year";
import { priorPeriodRange } from "@/lib/reports/statements";
import { isReportDate } from "@/lib/reports/date-validation";
import {
  buildFinancialInsights,
  type FinancialSnapshot,
} from "@/lib/ai/financial-insights";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BasisSelection = "organisation" | "accrual" | "cash";
type Selection = { from: string; to: string; basis: BasisSelection };
const now = todayIso();
const INITIAL: Selection = { from: monthStart(now), to: now, basis: "organisation" };

/**
 * Strictly read-only: the figures come from the existing server-authorised
 * Management Metrics reporting function, never from a model estimate.
 */
export function AiFinancialInsights({
  companyId,
  currency,
  canUse,
  canViewReports,
}: {
  companyId: string;
  currency: string;
  canUse: boolean;
  canViewReports: boolean;
}) {
  const load = useServerFn(getManagementMetrics);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Selection>(INITIAL);
  const [active, setActive] = useState<Selection>(INITIAL);
  const [compare, setCompare] = useState(true);
  const [error, setError] = useState("");
  const validRange = isReportDate(active.from) && isReportDate(active.to) && active.from <= active.to;
  const enabled = canUse && canViewReports && validRange;
  const previousRange = validRange ? priorPeriodRange(active.from, active.to) : null;
  const requestedBasis = active.basis === "organisation" ? {} : { basis: active.basis };
  const currentQ = useQuery({
    queryKey: ["ai-financial-insights", companyId, active.from, active.to, active.basis, "current"],
    queryFn: () => load({ data: { companyId, from: active.from, to: active.to, ...requestedBasis } }),
    enabled,
    staleTime: 60_000,
  });
  const priorQ = useQuery({
    queryKey: ["ai-financial-insights", companyId, active.from, active.to, active.basis, "prior"],
    queryFn: () => {
      if (!previousRange) throw new Error("Choose a valid reporting period.");
      return load({
        data: { companyId, from: previousRange.from, to: previousRange.to, ...requestedBasis },
      });
    },
    enabled: enabled && compare && Boolean(previousRange),
    staleTime: 60_000,
  });

  if (!canUse) return null;

  const current = currentQ.data as FinancialSnapshot | undefined;
  const previous = compare && !priorQ.isError && !priorQ.isPending
    ? (priorQ.data as FinancialSnapshot | undefined)
    : undefined;
  const result = current ? buildFinancialInsights(current, previous ?? null, currency) : null;
  const waitingForComparison = compare && priorQ.isPending;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isReportDate(draft.from) || !isReportDate(draft.to) || draft.from > draft.to) {
      setError("Choose real dates with the end date on or after the start date.");
      return;
    }
    setError("");
    setActive({ ...draft });
  }

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="size-4" /> Financial insights
          <Badge variant="secondary">Calculated · no model</Badge>
        </CardTitle>
        <CardDescription>
          Verified revenue, profit, cash and liquidity metrics from the same report facts used by
          LinkBooks management reporting. No generated numbers, automated journal entries or
          payments. Open the source reports to inspect the underlying accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canViewReports ? (
          <Alert>
            <ShieldCheck className="size-4" />
            <AlertTitle>Reporting permission required</AlertTitle>
            <AlertDescription>
              Financial insights require both AI access and the Reports View permission.
              Your current role cannot load these figures.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3" aria-label="Financial insight filters">
              <div className="space-y-1.5">
                <Label htmlFor="ai-insights-from">From</Label>
                <Input
                  id="ai-insights-from"
                  type="date"
                  required
                  className="w-44"
                  value={draft.from}
                  onChange={(event) => setDraft((old) => ({ ...old, from: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-insights-to">To</Label>
                <Input
                  id="ai-insights-to"
                  type="date"
                  required
                  className="w-44"
                  value={draft.to}
                  onChange={(event) => setDraft((old) => ({ ...old, to: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-insights-basis">Accounting basis</Label>
                <Select
                  value={draft.basis}
                  onValueChange={(value) =>
                    setDraft((old) => ({ ...old, basis: value as BasisSelection }))
                  }
                >
                  <SelectTrigger id="ai-insights-basis" className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organisation">Organisation default</SelectItem>
                    <SelectItem value="accrual">Accrual</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" variant="outline">Run insights</Button>
              <Button
                type="button"
                variant="ghost"
                disabled={currentQ.isFetching || priorQ.isFetching}
                onClick={() => void qc.invalidateQueries({ queryKey: ["ai-financial-insights", companyId] })}
              >
                <RefreshCw className="size-4" /> Refresh
              </Button>
            </form>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-insights-compare"
                checked={compare}
                onCheckedChange={(value) => setCompare(value === true)}
              />
              <Label htmlFor="ai-insights-compare" className="font-normal">
                Compare with the preceding equal-length period
              </Label>
            </div>
            {currentQ.isPending ? (
              <div role="status" className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                Calculating metrics from the authorised reporting engine…
              </div>
            ) : currentQ.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Financial insight data unavailable</AlertTitle>
                <AlertDescription>
                  {friendlyAuthError(currentQ.error)}{" "}
                  <Button size="sm" variant="outline" onClick={() => void currentQ.refetch()}>Retry</Button>
                </AlertDescription>
              </Alert>
            ) : result && current ? (
              <>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Period: {current.from} to {current.to}</span>
                  <span>·</span>
                  <span>Basis: {current.accountingBasis}</span>
                  <span>·</span>
                  <span>Currency: {currency}</span>
                  {current.capturedAt ? (
                    <>
                      <span>·</span>
                      <span>Captured: {current.capturedAt}</span>
                    </>
                  ) : null}
                </div>
                {compare && waitingForComparison ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    Loading preceding period for comparison…
                  </p>
                ) : compare && priorQ.isError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Comparison unavailable</AlertTitle>
                    <AlertDescription>
                      {friendlyAuthError(priorQ.error)}. Current-period figures remain available.
                      <Button size="sm" variant="outline" onClick={() => void priorQ.refetch()}>Retry comparison</Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {result.cards.map((card) => (
                    <div key={card.id} className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                      <p className="mt-1 break-words text-xl font-semibold tabular-nums">{card.value}</p>
                      {card.priorValue !== null ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Prior: {card.priorValue}
                          {card.change !== null ? <span> · Change: {card.change}</span> : null}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">{card.description}</p>
                      <Link
                        to="/reports/$reportId"
                        params={{ reportId: card.sourceReportId }}
                        search={{ from: active.from, to: active.to, basis: current.accountingBasis === "cash" ? "cash" : "accrual" }}
                        className="mt-2 inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        View source report
                      </Link>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 rounded-lg border p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <TrendingDown className="size-4" /> Review observations
                  </p>
                  {result.observations.map((finding) => (
                    <div key={finding.id} className="flex flex-wrap items-start justify-between gap-2 border-t pt-2 text-sm first:border-0 first:pt-0">
                      <p className="max-w-3xl text-muted-foreground">{finding.text}</p>
                      <Link
                        to="/reports/$reportId"
                        params={{ reportId: finding.sourceReportId }}
                        search={{ from: active.from, to: active.to, basis: current.accountingBasis === "cash" ? "cash" : "accrual" }}
                        className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
                      >
                        Check report
                      </Link>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Reporting basis, cut-off and posted-ledger completeness affect all results.
                  Prior comparisons show absolute changes, not causes, and are omitted if the
                  periods or bases are incompatible. Bank GL balances are not independently
                  reconciled bank-feed balances. Insights are review prompts, not audit or tax conclusions.
                </p>
              </>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
