export type GymCell = string | number | boolean | null;

export type GymRecord = { [key: string]: GymCell };

export type GymKpis = {
  members_total: number;
  memberships_active: number;
  memberships_frozen: number;
  memberships_cancelled: number;
  memberships_expired: number;
  memberships_trial: number;
  mrr_minor: number;
  arr_minor: number;
  residual_minor: number;
  deferred_minor: number;
  recognised_minor: number;
  invoiced_minor: number;
  collected_minor: number;
  outstanding_minor: number;
  unallocated_minor: number;
  checkins_today: number;
  upcoming_appointments: number;
  maintenance_due: number;
  reconciliation_balanced: boolean;
  ledger_receivable_minor: number | null;
  subledger_receivable_minor: number;
};

export type GymSettings = {
  enabled: boolean;
  currency_code: string;
  country_code: string;
  timezone: string;
  account_map: { [role: string]: string };
  version: number;
};

export type GymWorkspace = {
  settings: GymSettings;
  kpis: GymKpis;
  members: GymRecord[];
  plans: GymRecord[];
  memberships: GymRecord[];
  charges: GymRecord[];
  receipts: GymRecord[];
  recognition: GymRecord[];
  appointments: GymRecord[];
  sessions: GymRecord[];
  trainers: GymRecord[];
  packages: GymRecord[];
  commissions: GymRecord[];
  vouchers: GymRecord[];
  equipment: GymRecord[];
  leads: GymRecord[];
  branches: GymRecord[];
  budgets: GymRecord[];
  actions: GymRecord[];
};

export type GymResult = {
  id: string | null;
  journal_id: string | null;
  status: string | null;
  replayed: boolean;
  reason: string | null;
};

export type GymStatement = {
  opening_minor: number;
  charges_minor: number;
  receipts_minor: number;
  closing_minor: number;
  charges: GymRecord[];
  receipts: GymRecord[];
};

export type GymPortal = {
  linked: boolean;
  member_number: string | null;
  display_name: string | null;
  status: string | null;
  outstanding_minor: number;
  sessions_remaining: number;
  memberships: GymRecord[];
};

function objectOf(value: unknown): { [key: string]: unknown } | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as { [key: string]: unknown };
}

function pick(source: { [key: string]: unknown } | null, key: string): unknown {
  return source ? source[key] : undefined;
}

function cell(value: unknown): GymCell {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : null;
}

function record(value: unknown): GymRecord {
  const source = objectOf(value);
  const row: GymRecord = {};
  if (!source) return row;
  for (const [key, item] of Object.entries(source)) row[key] = cell(item);
  return row;
}

function list(value: unknown): GymRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function mapGymResult(value: unknown): GymResult {
  const source = objectOf(value);
  const id = pick(source, "id");
  const journalId = pick(source, "journal_id");
  const status = pick(source, "status");
  const reason = pick(source, "reason");
  return {
    id: typeof id === "string" ? id : null,
    journal_id: typeof journalId === "string" ? journalId : null,
    status: typeof status === "string" ? status : null,
    replayed: pick(source, "replayed") === true,
    reason: typeof reason === "string" ? reason : null,
  };
}

export function mapGymWorkspace(value: unknown): GymWorkspace {
  const source = objectOf(value);
  const settings = objectOf(pick(source, "settings"));
  const accountMap = objectOf(pick(settings, "account_map"));
  const account_map: { [role: string]: string } = {};
  if (accountMap) {
    for (const [role, accountId] of Object.entries(accountMap)) {
      if (typeof accountId === "string") account_map[role] = accountId;
    }
  }
  const kpis = objectOf(pick(source, "kpis"));
  const currency = pick(settings, "currency_code");
  const country = pick(settings, "country_code");
  const timezone = pick(settings, "timezone");
  const ledger = pick(kpis, "ledger_receivable_minor");
  return {
    settings: {
      enabled: pick(settings, "enabled") === true,
      currency_code: typeof currency === "string" ? currency : "USD",
      country_code: typeof country === "string" ? country : "US",
      timezone: typeof timezone === "string" ? timezone : "UTC",
      account_map,
      version: num(pick(settings, "version")),
    },
    kpis: {
      members_total: num(pick(kpis, "members_total")),
      memberships_active: num(pick(kpis, "memberships_active")),
      memberships_frozen: num(pick(kpis, "memberships_frozen")),
      memberships_cancelled: num(pick(kpis, "memberships_cancelled")),
      memberships_expired: num(pick(kpis, "memberships_expired")),
      memberships_trial: num(pick(kpis, "memberships_trial")),
      mrr_minor: num(pick(kpis, "mrr_minor")),
      arr_minor: num(pick(kpis, "arr_minor")),
      residual_minor: num(pick(kpis, "residual_minor")),
      deferred_minor: num(pick(kpis, "deferred_minor")),
      recognised_minor: num(pick(kpis, "recognised_minor")),
      invoiced_minor: num(pick(kpis, "invoiced_minor")),
      collected_minor: num(pick(kpis, "collected_minor")),
      outstanding_minor: num(pick(kpis, "outstanding_minor")),
      unallocated_minor: num(pick(kpis, "unallocated_minor")),
      checkins_today: num(pick(kpis, "checkins_today")),
      upcoming_appointments: num(pick(kpis, "upcoming_appointments")),
      maintenance_due: num(pick(kpis, "maintenance_due")),
      reconciliation_balanced: pick(kpis, "reconciliation_balanced") === true,
      ledger_receivable_minor: typeof ledger === "number" ? ledger : null,
      subledger_receivable_minor: num(pick(kpis, "subledger_receivable_minor")),
    },
    members: list(pick(source, "members")),
    plans: list(pick(source, "plans")),
    memberships: list(pick(source, "memberships")),
    charges: list(pick(source, "charges")),
    receipts: list(pick(source, "receipts")),
    recognition: list(pick(source, "recognition")),
    appointments: list(pick(source, "appointments")),
    sessions: list(pick(source, "sessions")),
    trainers: list(pick(source, "trainers")),
    packages: list(pick(source, "packages")),
    commissions: list(pick(source, "commissions")),
    vouchers: list(pick(source, "vouchers")),
    equipment: list(pick(source, "equipment")),
    leads: list(pick(source, "leads")),
    branches: list(pick(source, "branches")),
    budgets: list(pick(source, "budgets")),
    actions: list(pick(source, "actions")),
  };
}

export function mapGymStatement(value: unknown): GymStatement {
  const source = objectOf(value);
  return {
    opening_minor: num(pick(source, "opening_minor")),
    charges_minor: num(pick(source, "charges_minor")),
    receipts_minor: num(pick(source, "receipts_minor")),
    closing_minor: num(pick(source, "closing_minor")),
    charges: list(pick(source, "charges")),
    receipts: list(pick(source, "receipts")),
  };
}

export function mapGymPortal(value: unknown): GymPortal {
  const source = objectOf(value);
  const memberNumber = pick(source, "member_number");
  const displayName = pick(source, "display_name");
  const status = pick(source, "status");
  return {
    linked: pick(source, "linked") === true,
    member_number: typeof memberNumber === "string" ? memberNumber : null,
    display_name: typeof displayName === "string" ? displayName : null,
    status: typeof status === "string" ? status : null,
    outstanding_minor: num(pick(source, "outstanding_minor")),
    sessions_remaining: num(pick(source, "sessions_remaining")),
    memberships: list(pick(source, "memberships")),
  };
}
