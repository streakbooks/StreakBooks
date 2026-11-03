import { useEffect, useState } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import type { DashboardData } from "@/components/dashboard/DashboardWidgets";
import {
  AgeingWidget,
  ApprovalsWidget,
  BankAccountsWidget,
  CashFlowWidget,
  ProfitWidget,
  TasksWidget,
  WatchlistWidget,
} from "@/components/dashboard/DashboardWidgets";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const WIDGETS = [
  { id: "cash-flow", label: "Cash flow" },
  { id: "bank-accounts", label: "Bank accounts" },
  { id: "receivables", label: "Receivables ageing" },
  { id: "payables", label: "Payables ageing" },
  { id: "profit", label: "Profit performance" },
  { id: "approvals", label: "Approvals" },
  { id: "watchlist", label: "Watchlist" },
  { id: "tasks", label: "Tasks" },
] as const;

type WidgetId = (typeof WIDGETS)[number]["id"];
const DEFAULT_WIDGETS: WidgetId[] = WIDGETS.map((item) => item.id);

function preferenceKey(companyId: string): string {
  return "linkbooks.dashboard.widgets.v1." + companyId;
}

/** Only fixed widget identifiers are stored; no ledger or client information enters browser storage. */
function readPreferences(companyId: string): WidgetId[] {
  try {
    const raw: unknown = JSON.parse(
      window.localStorage.getItem(preferenceKey(companyId)) ?? "null",
    );
    if (!Array.isArray(raw)) return [...DEFAULT_WIDGETS];
    const selected = raw.filter(
      (id): id is WidgetId => typeof id === "string" && DEFAULT_WIDGETS.includes(id as WidgetId),
    );
    return [...new Set(selected)];
  } catch {
    return [...DEFAULT_WIDGETS];
  }
}

function persistPreferences(companyId: string, selection: WidgetId[]) {
  try {
    window.localStorage.setItem(preferenceKey(companyId), JSON.stringify(selection));
  } catch {
    // A blocked or full localStorage must never stop the accounting dashboard rendering.
  }
}

/** Customisable Xero-inspired LinkBooks homepage, using real existing ledger-backed widgets. */
export function PersonalizedDashboardWidgets({
  data,
  companyId,
}: {
  data: DashboardData;
  companyId: string;
}) {
  const [selected, setSelected] = useState<WidgetId[]>([...DEFAULT_WIDGETS]);

  useEffect(() => {
    setSelected(readPreferences(companyId));
  }, [companyId]);

  const visible = (id: WidgetId) => selected.includes(id);
  function toggle(id: WidgetId, enabled: boolean) {
    const next = enabled
      ? DEFAULT_WIDGETS.filter((widget) => selected.includes(widget) || widget === id)
      : selected.filter((widget) => widget !== id);
    setSelected(next);
    persistPreferences(companyId, next);
  }
  function reset() {
    const next = [...DEFAULT_WIDGETS];
    setSelected(next);
    persistPreferences(companyId, next);
  }

  return (
    <section aria-label="Dashboard widgets" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Your financial workspace</h2>
          <p className="text-sm text-muted-foreground">
            Focus on the insights and tasks that matter to you.
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Customize dashboard">
              <SlidersHorizontal className="size-4" aria-hidden />
              Customize
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="end">
            <div>
              <h3 className="font-semibold text-sm">Dashboard preferences</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Select the panels to display for this company on this browser.
              </p>
            </div>
            <div className="space-y-1">
              {WIDGETS.map((widget) => (
                <label
                  key={widget.id}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={visible(widget.id)}
                    onCheckedChange={(checked) => toggle(widget.id, checked === true)}
                    aria-label={widget.label}
                  />
                  <span>{widget.label}</span>
                </label>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={reset} className="w-full">
              <RotateCcw className="size-4" aria-hidden />
              Show all widgets
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      {selected.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Your dashboard is clear</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose Customize to show financial widgets.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
            Show all widgets
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {visible("cash-flow") ? <CashFlowWidget data={data} /> : null}
          {visible("bank-accounts") ? <BankAccountsWidget data={data} /> : null}
          {visible("receivables") ? <AgeingWidget kind="receivables" data={data} /> : null}
          {visible("payables") ? <AgeingWidget kind="payables" data={data} /> : null}
          {visible("profit") ? <ProfitWidget data={data} /> : null}
          {visible("approvals") ? <ApprovalsWidget data={data} /> : null}
          {visible("watchlist") ? <WatchlistWidget data={data} /> : null}
          {visible("tasks") ? <TasksWidget data={data} /> : null}
        </div>
      )}
    </section>
  );
}
