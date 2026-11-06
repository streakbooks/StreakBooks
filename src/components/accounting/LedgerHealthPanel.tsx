import { useState } from "react";
import { useCanDo } from "@/hooks/use-can";
import { PayrollLiabilityRollforwardPanel } from "@/components/accounting/PayrollLiabilityRollforwardPanel";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleSlash, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { runLedgerHealthCheck } from "@/lib/accounting/ledger-health.functions";
import {
  checkHref,
  headline,
  problemLabel,
  type HealthItem,
  type HealthReport,
  type HealthStatus,
} from "@/lib/accounting/ledger-health";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  filteredHealthChecks,
  healthStatusCounts,
  ledgerHealthCsv,
  type HealthFilter,
} from "@/lib/accounting/ledger-health-view";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ICON: Record<HealthStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: TriangleAlert,
  fail: XCircle,
  na: CircleSlash,
};
const TONE: Record<HealthStatus, string> = {
  pass: "text-emerald-600",
  warn: "text-amber-600",
  fail: "text-destructive",
  na: "text-muted-foreground",
};
const WORD: Record<HealthStatus, string> = {
  pass: "Passed",
  warn: "Needs a look",
  fail: "Failed",
  na: "Not applicable",
};

const HIDDEN_KEYS = new Set(["id", "journal_id", "problem"]);

function itemText(
  item: HealthItem,
  baseCurrency: string,
  money: (minor: number, currency: string) => string,
): string {
  const currency =
    typeof item["currency"] === "string" ? (item["currency"] as string) : baseCurrency;
  const parts: string[] = [];
  if (typeof item["problem"] === "string") parts.push(problemLabel(item["problem"]));
  for (const [k, v] of Object.entries(item)) {
    if (HIDDEN_KEYS.has(k) || v === null || v === "") continue;
    const label = k.replace(/_minor$/, "").replace(/_/g, " ");
    parts.push(
      k.endsWith("_minor") && typeof v === "number"
        ? `${label}: ${money(v, currency)}`
        : `${label}: ${String(v)}`,
    );
  }
  return parts.join(" · ");
}

/** Accounting settings: runs the read-only ledger checks and shows an honest pass/fail for each. */
export function LedgerHealthPanel({ companyId }: { companyId: string }) {
  const canViewPayroll = useCanDo("payroll.view");
  const fmt = useFormat();
  const run = useServerFn(runLedgerHealthCheck);
  const mutation = useMutation({ mutationFn: () => run({ data: { companyId } }) });
  const result = mutation.data;
  const report: HealthReport | null =
    !mutation.isError && result && "report" in result ? result.report : null;
  const [statusFilter, setStatusFilter] = useState<HealthFilter>("issues");
  const [search, setSearch] = useState("");
  const counts = report ? healthStatusCounts(report.checks) : null;
  const visibleChecks = report ? filteredHealthChecks(report.checks, statusFilter, search) : [];

  const downloadSnapshot = () => {
    if (!report) return;
    const csv = ledgerHealthCsv(report);
    const url = URL.createObjectURL(
      new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `linkbooks-ledger-health-${companyId.slice(0, 8)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold leading-none tracking-tight">Ledger health check</h2>
        <CardDescription>
          Read-only checks on the books: trial balance, journal balance, orphan lines, documents
          against journals, receivables and payables against the ledger, and period locks. It
          changes nothing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {report ? "Run again" : "Run health check"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!report || mutation.isPending}
            onClick={downloadSnapshot}
          >
            Export health snapshot CSV
          </Button>
        </div>

        {mutation.isError ? (
          <Alert variant="destructive">
            <AlertTitle>The check could not run</AlertTitle>
            <AlertDescription>{friendlyAuthError(mutation.error)}</AlertDescription>
          </Alert>
        ) : null}

        {result && "unavailable" in result ? (
          <Alert>
            <AlertTitle>Unavailable</AlertTitle>
            <AlertDescription>{result.unavailable}</AlertDescription>
          </Alert>
        ) : null}

        {report ? (
          <>
            <p
              role="status"
              className={cn(
                "text-sm font-medium",
                report.overall === "pass"
                  ? "text-emerald-600"
                  : report.overall === "warn"
                    ? "text-amber-600"
                    : "text-destructive",
              )}
            >
              {headline(report)}{" "}
              <span className="font-normal text-muted-foreground">
                {report.journalsChecked} posted journals and {report.linesChecked} lines checked
                {report.generatedAt ? ` at ${new Date(report.generatedAt).toLocaleString()}` : ""}.
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {counts?.fail ?? 0} failed · {counts?.warn ?? 0} warnings · {counts?.pass ?? 0}{" "}
                passed · {counts?.na ?? 0} not applicable
              </span>
              <span className="text-xs text-muted-foreground">
                Snapshot only — rerun after correcting financial records.
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="health-filter">Show checks</Label>
                <select
                  id="health-filter"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as HealthFilter)}
                >
                  {/* lookup-fixed-enum: Short presentation enumeration, not business records. */}
                  <option value="issues">Issues (failed and warnings)</option>
                  <option value="all">All checks</option>
                  <option value="fail">Failed only</option>
                  <option value="warn">Warnings only</option>
                  <option value="pass">Passed only</option>
                  <option value="na">Not applicable</option>
                </select>
              </div>
              <div className="min-w-40 flex-1 space-y-1">
                <Label htmlFor="health-search">Search checks</Label>
                <Input
                  id="health-search"
                  placeholder="Check, problem or detail"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground" role="status">
              Displaying {visibleChecks.length} of {report.checks.length} checks. Exports include
              the full returned snapshot, not just filtered checks.
            </p>
            {visibleChecks.length === 0 ? (
              <p className="rounded-md border p-4 text-sm text-muted-foreground">
                No checks match this filter. Choose All checks to view the full report.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {visibleChecks.map((c) => {
                  const Icon = ICON[c.status];
                  const href = checkHref(c.key);
                  return (
                    <li key={c.key} className="space-y-1 p-3">
                      <div className="flex items-start gap-2">
                        <Icon
                          className={cn("mt-0.5 h-4 w-4 shrink-0", TONE[c.status])}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{c.label}</span>
                            <span className={cn("text-xs", TONE[c.status])}>{WORD[c.status]}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{c.summary}</p>
                        </div>
                        {href && (c.status === "fail" || c.status === "warn") ? (
                          <Button asChild size="sm" variant="ghost">
                            <Link to={href as never}>Review</Link>
                          </Button>
                        ) : null}
                      </div>
                      {c.status !== "pass" && c.status !== "na" && c.items.length > 0 ? (
                        <ul className="ml-6 space-y-0.5 text-xs text-muted-foreground">
                          {c.items.map((item, i) => (
                            <li key={i}>
                              {itemText(item, report.baseCurrency, (minor, cur) =>
                                fmt.amount(minor, cur),
                              )}
                            </li>
                          ))}
                          {c.count > c.items.length ? (
                            <li>…and {c.count - c.items.length} more.</li>
                          ) : null}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
    {canViewPayroll ? <PayrollLiabilityRollforwardPanel companyId={companyId} /> : null}
    </div>
  );
}
