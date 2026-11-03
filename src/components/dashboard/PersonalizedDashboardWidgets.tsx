import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  LayoutGrid,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
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
import {
  ALL_WIDGET_IDS,
  DASHBOARD_PRESETS,
  DASHBOARD_WIDGETS,
  dashboardLayoutStorageKey,
  defaultDashboardLayout,
  moveWidget,
  readDashboardLayout,
  saveDashboardLayout,
  sanitiseWidgetIds,
  setWidgetVisible,
  shiftWidget,
  type DashboardLayoutPrefs,
  type DashboardWidgetId,
} from "@/lib/dashboard/layout-prefs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Only fixed layout identifiers are stored; neither documents nor financial values enter localStorage. */
function readLayout(key: string, companyId: string): DashboardLayoutPrefs {
  try {
    const saved = window.localStorage.getItem(key);
    if (saved !== null) return readDashboardLayout(saved);
    // Preserve the existing company's widget visibility on first v2 use.
    const old = window.localStorage.getItem("linkbooks.dashboard.widgets.v1." + companyId);
    if (old !== null) {
      const selection: unknown = JSON.parse(old);
      return { ...defaultDashboardLayout(), widgets: sanitiseWidgetIds(selection) };
    }
  } catch {
    // Invalid or unavailable browser storage falls back to safe defaults.
  }
  return defaultDashboardLayout();
}

function writeLayout(key: string, prefs: DashboardLayoutPrefs) {
  try {
    window.localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // A restricted browser must not block navigation or accounting calculations.
  }
}

/** Company- and user-isolated dashboard views: drag, keyboard ordering, presets, named layouts. */
export function PersonalizedDashboardWidgets({
  data,
  companyId,
  userId,
}: {
  data: DashboardData;
  companyId: string;
  userId: string;
}) {
  const key = dashboardLayoutStorageKey(userId, companyId);
  const [prefs, setPrefs] = useState<DashboardLayoutPrefs>(defaultDashboardLayout);
  const [loadedKey, setLoadedKey] = useState("");
  const [arranging, setArranging] = useState(false);
  const [dragging, setDragging] = useState<DashboardWidgetId | null>(null);
  const [layoutName, setLayoutName] = useState("");

  useEffect(() => {
    setPrefs(readLayout(key, companyId));
    setLoadedKey(key);
    setArranging(false);
    setDragging(null);
    setLayoutName("");
  }, [key, companyId]);

  const current = loadedKey === key ? prefs : defaultDashboardLayout();

  function apply(next: DashboardLayoutPrefs) {
    setPrefs(next);
    setLoadedKey(key);
    writeLayout(key, next);
  }

  function updateVisibility(id: DashboardWidgetId, enabled: boolean) {
    apply({ ...current, widgets: setWidgetVisible(current.widgets, id, enabled) });
  }

  function reorder(from: DashboardWidgetId, to: DashboardWidgetId) {
    apply({ ...current, widgets: moveWidget(current.widgets, from, to) });
  }

  function shift(id: DashboardWidgetId, direction: -1 | 1) {
    apply({ ...current, widgets: shiftWidget(current.widgets, id, direction) });
  }

  function saveCurrent() {
    if (!layoutName.trim()) return;
    apply(saveDashboardLayout(current, layoutName));
    setLayoutName("");
  }

  function reset() {
    apply({ ...current, widgets: [...ALL_WIDGET_IDS], compact: false });
  }

  function renderWidget(id: DashboardWidgetId) {
    switch (id) {
      case "cash-flow":
        return <CashFlowWidget data={data} />;
      case "bank-accounts":
        return <BankAccountsWidget data={data} />;
      case "receivables":
        return <AgeingWidget kind="receivables" data={data} />;
      case "payables":
        return <AgeingWidget kind="payables" data={data} />;
      case "profit":
        return <ProfitWidget data={data} />;
      case "approvals":
        return <ApprovalsWidget data={data} />;
      case "watchlist":
        return <WatchlistWidget data={data} />;
      case "tasks":
        return <TasksWidget data={data} />;
    }
  }

  return (
    <section aria-label="Dashboard widgets" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Your financial workspace</h2>
          <p className="text-sm text-muted-foreground">
            Arrange the ledger-backed insights that matter most to your work.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={arranging ? "secondary" : "outline"}
            aria-pressed={arranging}
            onClick={() => setArranging((value) => !value)}
          >
            <GripVertical className="size-4" aria-hidden />
            {arranging ? "Done arranging" : "Arrange"}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Customize dashboard">
                <SlidersHorizontal className="size-4" aria-hidden />
                Customize
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="max-h-[min(75vh,650px)] w-[min(340px,calc(100vw-24px))] space-y-4 overflow-y-auto"
              align="end"
            >
              <div>
                <h3 className="text-sm font-semibold">Dashboard preferences</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Layouts are saved on this browser for your user and organisation.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick layouts
                </h4>
                <div className="grid grid-cols-2 gap-1">
                  {DASHBOARD_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      variant="outline"
                      size="sm"
                      className="h-auto min-h-9 justify-start whitespace-normal text-left"
                      onClick={() => apply({ ...current, widgets: [...preset.ids] })}
                      aria-label={"Apply " + preset.name + " dashboard layout"}
                    >
                      <LayoutGrid className="size-3.5 shrink-0" aria-hidden />
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Visible panels
                </h4>
                {DASHBOARD_WIDGETS.map((widget) => (
                  <label
                    key={widget.id}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={current.widgets.includes(widget.id)}
                      onCheckedChange={(checked) => updateVisibility(widget.id, checked === true)}
                      aria-label={widget.label}
                    />
                    <span>{widget.label}</span>
                  </label>
                ))}
              </div>
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <Checkbox
                  checked={current.compact}
                  onCheckedChange={(checked) => apply({ ...current, compact: checked === true })}
                  aria-label="Compact dashboard spacing"
                />
                Compact dashboard spacing
              </label>
              <div className="space-y-2 border-t pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Saved layouts
                </h4>
                <div className="flex items-center gap-2">
                  <Input
                    value={layoutName}
                    onChange={(event) => setLayoutName(event.target.value)}
                    placeholder="Layout name"
                    aria-label="Dashboard layout name"
                    maxLength={48}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveCurrent();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={!layoutName.trim()}
                    onClick={saveCurrent}
                    aria-label="Save dashboard layout"
                  >
                    <Save className="size-4" aria-hidden />
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Up to eight named layouts; saving an existing name updates it.
                </p>
                <ul className="space-y-1">
                  {current.saved.map((saved) => (
                    <li key={saved.name} className="flex items-center gap-1 rounded-md border p-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-w-0 flex-1 justify-start truncate"
                        aria-label={"Load dashboard layout " + saved.name}
                        onClick={() =>
                          apply({ ...current, widgets: [...saved.widgets], compact: saved.compact })
                        }
                      >
                        {saved.name}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground"
                        aria-label={"Delete dashboard layout " + saved.name}
                        onClick={() =>
                          apply({
                            ...current,
                            saved: current.saved.filter((item) => item.name !== saved.name),
                          })
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
              <Button size="sm" variant="outline" onClick={reset} className="w-full">
                <RotateCcw className="size-4" aria-hidden />
                Restore default panels
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {arranging ? (
        <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
          Drag a panel handle to reorder, or use Move up/Move down for accessible keyboard ordering.
          The order is saved automatically.
        </p>
      ) : null}

      {current.widgets.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Your dashboard is clear</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open Customize to choose panels or restore the default workspace.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
            Show all widgets
          </Button>
        </div>
      ) : (
        <div className={cn("grid lg:grid-cols-3", current.compact ? "gap-3" : "gap-6")}>
          {current.widgets.map((id, index) => {
            const widget = DASHBOARD_WIDGETS.find((item) => item.id === id);
            if (!widget) return null;
            return (
              <div
                key={id}
                className={cn(
                  "min-w-0",
                  id === "cash-flow" && "lg:col-span-2",
                  dragging === id && "opacity-60",
                )}
                onDragOver={(event) => {
                  if (arranging && dragging) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!arranging) return;
                  const source = event.dataTransfer.getData("text/plain") as DashboardWidgetId;
                  if (current.widgets.includes(source)) reorder(source, id);
                  setDragging(null);
                }}
              >
                {arranging ? (
                  <div className="mb-2 flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1">
                    <button
                      type="button"
                      draggable
                      aria-label={"Drag to reorder " + widget.label}
                      title="Drag this handle to move the panel"
                      className="cursor-grab rounded p-1.5 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", id);
                        setDragging(id);
                      }}
                      onDragEnd={() => setDragging(null)}
                    >
                      <GripVertical className="size-4" aria-hidden />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {widget.label}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={index === 0}
                      aria-label={"Move " + widget.label + " up"}
                      onClick={() => shift(id, -1)}
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={index === current.widgets.length - 1}
                      aria-label={"Move " + widget.label + " down"}
                      onClick={() => shift(id, 1)}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </Button>
                  </div>
                ) : null}
                {renderWidget(id)}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
