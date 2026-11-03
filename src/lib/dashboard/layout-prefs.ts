/** Browser-local dashboard layout preferences. Stores only fixed UI IDs; never financial data. */
export const DASHBOARD_WIDGETS = [
  { id: "cash-flow", label: "Cash flow" },
  { id: "bank-accounts", label: "Bank accounts" },
  { id: "receivables", label: "Receivables ageing" },
  { id: "payables", label: "Payables ageing" },
  { id: "profit", label: "Profit performance" },
  { id: "approvals", label: "Approvals" },
  { id: "watchlist", label: "Watchlist" },
  { id: "tasks", label: "Tasks" },
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]["id"];
export const ALL_WIDGET_IDS = DASHBOARD_WIDGETS.map((item) => item.id);
export type DashboardPreset = "overview" | "collections" | "payables" | "banking";
export const DASHBOARD_PRESETS: ReadonlyArray<{
  id: DashboardPreset;
  name: string;
  ids: readonly DashboardWidgetId[];
}> = [
  { id: "overview", name: "Overview", ids: ALL_WIDGET_IDS },
  {
    id: "collections",
    name: "Collections",
    ids: ["receivables", "cash-flow", "profit", "tasks", "bank-accounts"],
  },
  {
    id: "payables",
    name: "Bills & approvals",
    ids: ["payables", "approvals", "tasks", "cash-flow", "bank-accounts"],
  },
  { id: "banking", name: "Banking", ids: ["bank-accounts", "cash-flow", "tasks", "watchlist"] },
];

export type NamedDashboardLayout = { name: string; widgets: DashboardWidgetId[]; compact: boolean };
export type DashboardLayoutPrefs = {
  widgets: DashboardWidgetId[];
  compact: boolean;
  saved: NamedDashboardLayout[];
};

const MAX_SAVED_LAYOUTS = 8;
const MAX_STORAGE_BYTES = 10_000;
const MAX_NAME = 48;

export function defaultDashboardLayout(): DashboardLayoutPrefs {
  return { widgets: [...ALL_WIDGET_IDS], compact: false, saved: [] };
}

export function sanitiseWidgetIds(input: unknown): DashboardWidgetId[] {
  if (!Array.isArray(input)) return [...ALL_WIDGET_IDS];
  const allowed = new Set<DashboardWidgetId>(ALL_WIDGET_IDS);
  const result: DashboardWidgetId[] = [];
  for (const value of input.slice(0, 40)) {
    if (typeof value !== "string" || !allowed.has(value as DashboardWidgetId)) continue;
    const id = value as DashboardWidgetId;
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

export function normaliseLayoutName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

export function readDashboardLayout(raw: string | null): DashboardLayoutPrefs {
  if (!raw || raw.length > MAX_STORAGE_BYTES) return defaultDashboardLayout();
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return defaultDashboardLayout();
    const record = value as Record<string, unknown>;
    const seen = new Set<string>();
    const saved: NamedDashboardLayout[] = [];
    if (Array.isArray(record["saved"])) {
      for (const value of record["saved"].slice(0, 30)) {
        if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
        const row = value as Record<string, unknown>;
        if (typeof row["name"] !== "string") continue;
        const name = normaliseLayoutName(row["name"]);
        if (!name || seen.has(name.toLocaleLowerCase())) continue;
        seen.add(name.toLocaleLowerCase());
        saved.push({
          name,
          widgets: sanitiseWidgetIds(row["widgets"]),
          compact: row["compact"] === true,
        });
        if (saved.length === MAX_SAVED_LAYOUTS) break;
      }
    }
    return {
      widgets: sanitiseWidgetIds(record["widgets"]),
      compact: record["compact"] === true,
      saved,
    };
  } catch {
    return defaultDashboardLayout();
  }
}

export function moveWidget(
  widgets: readonly DashboardWidgetId[],
  source: DashboardWidgetId,
  target: DashboardWidgetId,
): DashboardWidgetId[] {
  const list = [...widgets];
  const from = list.indexOf(source);
  const to = list.indexOf(target);
  if (from < 0 || to < 0 || from === to) return list;
  list.splice(from, 1);
  list.splice(to, 0, source);
  return list;
}

export function shiftWidget(
  widgets: readonly DashboardWidgetId[],
  source: DashboardWidgetId,
  direction: -1 | 1,
): DashboardWidgetId[] {
  const index = widgets.indexOf(source);
  const target = widgets[index + direction];
  return target ? moveWidget(widgets, source, target) : [...widgets];
}

export function setWidgetVisible(
  widgets: readonly DashboardWidgetId[],
  id: DashboardWidgetId,
  visible: boolean,
): DashboardWidgetId[] {
  if (!ALL_WIDGET_IDS.includes(id)) return [...widgets];
  if (!visible) return widgets.filter((widget) => widget !== id);
  return widgets.includes(id) ? [...widgets] : [...widgets, id];
}

/** Reusing a name replaces that saved layout; old independent names are preserved. */
export function saveDashboardLayout(
  prefs: DashboardLayoutPrefs,
  nameInput: string,
): DashboardLayoutPrefs {
  const name = normaliseLayoutName(nameInput);
  if (!name) return prefs;
  const other = prefs.saved.filter(
    (item) => item.name.toLocaleLowerCase() !== name.toLocaleLowerCase(),
  );
  return {
    ...prefs,
    saved: [...other, { name, widgets: [...prefs.widgets], compact: prefs.compact }].slice(
      -MAX_SAVED_LAYOUTS,
    ),
  };
}

export function dashboardLayoutStorageKey(userId: string, companyId: string): string {
  return "linkbooks.dashboard.layout.v2." + userId + "." + companyId;
}
