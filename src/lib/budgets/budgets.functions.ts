import { resolveReportingBasis } from "@/lib/reports/accounting-basis.server";
import { parseAccountingBasis, type AccountingBasis } from "@/lib/reports/accounting-basis";
import { loadCashReportLines } from "@/lib/reports/cash-report.server";
import { createServerFn } from "@tanstack/react-start";
import { prepareBudgetImportCsv } from "@/lib/imports/budget-import";
import { buildBudgetScenarioComparison } from "@/lib/budgets/budget-scenarios";
import { validateBudgetLockCommand } from "@/lib/budgets/budget-governance";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import { addDaysIso, addMonthsIso, monthStart, todayIso } from "@/lib/accounting/fiscal-year";
import { loadAccountMetas, loadCompanyMeta, type Sb } from "@/lib/accounting/ledger-data";
import {
  buildBudgetColumns,
  fiscalMonthStarts,
  naturalActual,
  type BudgetAccountKind,
  type ReportView,
} from "@/lib/budgets/budget-math";
import {
  buildBudgetVsActual,
  type MonthActivity,
  type MonthAmount,
} from "@/lib/budgets/budget-report";
import {
  BUDGET_MIGRATION,
  callRpc,
  companyIdOf,
  isMissingRelation,
  isoDate,
  num,
  wholeMinor,
} from "@/lib/planning/rpc";

type Row = Record<string, unknown>;

export type BudgetSummary = {
  id: string;
  name: string;
  fiscal_year_start: string;
  notes: string | null;
  updated_at: string;
};

export type BudgetAccount = { id: string; code: string; name: string; kind: BudgetAccountKind };

async function budgetAccounts(sb: Sb, companyId: string): Promise<BudgetAccount[]> {
  const metas = await loadAccountMetas(sb, companyId);
  return metas
    .filter(
      (a) =>
        (a.account_type === "income" || a.account_type === "expense") &&
        a.is_active &&
        a.is_postable,
    )
    .map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      kind: a.account_type as BudgetAccountKind,
    }))
    .sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
}

async function loadBudgetHead(sb: Sb, companyId: string, budgetId: string): Promise<BudgetSummary> {
  const { data, error } = await sb
    .from("budgets" as never)
    .select("id, name, fiscal_year_start, notes, updated_at" as never)
    .eq("id" as never, budgetId as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (error) throw new Error(isMissingRelation(error) ? BUDGET_MIGRATION : error.message);
  if (!data) throw new Error("Budget not found.");
  return data as unknown as BudgetSummary;
}

async function loadBudgetLines(sb: Sb, budgetId: string): Promise<MonthAmount[]> {
  const rows = await fetchAllPages<{
    account_id: string;
    period_month: string;
    amount_minor: number;
  }>(
    (from, to) =>
      sb
        .from("budget_lines" as never)
        .select("account_id, period_month, amount_minor" as never)
        .eq("budget_id" as never, budgetId as never)
        .order("account_id" as never)
        .order("period_month" as never)
        .range(from, to) as unknown as PromiseLike<
        PageResult<{ account_id: string; period_month: string; amount_minor: number }>
      >,
  );
  return rows.map((r) => ({
    accountId: r.account_id,
    month: r.period_month,
    amountMinor: num(r.amount_minor),
  }));
}

/** Monthly debit/credit per account over a range, from the SQL aggregate (no row cap). */
async function monthlyActivity(
  sb: Sb,
  companyId: string,
  from: string,
  to: string,
  basis: AccountingBasis = "accrual",
): Promise<MonthActivity[]> {
  if (basis === "cash") {
    const lines = await loadCashReportLines(sb, companyId, from, to);
    const months = new Map<
      string,
      { accountId: string; month: string; debit: bigint; credit: bigint }
    >();
    for (const line of lines) {
      if (line.account_type !== "income" && line.account_type !== "expense") continue;
      const month = monthStart(line.journal_date);
      const key = `${line.account_id}:${month}`;
      const row = months.get(key) ?? { accountId: line.account_id, month, debit: 0n, credit: 0n };
      row.debit += BigInt(line.debit_minor);
      row.credit += BigInt(line.credit_minor);
      months.set(key, row);
    }
    return [...months.values()].map((row) => {
      const debitMinor = Number(row.debit),
        creditMinor = Number(row.credit);
      if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor))
        throw new Error("Budget actuals exceed the supported amount range");
      return { accountId: row.accountId, month: row.month, debitMinor, creditMinor };
    });
  }
  const rows = await callRpc<
    Array<{ account_id: string; month: string; debit_minor: number; credit_minor: number }>
  >(
    sb,
    "ledger_monthly_activity",
    { _company_id: companyId, _from: from, _to: to, _exclude_year_end_close: true },
    "Actuals are not available yet: the database update 20261025400000 has not been applied.",
  );
  return (rows ?? []).map((r) => ({
    accountId: r.account_id,
    month: r.month,
    debitMinor: num(r.debit_minor),
    creditMinor: num(r.credit_minor),
  }));
}

export const listBudgets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase
      .from("budgets" as never)
      .select("id, name, fiscal_year_start, notes, updated_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("fiscal_year_start" as never, { ascending: false } as never)
      .order("name" as never)
      .limit(500);
    if (error) {
      if (isMissingRelation(error)) return { available: false, budgets: [] as BudgetSummary[] };
      throw new Error(error.message);
    }
    return { available: true, budgets: (rows ?? []) as unknown as BudgetSummary[] };
  });

/** A budget with its lines and the accounts it can use, for the editor grid. */
export const getBudget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; budgetId: string }) => ({
    companyId: companyIdOf(input),
    budgetId: assertUuid(input?.budgetId, "budget"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const [meta, head, lines, accounts] = await Promise.all([
      loadCompanyMeta(sb, data.companyId),
      loadBudgetHead(sb, data.companyId, data.budgetId),
      loadBudgetLines(sb, data.budgetId),
      budgetAccounts(sb, data.companyId),
    ]);
    return {
      budget: head,
      currency: meta.baseCurrency,
      months: fiscalMonthStarts(head.fiscal_year_start),
      accounts,
      lines,
    };
  });

/**
 * Read-only scenario comparison; independent company-scoped headers are checked before
 * loading lines, and full P&L metadata includes inactive historical accounts.
 */
export const compareBudgetScenarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; baselineId: string; scenarioId: string }) => {
    const baselineId = assertUuid(input?.baselineId, "baseline budget");
    const scenarioId = assertUuid(input?.scenarioId, "comparison budget");
    if (baselineId === scenarioId) throw new Error("Choose two different budgets.");
    return { companyId: companyIdOf(input), baselineId, scenarioId };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const [baselineBudget, scenarioBudget] = await Promise.all([
      loadBudgetHead(sb, data.companyId, data.baselineId),
      loadBudgetHead(sb, data.companyId, data.scenarioId),
    ]);
    const [baselineLines, scenarioLines, metas, company] = await Promise.all([
      loadBudgetLines(sb, data.baselineId),
      loadBudgetLines(sb, data.scenarioId),
      loadAccountMetas(sb, data.companyId),
      loadCompanyMeta(sb, data.companyId),
    ]);
    const accounts = metas
      .filter((account) => account.account_type === "income" || account.account_type === "expense")
      .map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        kind: account.account_type as BudgetAccountKind,
      }));
    return {
      baselineBudget,
      scenarioBudget,
      baselineMonths: fiscalMonthStarts(baselineBudget.fiscal_year_start),
      scenarioMonths: fiscalMonthStarts(scenarioBudget.fiscal_year_start),
      currency: company.baseCurrency,
      comparison: buildBudgetScenarioComparison({
        accounts,
        baselineStart: baselineBudget.fiscal_year_start,
        scenarioStart: scenarioBudget.fiscal_year_start,
        baselineLines,
        scenarioLines,
      }),
    };
  });

export type BudgetRevisionSummary = {
  id: string;
  version: number;
  recorded_at: string;
  recorded_by: string | null;
  action: "baseline" | "created" | "updated" | "locked" | "unlocked";
  line_count: number;
};

export type BudgetGovernanceResult = {
  available: boolean;
  locked: boolean;
  reason: string | null;
  changedAt: string | null;
  changedBy: string | null;
  revisions: BudgetRevisionSummary[];
};

/** Governance status is optional until its migration is deployed; existing editor stays functional. */
export const getBudgetGovernance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; budgetId: string }) => ({
    companyId: companyIdOf(input),
    budgetId: assertUuid(input?.budgetId, "budget"),
  }))
  .handler(async ({ data, context }): Promise<BudgetGovernanceResult> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    await loadBudgetHead(sb, data.companyId, data.budgetId);
    const { data: lock, error: lockError } = await context.supabase
      .from("budget_governance" as never)
      .select("is_locked, reason, changed_by, changed_at" as never)
      .eq("budget_id" as never, data.budgetId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (lockError) {
      if (isMissingRelation(lockError))
        return {
          available: false, locked: false, reason: null,
          changedAt: null, changedBy: null, revisions: [],
        };
      throw new Error(lockError.message);
    }
    const { data: revisions, error: historyError } = await context.supabase
      .from("budget_revisions" as never)
      .select("id, version, recorded_at, recorded_by, action, line_count" as never)
      .eq("budget_id" as never, data.budgetId as never)
      .eq("company_id" as never, data.companyId as never)
      .order("version" as never, { ascending: false } as never)
      .limit(50);
    if (historyError) {
      if (isMissingRelation(historyError))
        return {
          available: false, locked: false, reason: null,
          changedAt: null, changedBy: null, revisions: [],
        };
      throw new Error(historyError.message);
    }
    const status = lock as unknown as
      | { is_locked: boolean; reason: string; changed_by: string | null; changed_at: string }
      | null;
    return {
      available: true,
      locked: status?.is_locked ?? false,
      reason: status?.reason ?? null,
      changedAt: status?.changed_at ?? null,
      changedBy: status?.changed_by ?? null,
      revisions: (revisions ?? []) as unknown as BudgetRevisionSummary[],
    };
  });

/** Read a single historical snapshot; never permit reconstruction of another tenant's budgets. */
export const getBudgetRevision = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; budgetId: string; revisionId: string }) => ({
      companyId: companyIdOf(input),
      budgetId: assertUuid(input?.budgetId, "budget"),
      revisionId: assertUuid(input?.revisionId, "revision"),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await loadBudgetHead(context.supabase as unknown as Sb, data.companyId, data.budgetId);
    const { data: revision, error } = await context.supabase
      .from("budget_revisions" as never)
      .select("id, version, recorded_at, action, snapshot" as never)
      .eq("id" as never, data.revisionId as never)
      .eq("budget_id" as never, data.budgetId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!revision) throw new Error("Budget revision not found.");
    return revision as unknown as {
      id: string;
      version: number;
      recorded_at: string;
      action: BudgetRevisionSummary["action"];
      snapshot: {
        name: string;
        fiscal_year_start: string;
        notes: string | null;
        locked: boolean;
        lock_reason: string | null;
        lines: Array<{
          account_id: string;
          account_code: string | null;
          account_name: string | null;
          period_month: string;
          amount_minor: number;
        }>;
      };
    };
  });

/** Lock or unlock a plan; the database enforces it across all present and future write paths. */
export const setBudgetLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; budgetId: string; locked: boolean; reason: string }) => {
      const command = validateBudgetLockCommand(input);
      return {
        companyId: companyIdOf(input),
        budgetId: assertUuid(input.budgetId, "budget"),
        ...command,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    const locked = await callRpc<boolean>(
      context.supabase,
      "set_budget_lock",
      {
        _company_id: data.companyId,
        _budget_id: data.budgetId,
        _locked: data.locked,
        _reason: data.reason,
      },
      "Budget governance requires migration 20261106173000_budget_governance_revisions.sql.",
    );
    return { locked };
  });

export const saveBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      budgetId?: string | null;
      name: string;
      fiscalYearStart: string;
      notes?: string | null;
    }) => ({
      companyId: companyIdOf(input),
      budgetId: input.budgetId ? assertUuid(input.budgetId, "budget") : null,
      name: (input.name ?? "").trim(),
      fiscalYearStart: isoDate(input.fiscalYearStart, "Fiscal year start"),
      notes: (input.notes ?? "").trim() || null,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    if (!data.name) throw new Error("Enter a budget name.");
    const id = await callRpc<string>(
      context.supabase,
      "save_budget",
      {
        _company_id: data.companyId,
        _budget_id: data.budgetId,
        _name: data.name,
        _fiscal_year_start: data.fiscalYearStart,
        _notes: data.notes,
      },
      BUDGET_MIGRATION,
    );
    return { id };
  });

/**
 * Duplicate a budget and (optionally) all twelve-month amounts in one database transaction.
 * The RPC verifies tenant membership and permissions again; a failed copy leaves no new budget.
 */
export const duplicateBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      sourceBudgetId: string;
      name: string;
      fiscalYearStart: string;
      includeAmounts: boolean;
    }) => {
      const name = (input.name ?? "").trim();
      if (!name || name.length > 120) {
        throw new Error("Budget name must be between 1 and 120 characters.");
      }
      const fiscalYearStart = isoDate(input.fiscalYearStart, "Financial year start");
      if (monthStart(fiscalYearStart) !== fiscalYearStart) {
        throw new Error("The financial year must start on the first day of a month.");
      }
      return {
        companyId: companyIdOf(input),
        sourceBudgetId: assertUuid(input.sourceBudgetId, "source budget"),
        name,
        fiscalYearStart,
        includeAmounts: input.includeAmounts === true,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    const id = await callRpc<string>(
      context.supabase,
      "duplicate_budget",
      {
        _company_id: data.companyId,
        _source_budget_id: data.sourceBudgetId,
        _name: data.name,
        _fiscal_year_start: data.fiscalYearStart,
        _include_amounts: data.includeAmounts,
      },
      "Budget duplication requires the database migration 20261106115500_duplicate_budget.sql.",
    );
    return { id };
  });

export const saveBudgetLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      budgetId: string;
      mode: "replace" | "merge";
      /** One entry per account: the 12 monthly amounts in fiscal order (minor units). */
      rows: Array<{ accountId: string; months: number[] }>;
    }) => {
      if (!Array.isArray(input?.rows)) throw new Error("No budget rows to save.");
      return {
        companyId: companyIdOf(input),
        budgetId: assertUuid(input.budgetId, "budget"),
        mode: input.mode === "merge" ? ("merge" as const) : ("replace" as const),
        rows: input.rows.map((r) => {
          if (!Array.isArray(r?.months) || r.months.length !== 12) {
            throw new Error("Each budget row needs twelve monthly amounts.");
          }
          return {
            accountId: assertUuid(r.accountId, "account"),
            months: r.months.map((m) => wholeMinor(m, "Budget amount")),
          };
        }),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    const sb = context.supabase as unknown as Sb;
    const head = await loadBudgetHead(sb, data.companyId, data.budgetId);
    const months = fiscalMonthStarts(head.fiscal_year_start);
    const lines: Array<{ account_id: string; period_month: string; amount_minor: number }> = [];
    for (const r of data.rows) {
      r.months.forEach((amount, i) => {
        if (data.mode === "replace" && amount === 0) return;
        lines.push({ account_id: r.accountId, period_month: months[i]!, amount_minor: amount });
      });
    }
    const stored = await callRpc<number>(
      context.supabase,
      "save_budget_lines",
      { _budget_id: data.budgetId, _lines: lines, _mode: data.mode },
      BUDGET_MIGRATION,
    );
    return { stored: num(stored) };
  });

/**
 * Import an entire CSV into an existing budget using the SAME atomic save_budget_lines
 * database RPC as the budget editor. This updates budget plans, NEVER the general ledger.
 * Resolve and validate all account codes before the sole write; no partial per-row inserts.
 */
export const importBudgetLinesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      budgetId: string;
      csvText: string;
      mode: "merge" | "replace";
    }) => {
      if (typeof input?.csvText !== "string" || input.csvText.length > 5 * 1024 * 1024) {
        throw new Error("Invalid budget CSV or file exceeds 5 MB");
      }
      if (input.mode !== "merge" && input.mode !== "replace")
        throw new Error("Choose merge or replace mode");
      return {
        companyId: companyIdOf(input),
        budgetId: assertUuid(input.budgetId, "budget"),
        csvText: input.csvText,
        mode: input.mode,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    const sb = context.supabase as unknown as Sb;
    const [budget, company, accounts] = await Promise.all([
      loadBudgetHead(sb, data.companyId, data.budgetId),
      loadCompanyMeta(sb, data.companyId),
      budgetAccounts(sb, data.companyId),
    ]);
    const parsed = prepareBudgetImportCsv(data.csvText, company.baseCurrency);
    const accountByCode = new Map<string, BudgetAccount>();
    for (const account of accounts) {
      const key = account.code.toLocaleLowerCase("en-US");
      if (accountByCode.has(key)) {
        throw new Error(
          `Account code ${account.code} is ambiguous; resolve duplicate account codes before import`,
        );
      }
      accountByCode.set(key, account);
    }
    const lines: Array<{ account_id: string; period_month: string; amount_minor: number }> = [];
    const months = fiscalMonthStarts(budget.fiscal_year_start);
    for (const row of parsed) {
      const account = accountByCode.get(row.accountCode.toLocaleLowerCase("en-US"));
      if (!account) {
        throw new Error(
          `Row ${row.sourceRow}: account ${row.accountCode} must match an active, postable income or expense account`,
        );
      }
      row.months.forEach((amount, i) => {
        if (data.mode === "replace" && amount === 0) return;
        lines.push({ account_id: account.id, period_month: months[i]!, amount_minor: amount });
      });
    }
    const stored = await callRpc<number>(
      sb,
      "save_budget_lines",
      { _budget_id: data.budgetId, _lines: lines, _mode: data.mode },
      BUDGET_MIGRATION,
    );
    const { error: auditError } = await context.supabase.rpc(
      "record_audit_event" as never,
      {
        _company_id: data.companyId,
        _action: "budgets.csv_import",
        _entity_type: "budget",
        _entity_id: data.budgetId,
        _details: {
          source: "csv",
          account_count: parsed.length,
          line_count: lines.length,
          mode: data.mode,
        },
      } as never,
    );
    return {
      stored: num(stored),
      accounts: parsed.length,
      budgetId: data.budgetId,
      auditError: auditError?.message ?? null,
    };
  });

export const deleteBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; budgetId: string }) => ({
    companyId: companyIdOf(input),
    budgetId: assertUuid(input?.budgetId, "budget"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    await callRpc<null>(
      context.supabase,
      "delete_budget",
      { _budget_id: data.budgetId },
      BUDGET_MIGRATION,
    );
    return { ok: true as const };
  });

/**
 * Actual results for the twelve months starting at `fiscalYearStart`, one row per income/expense
 * account (natural sign). The editor uses it for "copy from last year's actuals".
 */
export const getYearActuals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; fiscalYearStart: string; basis?: AccountingBasis }) => ({
      companyId: companyIdOf(input),
      fiscalYearStart: isoDate(input.fiscalYearStart, "Fiscal year start"),
      basis: parseAccountingBasis(input.basis),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const start = monthStart(data.fiscalYearStart);
    const months = fiscalMonthStarts(start);
    const end = addDaysIso(addMonthsIso(start, 12), -1);
    const accountingBasis = await resolveReportingBasis(sb, data.companyId, data.basis);
    const [accounts, activity] = await Promise.all([
      budgetAccounts(sb, data.companyId),
      monthlyActivity(sb, data.companyId, start, end, accountingBasis),
    ]);
    const kindOf = new Map(accounts.map((a) => [a.id, a.kind]));
    const out = new Map<string, number[]>();
    for (const a of activity) {
      const kind = kindOf.get(a.accountId);
      if (!kind) continue;
      const idx = months.indexOf(a.month);
      if (idx < 0) continue;
      const row = out.get(a.accountId) ?? Array.from({ length: 12 }, () => 0);
      row[idx] = (row[idx] ?? 0) + naturalActual(kind, a.debitMinor, a.creditMinor);
      out.set(a.accountId, row);
    }
    return {
      accountingBasis,
      rows: [...out.entries()]
        .map(([accountId, m]) => ({ accountId, months: m }))
        .filter((r) => r.months.some((v) => v !== 0)),
    };
  });

const VIEWS: ReportView[] = ["month", "quarter", "ytd"];

export const getBudgetVsActual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      budgetId: string;
      view?: string;
      to?: string;
      basis?: AccountingBasis;
    }) => ({
      companyId: companyIdOf(input),
      budgetId: assertUuid(input?.budgetId, "budget"),
      basis: parseAccountingBasis(input.basis),
      view: (VIEWS.includes(input?.view as ReportView) ? input.view : "month") as ReportView,
      to: input?.to ? isoDate(input.to, "To") : todayIso(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const [meta, head, lines, accounts] = await Promise.all([
      loadCompanyMeta(sb, data.companyId),
      loadBudgetHead(sb, data.companyId, data.budgetId),
      loadBudgetLines(sb, data.budgetId),
      budgetAccounts(sb, data.companyId),
    ]);
    const accountingBasis = await resolveReportingBasis(sb, data.companyId, data.basis);
    const months = fiscalMonthStarts(head.fiscal_year_start);
    const yearEnd = addDaysIso(addMonthsIso(monthStart(head.fiscal_year_start), 12), -1);
    // Clamp the selected date into the budget's year so the report always has a sensible range.
    const through = data.to > yearEnd ? yearEnd : data.to;
    const columns = buildBudgetColumns(data.view, months, through);
    const emptyReport = buildBudgetVsActual({ accounts, budget: [], actuals: [], columns: [] });
    if (columns.length === 0) {
      return {
        currency: meta.baseCurrency,
        accountingBasis,
        budget: head,
        through,
        view: data.view,
        report: emptyReport,
        notStarted: true,
        unbudgetedActualsMinor: 0,
      };
    }
    const activity = await monthlyActivity(
      sb,
      data.companyId,
      months[0]!,
      through,
      accountingBasis,
    );
    const report = buildBudgetVsActual({ accounts, budget: lines, actuals: activity, columns });
    // Actuals on accounts that are archived or no longer postable are not hidden: surface the total.
    const known = new Set(accounts.map((a) => a.id));
    const metas = await loadAccountMetas(sb, data.companyId);
    const plIds = new Map(
      metas
        .filter((a) => a.account_type === "income" || a.account_type === "expense")
        .map((a) => [a.id, a.account_type as BudgetAccountKind]),
    );
    let unbudgeted = 0;
    for (const a of activity) {
      const kind = plIds.get(a.accountId);
      if (kind && !known.has(a.accountId))
        unbudgeted += naturalActual(kind, a.debitMinor, a.creditMinor);
    }
    return {
      currency: meta.baseCurrency,
      accountingBasis,
      budget: head,
      through,
      view: data.view,
      report,
      notStarted: false,
      unbudgetedActualsMinor: unbudgeted,
    };
  });
