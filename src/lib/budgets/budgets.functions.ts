import { resolveReportingBasis } from "@/lib/reports/accounting-basis.server";
import { parseAccountingBasis, type AccountingBasis } from "@/lib/reports/accounting-basis";
import { loadCashReportLines } from "@/lib/reports/cash-report.server";
import { createServerFn } from "@tanstack/react-start";
import { prepareBudgetImportCsv } from "@/lib/imports/budget-import";
import { buildBudgetScenarioComparison } from "@/lib/budgets/budget-scenarios";
import { validateBudgetDocumentInput } from "@/lib/budgets/budget-document";
import {
  validateForecastAssumptions,
  type ForecastAccount,
  type ForecastActivity,
  type ForecastAmount,
  type ForecastMethod,
} from "@/lib/budgets/budget-forecast";
import {
  validateBudgetApprovalAction,
  type BudgetApprovalStatus,
} from "@/lib/budgets/budget-approval";
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
  sumMinorNumbers,
  type BudgetAccountKind,
  type ReportView,
} from "@/lib/budgets/budget-math";
import {
  buildBudgetVsActual,
  filterProfitLossActivity,
  parseSafeBudgetMinor,
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

async function budgetAccounts(
  sb: Sb,
  companyId: string,
  includeHistorical = false,
): Promise<BudgetAccount[]> {
  const metas = await loadAccountMetas(sb, companyId);
  return metas
    .filter(
      (a) =>
        (a.account_type === "income" || a.account_type === "expense") &&
        (includeHistorical || (a.is_active && a.is_postable)),
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
    amountMinor: parseSafeBudgetMinor(r.amount_minor, "Stored budget amount"),
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
    debitMinor: parseSafeBudgetMinor(r.debit_minor, "Posted debit"),
    creditMinor: parseSafeBudgetMinor(r.credit_minor, "Posted credit"),
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

export type BudgetApprovalEvent = {
  id: string;
  cycle: number;
  action: "submit" | "withdraw" | "approve" | "reject" | "reopen";
  status_after: BudgetApprovalStatus;
  acted_by: string | null;
  acted_at: string;
  note: string;
};

export type BudgetApprovalDetails = {
  available: boolean;
  status: BudgetApprovalStatus;
  cycle: number;
  viewerIsRequester: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
  requestNote: string | null;
  decisionNote: string | null;
  events: BudgetApprovalEvent[];
};

/** Read an organisation-scoped approval state and immutable approval timeline. */
export const getBudgetApproval = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; budgetId: string }) => ({
    companyId: companyIdOf(input),
    budgetId: assertUuid(input?.budgetId, "budget"),
  }))
  .handler(async ({ data, context }): Promise<BudgetApprovalDetails> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await loadBudgetHead(context.supabase as unknown as Sb, data.companyId, data.budgetId);
    const unavailable: BudgetApprovalDetails = {
      available: false,
      status: "draft",
      cycle: 0,
      viewerIsRequester: false,
      submittedAt: null,
      reviewedAt: null,
      requestNote: null,
      decisionNote: null,
      events: [],
    };
    const { data: state, error: stateError } = await context.supabase
      .from("budget_approval_state" as never)
      .select(
        "status, cycle, submitted_by, submitted_at, reviewed_at, request_note, decision_note" as never,
      )
      .eq("budget_id" as never, data.budgetId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (stateError) {
      if (isMissingRelation(stateError)) return unavailable;
      throw new Error(stateError.message);
    }
    const { data: events, error: eventsError } = await context.supabase
      .from("budget_approval_events" as never)
      .select("id, cycle, action, status_after, acted_by, acted_at, note" as never)
      .eq("budget_id" as never, data.budgetId as never)
      .eq("company_id" as never, data.companyId as never)
      .order("acted_at" as never, { ascending: false } as never)
      .limit(50);
    if (eventsError) {
      if (isMissingRelation(eventsError)) return unavailable;
      throw new Error(eventsError.message);
    }
    const item = state as unknown as
      | {
          status: BudgetApprovalStatus;
          cycle: number;
          submitted_by: string;
          submitted_at: string;
          reviewed_at: string | null;
          request_note: string;
          decision_note: string | null;
        }
      | null;
    return {
      available: true,
      status: item?.status ?? "draft",
      cycle: item?.cycle ?? 0,
      viewerIsRequester: item?.submitted_by === context.userId,
      submittedAt: item?.submitted_at ?? null,
      reviewedAt: item?.reviewed_at ?? null,
      requestNote: item?.request_note ?? null,
      decisionNote: item?.decision_note ?? null,
      events: (events ?? []) as unknown as BudgetApprovalEvent[],
    };
  });

/** All state changes and authorisation are revalidated inside the database RPC. */
export const transitionBudgetApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      budgetId: string;
      action: string;
      note: string;
    }) => ({
      companyId: companyIdOf(input),
      budgetId: assertUuid(input?.budgetId, "budget"),
      ...validateBudgetApprovalAction(input),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    const status = await callRpc<BudgetApprovalStatus>(
      context.supabase,
      "transition_budget_approval",
      {
        _company_id: data.companyId,
        _budget_id: data.budgetId,
        _action: data.action,
        _note: data.note,
      },
      "Budget approvals require migration 20261106193000_budget_approval_workflows.sql.",
    );
    return { status };
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

/**
 * Editor save: one RPC, one transaction. The document token prevents overwriting a more
 * recently saved budget. The database holds the budget row lock and performs all validation.
 */
export const saveBudgetDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      budgetId: string;
      name: string;
      notes?: string | null;
      expectedUpdatedAt: string;
      rows: Array<{ accountId: string; months: number[] }>;
    }) => {
      const validated = validateBudgetDocumentInput({
        name: input.name,
        notes: input.notes ?? null,
        expectedUpdatedAt: input.expectedUpdatedAt,
        rows: input.rows,
      });
      return {
        companyId: companyIdOf(input),
        budgetId: assertUuid(input?.budgetId, "budget"),
        ...validated,
        rows: validated.rows.map((row) => ({
          accountId: assertUuid(row.accountId, "account"),
          months: row.months,
        })),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    const sb = context.supabase as unknown as Sb;
    const header = await loadBudgetHead(sb, data.companyId, data.budgetId);
    const months = fiscalMonthStarts(header.fiscal_year_start);
    const lines: Array<{
      account_id: string;
      period_month: string;
      amount_minor: number;
    }> = [];
    for (const row of data.rows) {
      row.months.forEach((amount, index) => {
        if (amount === 0) return;
        lines.push({
          account_id: row.accountId,
          period_month: months[index]!,
          amount_minor: amount,
        });
      });
    }
    const saved = await callRpc<{ stored: number; updated_at: string }>(
      context.supabase,
      "save_budget_document",
      {
        _company_id: data.companyId,
        _budget_id: data.budgetId,
        _name: data.name,
        _notes: data.notes,
        _expected_updated_at: data.expectedUpdatedAt,
        _lines: lines,
      },
      "Atomic budget saving requires migration 20261106182000_budget_atomic_document_save.sql.",
    );
    return { stored: num(saved.stored), updatedAt: saved.updated_at };
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
      // Prior years may include P&L accounts since archived or made inactive.
      // Preserve their booked amounts so the editor can reject an incomplete
      // copy instead of silently losing historical financial data.
      budgetAccounts(sb, data.companyId, true),
      monthlyActivity(sb, data.companyId, start, end, accountingBasis),
    ]);
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const kindOf = new Map(accounts.map((a) => [a.id, a.kind]));
    const out = new Map<string, number[]>();
    for (const a of activity) {
      const kind = kindOf.get(a.accountId);
      if (!kind) continue;
      const idx = months.indexOf(a.month);
      if (idx < 0) continue;
      const row = out.get(a.accountId) ?? Array.from({ length: 12 }, () => 0);
      row[idx] = sumMinorNumbers([
        row[idx] ?? 0,
        naturalActual(kind, a.debitMinor, a.creditMinor),
      ]);
      out.set(a.accountId, row);
    }
    return {
      accountingBasis,
      rows: [...out.entries()]
        .map(([accountId, m]) => ({
          accountId,
          accountCode: accountById.get(accountId)?.code ?? "",
          accountName: accountById.get(accountId)?.name ?? "",
          months: m,
        }))
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
      budgetAccounts(sb, data.companyId, true),
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
    // The ledger aggregate includes Balance Sheet accounts as well as P&L.
    // Budget vs Actual is income/expense only: intentionally exclude asset,
    // liability and equity activity, but preserve all historical P&L accounts.
    const activity = filterProfitLossActivity(
      accounts,
      await monthlyActivity(sb, data.companyId, months[0]!, through, accountingBasis),
    );
    const report = buildBudgetVsActual({ accounts, budget: lines, actuals: activity, columns });
    // Historical accounts remain in the report even after archiving; this
    // metric separately discloses posted activity on accounts with no budget.
    const budgeted = new Set(lines.map((line) => line.accountId));
    const kindById = new Map(accounts.map((a) => [a.id, a.kind] as const));
    let unbudgetedMinor = 0n;
    for (const a of activity) {
      if (budgeted.has(a.accountId)) continue;
      const kind = kindById.get(a.accountId);
      if (!kind) throw new Error("Posted income/expense account is missing from the chart.");
      const debit = BigInt(a.debitMinor);
      const credit = BigInt(a.creditMinor);
      unbudgetedMinor += kind === "income" ? credit - debit : debit - credit;
    }
    const unbudgeted = Number(unbudgetedMinor);
    if (!Number.isSafeInteger(unbudgeted)) {
      throw new Error("Unbudgeted actuals exceed the supported minor-unit range.");
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


export type SavedBudgetForecastScenario = {
  id: string;
  name: string;
  method: ForecastMethod;
  incomeBps: number;
  expenseBps: number;
  notes: string | null;
  updatedAt: string;
  createdAt: string;
};
export type ForecastScenarioEvent = {
  id:string;
  scenarioId:string;
  action:"created"|"updated"|"deleted";
  recordedAt:string;
  recordedBy:string|null;
  name:string;
};
export type ForecastSourceData = {
  budget: BudgetSummary;
  currency: string;
  months: string[];
  accounts: ForecastAccount[];
  budgetAmounts: ForecastAmount[];
  actuals: ForecastActivity[];
  maxCompletedIndex: number;
  completedIndex: number;
  accountingBasis: "accrual";
  scenariosAvailable: boolean;
  scenarios: SavedBudgetForecastScenario[];
  events:ForecastScenarioEvent[];
};

/** Finished-month accrual forecast inputs; never treats partial current month as completed. */
export const getBudgetForecastData = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId:string;
    budgetId:string;
    completedIndex?:number;
  })=>{
    if(input.completedIndex!==undefined &&
       (!Number.isInteger(input.completedIndex) ||
         input.completedIndex < -1 || input.completedIndex > 11)){
      throw new Error("Choose a valid completed fiscal month.");
    }
    return {
      companyId:companyIdOf(input),
      budgetId:assertUuid(input.budgetId,"budget"),
      completedIndex:input.completedIndex,
    };
  })
  .handler(async({data,context}):Promise<ForecastSourceData>=>{
    await assertCompanyMember(context.supabase,data.companyId);
    const sb=context.supabase as unknown as Sb;
    const [head,meta,metas,lines] = await Promise.all([
      loadBudgetHead(sb,data.companyId,data.budgetId),
      loadCompanyMeta(sb,data.companyId),
      loadAccountMetas(sb,data.companyId),
      loadBudgetLines(sb,data.budgetId),
    ]);
    const months=fiscalMonthStarts(head.fiscal_year_start);
    const currentMonth=monthStart(todayIso());
    const maxCompletedIndex=months.filter(month=>month<currentMonth).length-1;
    if(data.completedIndex!==undefined && data.completedIndex>maxCompletedIndex){
      throw new Error("The selected month has not finished yet.");
    }
    const completedIndex=data.completedIndex??maxCompletedIndex;
    // The scenario table has no 250-row business limit. Probe for the optional
    // migration, then paginate by a UNIQUE stable column so saved scenarios
    // cannot disappear from the picker as an organisation grows.
    const [activity,scenariosProbe,eventsResult] = await Promise.all([
      completedIndex<0 ? Promise.resolve([] as MonthActivity[]) :
        monthlyActivity(sb,data.companyId,months[0]!,
          addDaysIso(addMonthsIso(months[completedIndex]!,1),-1),"accrual"),
      sb.from("budget_forecast_scenarios" as never)
        .select("id" as never)
        .eq("company_id" as never,data.companyId as never)
        .eq("budget_id" as never,data.budgetId as never)
        .limit(1),
      context.supabase
        .from("budget_forecast_scenario_events" as never)
        .select("id,scenario_id,action,recorded_at,recorded_by,snapshot" as never)
        .eq("company_id" as never,data.companyId as never)
        .eq("budget_id" as never,data.budgetId as never)
        .order("recorded_at" as never,{ascending:false} as never)
        .limit(50),
    ]);
    if(scenariosProbe.error&&!isMissingRelation(scenariosProbe.error)){
      throw new Error(scenariosProbe.error.message);
    }
    if(eventsResult.error&&!isMissingRelation(eventsResult.error)){
      throw new Error(eventsResult.error.message);
    }
    const scenariosAvailable=!scenariosProbe.error&&!eventsResult.error;
    type StoredForecastScenario = {
      id:string;name:string;method:ForecastMethod;
      income_adjustment_bps:number;expense_adjustment_bps:number;
      notes:string|null;updated_at:string;created_at:string;
    };
    const raw:StoredForecastScenario[] = scenariosAvailable
      ? await fetchAllPages<StoredForecastScenario>((from,to)=>
          sb.from("budget_forecast_scenarios" as never)
            .select("id,name,method,income_adjustment_bps,expense_adjustment_bps,notes,updated_at,created_at" as never)
            .eq("company_id" as never,data.companyId as never)
            .eq("budget_id" as never,data.budgetId as never)
            .order("id" as never)
            .range(from,to) as unknown as PromiseLike<PageResult<StoredForecastScenario>>,
        )
      : [];
    const accountList:ForecastAccount[]=metas
      .filter(a=>a.account_type==="income"||a.account_type==="expense")
      .map(a=>({
        id:a.id,code:a.code,name:a.name,kind:a.account_type as BudgetAccountKind,
      }));
    const exact=(amount:unknown,label:string):number=>{
      if((typeof amount!=="number"&&typeof amount!=="string") ||
        !/^-?\d+$/.test(String(amount)) ||
        !Number.isSafeInteger(Number(amount))){
        throw new Error(label+" exceeds safe minor-unit precision.");
      }
      return Number(amount);
    };
    return {
      budget:head,
      currency:meta.baseCurrency,
      months,
      accounts:accountList,
      budgetAmounts:lines.map(line=>({
        ...line,amountMinor:exact(line.amountMinor,"Budget"),
      })),
      // ledger_monthly_activity includes balance-sheet accounts. Forecasts
      // use only P&L, including archived historical income/expense accounts.
      actuals:filterProfitLossActivity(accountList, activity).map(a=>({
        accountId:a.accountId,month:a.month,
        debitMinor:exact(a.debitMinor,"Posted debit"),
        creditMinor:exact(a.creditMinor,"Posted credit"),
      })),
      maxCompletedIndex,completedIndex,accountingBasis:"accrual",
      scenariosAvailable,
      scenarios:raw.sort((a,b)=>a.name.localeCompare(b.name)).map(row=>({
        id:row.id,name:row.name,method:row.method,
        incomeBps:row.income_adjustment_bps,expenseBps:row.expense_adjustment_bps,
        notes:row.notes,updatedAt:row.updated_at,createdAt:row.created_at,
      })),
      events:((eventsResult.data??[]) as Array<{
        id:string;scenario_id:string;
        action:"created"|"updated"|"deleted";
        recorded_at:string;recorded_by:string|null;
        snapshot:{name:string};
      }>).map(row=>({
        id:row.id,scenarioId:row.scenario_id,
        action:row.action,recordedAt:row.recorded_at,
        recordedBy:row.recorded_by,
        name:row.snapshot.name,
      })),
    };
  });

function validateForecastScenarioDraft(input:{
  name:unknown;
  notes:unknown;
  method:unknown;
  incomeBps:unknown;
  expenseBps:unknown;
}){
  if(typeof input.name!=="string" ||
     input.name.trim().length<3 || input.name.trim().length>100){
    throw new Error("Scenario name must be 3 to 100 characters.");
  }
  if(input.notes!==undefined&&input.notes!==null&&typeof input.notes!=="string"){
    throw new Error("Scenario notes must be text.");
  }
  const notes=typeof input.notes==="string" ? input.notes.trim():null;
  if((notes?.length??0)>1000)throw new Error("Scenario notes must be under 1001 characters.");
  const assumptions=validateForecastAssumptions(input);
  return {...assumptions,name:input.name.trim(),notes:notes||null};
}

export const saveBudgetForecastScenario = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:{
    companyId:string;budgetId:string;
    scenarioId?:string|null;expectedUpdatedAt?:string|null;
    name:string;notes?:string|null;
    method:ForecastMethod;incomeBps:number;expenseBps:number;
  })=>{
    const id=input.scenarioId?assertUuid(input.scenarioId,"scenario"):null;
    if(id&&(!input.expectedUpdatedAt ||
        !Number.isFinite(Date.parse(input.expectedUpdatedAt)))){
      throw new Error("Reload the saved scenario before changing it.");
    }
    if(!id&&input.expectedUpdatedAt){
      throw new Error("New scenarios cannot specify an existing version.");
    }
    return {
      companyId:companyIdOf(input),
      budgetId:assertUuid(input.budgetId,"budget"),
      scenarioId:id,expectedUpdatedAt:id?input.expectedUpdatedAt!:null,
      ...validateForecastScenarioDraft({
        name: input.name,
        notes: input.notes,
        method: input.method,
        incomeBps: input.incomeBps,
        expenseBps: input.expenseBps,
      }),
    };
  })
  .handler(async({data,context})=>{
    await assertCompanyPermission(context.supabase,data.companyId,"accounts.manage");
    const result=await callRpc<{id:string;updated_at:string}>(
      context.supabase,"save_budget_forecast_scenario",{
        _company_id:data.companyId,_budget_id:data.budgetId,
        _scenario_id:data.scenarioId,
        _expected_updated_at:data.expectedUpdatedAt,
        _name:data.name,_method:data.method,
        _income_bps:data.incomeBps,_expense_bps:data.expenseBps,
        _notes:data.notes,
      },"Saving forecast scenarios requires migration 20261106214000_budget_forecast_scenarios.sql.",
    );
    return {id:result.id,updatedAt:result.updated_at};
  });

export const deleteBudgetForecastScenario = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:{
    companyId:string;budgetId:string;scenarioId:string;expectedUpdatedAt:string;
  })=>{
    if(typeof input.expectedUpdatedAt!=="string" ||
       !Number.isFinite(Date.parse(input.expectedUpdatedAt))){
      throw new Error("Reload the saved scenario before deleting it.");
    }
    return {
      companyId:companyIdOf(input),
      budgetId:assertUuid(input.budgetId,"budget"),
      scenarioId:assertUuid(input.scenarioId,"scenario"),
      expectedUpdatedAt:input.expectedUpdatedAt,
    };
  })
  .handler(async({data,context})=>{
    await assertCompanyPermission(context.supabase,data.companyId,"accounts.manage");
    await callRpc<boolean>(context.supabase,"delete_budget_forecast_scenario",{
      _company_id:data.companyId,_budget_id:data.budgetId,
      _scenario_id:data.scenarioId,_expected_updated_at:data.expectedUpdatedAt,
    },"Deleting forecast scenarios requires migration 20261106214000_budget_forecast_scenarios.sql.");
    return {deleted:true as const};
  });
