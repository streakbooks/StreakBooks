export type Cell = string | number | boolean | null;

/** Flat serialisable row. Server functions cannot return `unknown`. */
export type JsonRow = { [key: string]: Cell };

export type RealEstateSettings = {
  enabled: boolean;
  areaUnit: string;
  recognitionPolicy: string;
  enforceSegregation: boolean;
  reservationHoldDays: number;
  graceDays: number;
  lateFeeBps: number;
  countryCode: string;
  accountMap: { [role: string]: string };
};

export type RealEstateMetrics = {
  projectCount: number;
  unitCount: number;
  availableCount: number;
  reservedCount: number;
  bookedCount: number;
  soldCount: number;
  inventoryListMinor: number;
  contractedMinor: number;
  recognisedMinor: number;
  collectedMinor: number;
  outstandingInstalmentMinor: number;
  overdueCount: number;
  costRecordedMinor: number;
  costPostedMinor: number;
  budgetApprovedMinor: number;
  commissionOpenMinor: number;
  commissionPostedMinor: number;
};

export type RealEstateWorkspace = {
  settings: RealEstateSettings;
  metrics: RealEstateMetrics;
  byStatus: { [status: string]: number };
  projects: JsonRow[];
  phases: JsonRow[];
  structures: JsonRow[];
  levels: JsonRow[];
  units: JsonRow[];
  holds: JsonRow[];
  sales: JsonRow[];
  instalments: JsonRow[];
  brokers: JsonRow[];
  rules: JsonRow[];
  accruals: JsonRow[];
  costs: JsonRow[];
  budgets: JsonRow[];
  alerts: JsonRow[];
};

export type RealEstateResult = {
  id: string | null;
  journalId: string | null;
  status: string | null;
  replayed: boolean;
  reason: string | null;
};

function pick(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as { [key: string]: unknown })[key];
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

function asCell(value: unknown): Cell {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  return null;
}

function rows(value: unknown): JsonRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const out: JsonRow = {};
    if (row === null || typeof row !== "object" || Array.isArray(row)) return out;
    for (const [key, entry] of Object.entries(row)) out[key] = asCell(entry);
    return out;
  });
}

export function mapRealEstateWorkspace(value: unknown): RealEstateWorkspace {
  const settings = pick(value, "settings");
  const metrics = pick(value, "metrics");
  const map = pick(settings, "account_map");
  const accountMap: { [role: string]: string } = {};
  if (map !== null && typeof map === "object" && !Array.isArray(map)) {
    for (const [key, entry] of Object.entries(map)) {
      if (typeof entry === "string" && entry) accountMap[key] = entry;
    }
  }
  const byStatus: { [status: string]: number } = {};
  const rawStatus = pick(value, "by_status");
  if (rawStatus !== null && typeof rawStatus === "object" && !Array.isArray(rawStatus)) {
    for (const [key, entry] of Object.entries(rawStatus)) byStatus[key] = num(entry);
  }
  return {
    settings: {
      enabled: pick(settings, "enabled") === true,
      areaUnit: text(pick(settings, "area_unit"), "sqm"),
      recognitionPolicy: text(pick(settings, "recognition_policy"), "unset"),
      enforceSegregation: pick(settings, "enforce_segregation") === true,
      reservationHoldDays: num(pick(settings, "reservation_hold_days")) || 7,
      graceDays: num(pick(settings, "grace_days")),
      lateFeeBps: num(pick(settings, "late_fee_bps")),
      countryCode: text(pick(settings, "country_code"), "US"),
      accountMap,
    },
    metrics: {
      projectCount: num(pick(metrics, "project_count")),
      unitCount: num(pick(metrics, "unit_count")),
      availableCount: num(pick(metrics, "available_count")),
      reservedCount: num(pick(metrics, "reserved_count")),
      bookedCount: num(pick(metrics, "booked_count")),
      soldCount: num(pick(metrics, "sold_count")),
      inventoryListMinor: num(pick(metrics, "inventory_list_minor")),
      contractedMinor: num(pick(metrics, "contracted_minor")),
      recognisedMinor: num(pick(metrics, "recognised_minor")),
      collectedMinor: num(pick(metrics, "collected_minor")),
      outstandingInstalmentMinor: num(pick(metrics, "outstanding_instalment_minor")),
      overdueCount: num(pick(metrics, "overdue_count")),
      costRecordedMinor: num(pick(metrics, "cost_recorded_minor")),
      costPostedMinor: num(pick(metrics, "cost_posted_minor")),
      budgetApprovedMinor: num(pick(metrics, "budget_approved_minor")),
      commissionOpenMinor: num(pick(metrics, "commission_open_minor")),
      commissionPostedMinor: num(pick(metrics, "commission_posted_minor")),
    },
    byStatus,
    projects: rows(pick(value, "projects")),
    phases: rows(pick(value, "phases")),
    structures: rows(pick(value, "structures")),
    levels: rows(pick(value, "levels")),
    units: rows(pick(value, "units")),
    holds: rows(pick(value, "holds")),
    sales: rows(pick(value, "sales")),
    instalments: rows(pick(value, "instalments")),
    brokers: rows(pick(value, "brokers")),
    rules: rows(pick(value, "rules")),
    accruals: rows(pick(value, "accruals")),
    costs: rows(pick(value, "costs")),
    budgets: rows(pick(value, "budgets")),
    alerts: rows(pick(value, "alerts")),
  };
}

export function mapRealEstateResult(value: unknown): RealEstateResult {
  const id = pick(value, "id");
  const journalId = pick(value, "journal_id");
  const status = pick(value, "status");
  const reason = pick(value, "reason");
  return {
    id: id == null ? null : String(id),
    journalId: journalId == null ? null : String(journalId),
    status: status == null ? null : String(status),
    replayed: pick(value, "replayed") === true,
    reason: reason == null ? null : String(reason),
  };
}

export function cell(row: JsonRow, key: string): string {
  const value = row[key];
  return value == null ? "" : String(value);
}

export function minor(row: JsonRow, key: string): number {
  return num(row[key]);
}
