import { createServerFn } from "@tanstack/react-start";
import { prepareFixedAssetsCsv } from "@/lib/imports/fixed-assets-import";
import { pageCapitalisationBillLines } from "@/lib/fixed-assets/capitalisation-review";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import { monthEnd, todayIso } from "@/lib/accounting/fiscal-year";
import { loadAccountMetas, loadCompanyMeta, type Sb } from "@/lib/accounting/ledger-data";
import {
  buildSchedule,
  validateAssetTerms,
  type DepreciationMethod,
  type ScheduleRow,
} from "@/lib/fixed-assets/depreciation";
import {
  ASSET_MIGRATION,
  callRpc,
  companyIdOf,
  isMissingRelation,
  isoDate,
  num,
  wholeMinor,
} from "@/lib/planning/rpc";

const METHODS: DepreciationMethod[] = ["straight_line", "reducing_balance", "none"];

export type AssetAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
};

export type AssetTypeRow = {
  id: string;
  name: string;
  depreciation_method: DepreciationMethod;
  useful_life_months: number | null;
  annual_rate_bps: number | null;
  asset_account_id: string;
  accumulated_account_id: string;
  expense_account_id: string;
  is_active: boolean;
};

export type FixedAssetRow = {
  id: string;
  asset_type_id: string | null;
  asset_number: string;
  name: string;
  description: string | null;
  notes: string | null;
  purchase_date: string;
  depreciation_start_date: string;
  cost_minor: number;
  residual_minor: number;
  opening_accumulated_minor: number;
  depreciation_method: DepreciationMethod;
  useful_life_months: number | null;
  annual_rate_bps: number | null;
  asset_account_id: string;
  accumulated_account_id: string;
  expense_account_id: string;
  status: "active" | "disposed";
  depreciated_through: string | null;
  source_bill_id: string | null;
  source_bill_line_id: string | null;
  disposal_date: string | null;
  disposal_proceeds_minor: number | null;
  disposal_journal_id: string | null;
};

const ASSET_COLUMNS =
  "id, asset_type_id, asset_number, name, description, notes, purchase_date, depreciation_start_date, cost_minor, residual_minor, opening_accumulated_minor, depreciation_method, useful_life_months, annual_rate_bps, asset_account_id, accumulated_account_id, expense_account_id, status, depreciated_through, source_bill_id, source_bill_line_id, disposal_date, disposal_proceeds_minor, disposal_journal_id";

function normaliseAsset(r: Record<string, unknown>): FixedAssetRow {
  const row = r as unknown as FixedAssetRow;
  return {
    ...row,
    cost_minor: num(row.cost_minor),
    residual_minor: num(row.residual_minor),
    opening_accumulated_minor: num(row.opening_accumulated_minor),
    disposal_proceeds_minor:
      row.disposal_proceeds_minor === null ? null : num(row.disposal_proceeds_minor),
  };
}

async function relationError<T>(
  run: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>,
): Promise<T | null> {
  const { data, error } = await run;
  if (error) throw new Error(isMissingRelation(error) ? ASSET_MIGRATION : error.message);
  return data;
}

/** Everything the register page needs in one call. */
export const getAssetRegisterPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const probe = await sb
      .from("fixed_assets" as never)
      .select("id" as never)
      .limit(1);
    if (probe.error) {
      if (isMissingRelation(probe.error)) {
        return {
          available: false as const,
          currency: "",
          assets: [] as FixedAssetRow[],
          types: [] as AssetTypeRow[],
          accounts: [] as AssetAccount[],
          lastRunThrough: null as string | null,
        };
      }
      throw new Error(probe.error.message);
    }
    const [meta, metas, types, assets, lastRun] = await Promise.all([
      loadCompanyMeta(sb, data.companyId),
      loadAccountMetas(sb, data.companyId),
      relationError(
        sb
          .from("asset_types" as never)
          .select(
            "id, name, depreciation_method, useful_life_months, annual_rate_bps, asset_account_id, accumulated_account_id, expense_account_id, is_active" as never,
          )
          .eq("company_id" as never, data.companyId as never)
          .order("name" as never)
          .limit(500) as unknown as PromiseLike<{
          data: AssetTypeRow[] | null;
          error: { message: string } | null;
        }>,
      ),
      fetchAllPages<Record<string, unknown>>(
        (from, to) =>
          sb
            .from("fixed_assets" as never)
            .select(ASSET_COLUMNS as never)
            .eq("company_id" as never, data.companyId as never)
            .order("asset_number" as never)
            .range(from, to) as unknown as PromiseLike<PageResult<Record<string, unknown>>>,
      ),
      relationError(
        sb
          .from("asset_depreciation_runs" as never)
          .select("period_end" as never)
          .eq("company_id" as never, data.companyId as never)
          .order("period_end" as never, { ascending: false } as never)
          .limit(1) as unknown as PromiseLike<{
          data: Array<{ period_end: string }> | null;
          error: { message: string } | null;
        }>,
      ),
    ]);
    return {
      available: true as const,
      currency: meta.baseCurrency,
      assets: assets.map(normaliseAsset),
      types: types ?? [],
      accounts: metas
        .filter((a) => a.is_active && a.is_postable)
        .map((a) => ({ id: a.id, code: a.code, name: a.name, accountType: a.account_type }))
        .sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true })),
      lastRunThrough: lastRun?.[0]?.period_end ?? null,
    };
  });

/** One asset with its posted entries and the projected schedule from its terms. */
export const getFixedAsset = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; assetId: string }) => ({
    companyId: companyIdOf(input),
    assetId: assertUuid(input?.assetId, "asset"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const row = await relationError(
      sb
        .from("fixed_assets" as never)
        .select(ASSET_COLUMNS as never)
        .eq("id" as never, data.assetId as never)
        .eq("company_id" as never, data.companyId as never)
        .maybeSingle() as unknown as PromiseLike<{
        data: Record<string, unknown> | null;
        error: { message: string } | null;
      }>,
    );
    if (!row) throw new Error("Fixed asset not found.");
    const asset = normaliseAsset(row);
    const entries = await fetchAllPages<{
      id: string;
      period_end: string;
      amount_minor: number;
      journal_id: string;
    }>(
      (from, to) =>
        sb
          .from("asset_depreciation_entries" as never)
          .select("id, period_end, amount_minor, journal_id" as never)
          .eq("asset_id" as never, data.assetId as never)
          .eq("company_id" as never, data.companyId as never)
          .order("period_end" as never)
          .range(from, to) as unknown as PromiseLike<
          PageResult<{ id: string; period_end: string; amount_minor: number; journal_id: string }>
        >,
    );
    const schedule: ScheduleRow[] =
      asset.depreciation_method === "none"
        ? []
        : buildSchedule(
            {
              method: asset.depreciation_method,
              costMinor: asset.cost_minor,
              residualMinor: asset.residual_minor,
              openingAccumulatedMinor: asset.opening_accumulated_minor,
              usefulLifeMonths: asset.useful_life_months,
              annualRateBps: asset.annual_rate_bps,
            },
            asset.depreciation_start_date,
          );
    return {
      asset,
      entries: entries.map((e) => ({ ...e, amount_minor: num(e.amount_minor) })),
      schedule,
    };
  });

export type SaveAssetTypeInput = {
  companyId: string;
  typeId?: string | null;
  name: string;
  method: DepreciationMethod;
  usefulLifeMonths?: number | null;
  annualRateBps?: number | null;
  assetAccountId: string;
  accumulatedAccountId: string;
  expenseAccountId: string;
};

export const saveAssetType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaveAssetTypeInput) => {
    if (!METHODS.includes(input?.method)) throw new Error("Choose a depreciation method.");
    return {
      companyId: companyIdOf(input),
      typeId: input.typeId ? assertUuid(input.typeId, "asset type") : null,
      name: (input.name ?? "").trim(),
      method: input.method,
      usefulLifeMonths: input.usefulLifeMonths ?? null,
      annualRateBps: input.annualRateBps ?? null,
      assetAccountId: assertUuid(input.assetAccountId, "asset account"),
      accumulatedAccountId: assertUuid(
        input.accumulatedAccountId,
        "accumulated depreciation account",
      ),
      expenseAccountId: assertUuid(input.expenseAccountId, "depreciation expense account"),
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    if (!data.name) throw new Error("Enter an asset type name.");
    const id = await callRpc<string>(
      context.supabase,
      "save_asset_type",
      {
        _company_id: data.companyId,
        _type_id: data.typeId,
        _payload: {
          name: data.name,
          depreciation_method: data.method,
          useful_life_months: data.usefulLifeMonths,
          annual_rate_bps: data.annualRateBps,
          asset_account_id: data.assetAccountId,
          accumulated_account_id: data.accumulatedAccountId,
          expense_account_id: data.expenseAccountId,
        },
      },
      ASSET_MIGRATION,
    );
    return { id };
  });

export type SaveFixedAssetInput = {
  companyId: string;
  assetId?: string | null;
  assetTypeId?: string | null;
  name: string;
  description?: string | null;
  notes?: string | null;
  purchaseDate: string;
  depreciationStartDate?: string | null;
  costMinor: number;
  residualMinor?: number;
  openingAccumulatedMinor?: number;
  method: DepreciationMethod;
  usefulLifeMonths?: number | null;
  annualRateBps?: number | null;
  assetAccountId: string;
  accumulatedAccountId: string;
  expenseAccountId: string;
  sourceBillId?: string | null;
  sourceBillLineId?: string | null;
};

export const saveFixedAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaveFixedAssetInput) => {
    if (!METHODS.includes(input?.method)) throw new Error("Choose a depreciation method.");
    const v = {
      companyId: companyIdOf(input),
      assetId: input.assetId ? assertUuid(input.assetId, "asset") : null,
      assetTypeId: input.assetTypeId ? assertUuid(input.assetTypeId, "asset type") : null,
      name: (input.name ?? "").trim(),
      description: (input.description ?? "").trim() || null,
      notes: (input.notes ?? "").trim() || null,
      purchaseDate: isoDate(input.purchaseDate, "Purchase date"),
      depreciationStartDate: input.depreciationStartDate
        ? isoDate(input.depreciationStartDate, "Depreciation start date")
        : isoDate(input.purchaseDate, "Purchase date"),
      costMinor: wholeMinor(input.costMinor, "Cost"),
      residualMinor: wholeMinor(input.residualMinor ?? 0, "Residual value", { min: 0 }),
      openingAccumulatedMinor: wholeMinor(
        input.openingAccumulatedMinor ?? 0,
        "Opening accumulated depreciation",
        { min: 0 },
      ),
      method: input.method,
      usefulLifeMonths: input.usefulLifeMonths ?? null,
      annualRateBps: input.annualRateBps ?? null,
      assetAccountId: assertUuid(input.assetAccountId, "asset account"),
      accumulatedAccountId: assertUuid(
        input.accumulatedAccountId,
        "accumulated depreciation account",
      ),
      expenseAccountId: assertUuid(input.expenseAccountId, "depreciation expense account"),
      sourceBillId: input.sourceBillId ? assertUuid(input.sourceBillId, "bill") : null,
      sourceBillLineId: input.sourceBillLineId
        ? assertUuid(input.sourceBillLineId, "bill line")
        : null,
    };
    if (v.depreciationStartDate < v.purchaseDate) {
      throw new Error("Depreciation cannot start before the purchase date.");
    }
    const problems = validateAssetTerms({
      method: v.method,
      costMinor: v.costMinor,
      residualMinor: v.residualMinor,
      openingAccumulatedMinor: v.openingAccumulatedMinor,
      usefulLifeMonths: v.usefulLifeMonths,
      annualRateBps: v.annualRateBps,
    });
    if (problems.length > 0) throw new Error(problems[0]);
    return v;
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    if (!data.name) throw new Error("Enter an asset name.");
    const id = await callRpc<string>(
      context.supabase,
      "save_fixed_asset",
      {
        _company_id: data.companyId,
        _asset_id: data.assetId,
        _payload: {
          asset_type_id: data.assetTypeId,
          name: data.name,
          description: data.description,
          notes: data.notes,
          purchase_date: data.purchaseDate,
          depreciation_start_date: data.depreciationStartDate,
          cost_minor: data.costMinor,
          residual_minor: data.residualMinor,
          opening_accumulated_minor: data.openingAccumulatedMinor,
          depreciation_method: data.method,
          useful_life_months: data.usefulLifeMonths,
          annual_rate_bps: data.annualRateBps,
          asset_account_id: data.assetAccountId,
          accumulated_account_id: data.accumulatedAccountId,
          expense_account_id: data.expenseAccountId,
          source_bill_id: data.sourceBillId,
          source_bill_line_id: data.sourceBillLineId,
        },
      },
      ASSET_MIGRATION,
    );
    return { id };
  });

/** Check that the atomic CSV import migration and its tenant-scoped mapping table are deployed. */
export const getFixedAssetImportAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { error } = await context.supabase
      .from("fixed_asset_import_refs" as never)
      .select("asset_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .limit(0);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST200") {
        return {
          available: false as const,
          reason: "The fixed asset CSV import database migration has not been deployed.",
        };
      }
      throw new Error(error.message);
    }
    return { available: true as const, reason: null as string | null };
  });

export type FixedAssetCsvImportResult = {
  created: number;
  skipped: number;
  assets: Array<{ external_code: string; asset_id: string }>;
};

/**
 * Atomic register-only import, backed by import_fixed_asset_register in the migration.
 * This does NOT post opening balances, AP, tax or depreciation journal entries.
 */
export const importFixedAssetRegisterCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; csvText: string }) => {
    if (typeof input?.csvText !== "string" || input.csvText.length > 5 * 1024 * 1024) {
      throw new Error("Invalid asset CSV or file exceeds 5 MB");
    }
    return { companyId: companyIdOf(input), csvText: input.csvText };
  })
  .handler(async ({ data, context }): Promise<FixedAssetCsvImportResult> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    const sb = context.supabase as unknown as Sb;
    const [meta, accounts, typesResult] = await Promise.all([
      loadCompanyMeta(sb, data.companyId),
      loadAccountMetas(sb, data.companyId),
      sb
        .from("asset_types" as never)
        .select("id, name, is_active" as never)
        .eq("company_id" as never, data.companyId as never)
        .limit(500),
    ]);
    if (typesResult.error) throw new Error(typesResult.error.message);
    const assets = prepareFixedAssetsCsv(data.csvText, meta.baseCurrency);
    const byCode = new Map<string, (typeof accounts)[number]>();
    for (const account of accounts) {
      const code = account.code.toLocaleLowerCase("en-US");
      if (byCode.has(code)) throw new Error("Ambiguous chart-of-accounts code " + account.code);
      byCode.set(code, account);
    }
    const activeTypes = new Map<string, string>();
    for (const type of (typesResult.data ?? []) as Array<{
      id: string;
      name: string;
      is_active: boolean;
    }>) {
      if (!type.is_active) continue;
      const name = type.name.toLocaleLowerCase("en-US");
      if (activeTypes.has(name)) throw new Error("Ambiguous asset type: " + type.name);
      activeTypes.set(name, type.id);
    }
    const resolve = (code: string, kind: "asset" | "expense", row: number) => {
      const account = byCode.get(code.toLocaleLowerCase("en-US"));
      if (
        !account ||
        !account.is_active ||
        !account.is_postable ||
        account.is_control ||
        account.account_type !== kind
      ) {
        throw new Error(
          "Row " + row + ": " + code + " must match one active, non-control " + kind + " account",
        );
      }
      return account.id;
    };
    const rows = assets.map((a) => {
      const assetTypeId = a.assetTypeName
        ? activeTypes.get(a.assetTypeName.toLocaleLowerCase("en-US"))
        : null;
      if (a.assetTypeName && !assetTypeId) {
        throw new Error(
          "Row " +
            a.sourceRow +
            ": asset type " +
            a.assetTypeName +
            " was not found in this organisation",
        );
      }
      return {
        external_code: a.externalCode,
        payload: {
          asset_type_id: assetTypeId,
          name: a.name,
          description: null,
          // Case-insensitive external references must create identical payloads on retries.
          notes:
            "Imported asset reference: " +
            a.externalCode.toLocaleUpperCase("en-US") +
            (a.openingDepreciationThrough
              ? "; opening depreciation through " + a.openingDepreciationThrough
              : ""),
          purchase_date: a.purchaseDate,
          depreciation_start_date: a.depreciationStartDate,
          cost_minor: a.costMinor,
          residual_minor: a.residualMinor,
          opening_accumulated_minor: a.openingAccumulatedMinor,
          depreciation_method: a.method,
          useful_life_months: a.usefulLifeMonths,
          annual_rate_bps: a.annualRateBps,
          asset_account_id: resolve(a.assetAccountCode, "asset", a.sourceRow),
          accumulated_account_id: resolve(a.accumulatedAccountCode, "asset", a.sourceRow),
          expense_account_id: resolve(a.expenseAccountCode, "expense", a.sourceRow),
          source_bill_id: null,
          source_bill_line_id: null,
        },
      };
    });
    return await callRpc<FixedAssetCsvImportResult>(
      sb,
      "import_fixed_asset_register",
      { _company_id: data.companyId, _rows: rows },
      "Fixed asset import requires database migration 20261030153000_fixed_asset_register_csv_import.",
    );
  });

export const deleteFixedAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; assetId: string }) => ({
    companyId: companyIdOf(input),
    assetId: assertUuid(input?.assetId, "asset"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    await callRpc<null>(
      context.supabase,
      "delete_fixed_asset",
      { _asset_id: data.assetId },
      ASSET_MIGRATION,
    );
    return { ok: true as const };
  });

export type DepreciationRunRow = {
  asset_id: string;
  asset_number: string;
  asset_name: string;
  status: "due" | "not_started" | "behind" | "done" | "nothing_left" | "posted";
  amount_minor: number;
  accumulated_after_minor: number;
  journal_id: string | null;
};

function normaliseRunRows(rows: unknown): DepreciationRunRow[] {
  return ((rows ?? []) as DepreciationRunRow[]).map((r) => ({
    ...r,
    amount_minor: num(r.amount_minor),
    accumulated_after_minor: num(r.accumulated_after_minor),
  }));
}

function periodEndOf(v: unknown): string {
  const d = isoDate(v, "Period end");
  if (monthEnd(d) !== d) throw new Error("Choose the last day of a month.");
  return d;
}

/** Preview of one month: writes nothing. */
export const previewDepreciation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; periodEnd: string }) => ({
    companyId: companyIdOf(input),
    periodEnd: periodEndOf(input?.periodEnd),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const rows = await callRpc<unknown>(
      context.supabase,
      "run_depreciation",
      { _company_id: data.companyId, _period_end: data.periodEnd, _preview: true },
      ASSET_MIGRATION,
    );
    const list = normaliseRunRows(rows);
    return {
      periodEnd: data.periodEnd,
      rows: list,
      totalMinor: list.reduce((s, r) => s + (r.status === "due" ? r.amount_minor : 0), 0),
    };
  });

/**
 * Posts depreciation for every month from the first outstanding one through `periodEnd`. One journal
 * per month, each through post_journal. Stops at the first month that fails (for example a locked
 * period) and reports what was posted so far; re-running is safe because each month is idempotent.
 */
export const runDepreciation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; periodEnds: string[] }) => {
    if (!Array.isArray(input?.periodEnds) || input.periodEnds.length === 0) {
      throw new Error("Choose the month to depreciate.");
    }
    if (input.periodEnds.length > 36) throw new Error("Run at most 36 months at a time.");
    const ends = [...new Set(input.periodEnds.map(periodEndOf))].sort();
    if (ends[ends.length - 1]! > monthEnd(todayIso())) {
      throw new Error("Depreciation cannot be run for a month that has not started.");
    }
    return { companyId: companyIdOf(input), periodEnds: ends };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post").catch(
      async () => assertCompanyPermission(context.supabase, data.companyId, "journals.manual"),
    );
    const posted: Array<{ periodEnd: string; totalMinor: number; assets: number }> = [];
    let failure: { periodEnd: string; message: string } | null = null;
    for (const periodEnd of data.periodEnds) {
      try {
        const rows = normaliseRunRows(
          await callRpc<unknown>(
            context.supabase,
            "run_depreciation",
            { _company_id: data.companyId, _period_end: periodEnd, _preview: false },
            ASSET_MIGRATION,
          ),
        );
        const done = rows.filter((r) => r.status === "posted");
        posted.push({
          periodEnd,
          totalMinor: done.reduce((s, r) => s + r.amount_minor, 0),
          assets: done.length,
        });
      } catch (e) {
        failure = { periodEnd, message: e instanceof Error ? e.message : "Depreciation failed." };
        break;
      }
    }
    return { posted, failure };
  });

export const disposeFixedAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      assetId: string;
      disposalDate: string;
      proceedsMinor: number;
      proceedsAccountId?: string | null;
      gainLossAccountId?: string | null;
      notes?: string | null;
    }) => ({
      companyId: companyIdOf(input),
      assetId: assertUuid(input?.assetId, "asset"),
      disposalDate: isoDate(input.disposalDate, "Disposal date"),
      proceedsMinor: wholeMinor(input.proceedsMinor ?? 0, "Proceeds", { min: 0 }),
      proceedsAccountId: input.proceedsAccountId
        ? assertUuid(input.proceedsAccountId, "proceeds account")
        : null,
      gainLossAccountId: input.gainLossAccountId
        ? assertUuid(input.gainLossAccountId, "gain/loss account")
        : null,
      notes: (input.notes ?? "").trim() || null,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post").catch(
      async () => assertCompanyPermission(context.supabase, data.companyId, "journals.manual"),
    );
    const journalId = await callRpc<string>(
      context.supabase,
      "dispose_fixed_asset",
      {
        _asset_id: data.assetId,
        _disposal_date: data.disposalDate,
        _proceeds_minor: data.proceedsMinor,
        _proceeds_account_id: data.proceedsAccountId,
        _gain_loss_account_id: data.gainLossAccountId,
        _notes: data.notes,
      },
      ASSET_MIGRATION,
    );
    return { journalId };
  });

type BillLineRaw = {
  id: string;
  bill_id: string;
  description: string | null;
  account_id: string;
  net_minor: number | string;
  tax_minor: number | string;
  purchase_bills: {
    bill_number: string | null;
    supplier_invoice_number: string | null;
    bill_date: string;
    currency_code: string;
    contacts: { name: string } | null;
  };
};

export type CapitaliseLine = {
  lineId: string;
  billId: string;
  billNumber: string | null;
  supplier: string | null;
  billDate: string;
  currency: string;
  description: string;
  accountId: string;
  netMinor: number;
  taxMinor: number;
  /** Cost already registered against this line (base-currency bills). */
  registeredMinor: number;
  accountCode: string;
  accountName: string;
};

/** Keep BIGINT minor units safe across joins and multiple registered assets. */
function safeAssetBillMinor(value: number | string | bigint, field: string): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error(field + " exceeds JavaScript safe integer precision.");
  }
  if (typeof value === "string" && !/^-?\d+$/.test(value)) {
    throw new Error(field + " is not a whole minor-unit amount.");
  }
  return BigInt(value);
}
function capitalisationDisplayMinor(value: bigint, field: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(field + " is too large for asset entry. Review the bill and linked assets.");
  }
  return Number(value);
}

/** Posted bill lines coded to asset accounts: review candidates, not confirmed PPE. */
export const listCapitalisableBillLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; asOf?: string }) => {
    const asOf = input?.asOf ? isoDate(input.asOf, "As at") : todayIso();
    if (asOf > todayIso()) throw new Error("Bill review date cannot be in the future.");
    return { companyId: companyIdOf(input), asOf };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const metas = await loadAccountMetas(sb, data.companyId);
    // Eligible for REVIEW only. An asset-coded line can be inventory, prepayment,
    // a deposit or another non-PPE current asset: never capitalise automatically.
    const accountsById = new Map(metas.map((a) => [a.id, a]));
    const assetIds = metas
      .filter((a) => a.account_type === "asset" && !a.is_control)
      .map((a) => a.id);
    if (assetIds.length === 0) return { asOf: data.asOf, lines: [] as CapitaliseLine[] };

    // PostgREST .in filters stay below URL limits; every chunk pages by unique ID.
    const rows = await pageCapitalisationBillLines<BillLineRaw>(
      assetIds,
      (accountChunk, from, to) =>
        sb
          .from("purchase_bill_lines" as never)
          .select(
            "id, bill_id, description, account_id, net_minor, tax_minor, purchase_bills!inner(bill_number, supplier_invoice_number, bill_date, currency_code, status, contacts(name))" as never,
          )
          .eq("company_id" as never, data.companyId as never)
          .in("account_id" as never, accountChunk as never)
          .in("purchase_bills.status" as never, ["authorised", "partly_paid", "paid"] as never)
          .lte("purchase_bills.bill_date" as never, data.asOf as never)
          .order("id" as never)
          .range(from, to) as unknown as PromiseLike<PageResult<BillLineRaw>>,
    );

    const eligibleIds = new Set(rows.map((r) => r.id));
    const registered = new Map<string, bigint>();
    if (rows.length > 0) {
      const linked = await fetchAllPages<{
        id: string;
        source_bill_line_id: string | null;
        cost_minor: number | string;
      }>(
        (from, to) =>
          sb
            .from("fixed_assets" as never)
            .select("id, source_bill_line_id, cost_minor" as never)
            .eq("company_id" as never, data.companyId as never)
            .not("source_bill_line_id" as never, "is" as never, null as never)
            .order("id" as never)
            .range(from, to) as unknown as PromiseLike<
              PageResult<{ id: string; source_bill_line_id: string | null; cost_minor: number | string }>
            >,
      );
      for (const asset of linked) {
        const id = asset.source_bill_line_id;
        if (!id || !eligibleIds.has(id)) continue;
        registered.set(
          id,
          (registered.get(id) ?? 0n) + safeAssetBillMinor(asset.cost_minor, "Linked asset cost"),
        );
      }
    }

    const lines: CapitaliseLine[] = rows.map((r) => {
      const bill = r.purchase_bills;
      const account = accountsById.get(r.account_id);
      return {
        lineId: r.id,
        billId: r.bill_id,
        billNumber: bill.bill_number ?? bill.supplier_invoice_number,
        supplier: bill.contacts?.name ?? null,
        billDate: bill.bill_date,
        currency: bill.currency_code,
        description: r.description ?? "",
        accountId: r.account_id,
        accountCode: account?.code ?? "",
        accountName: account?.name ?? "Account unavailable",
        netMinor: capitalisationDisplayMinor(
          safeAssetBillMinor(r.net_minor, "Bill line net"),
          "Bill line net",
        ),
        taxMinor: capitalisationDisplayMinor(
          safeAssetBillMinor(r.tax_minor, "Bill line tax"),
          "Bill line tax",
        ),
        registeredMinor: capitalisationDisplayMinor(
          registered.get(r.id) ?? 0n,
          "Already linked asset cost",
        ),
      };
    });
    return { asOf: data.asOf, lines };
  });

export type FixedAssetRegisterRow = {
  asset_id: string;
  asset_number: string;
  asset_name: string;
  asset_type_name: string | null;
  asset_account_id: string;
  purchase_date: string;
  depreciation_method: DepreciationMethod;
  useful_life_months: number | null;
  annual_rate_bps: number | null;
  cost_minor: number;
  residual_minor: number;
  accumulated_minor: number;
  disposal_date: string | null;
  disposal_proceeds_minor: number | null;
  source_bill_id: string | null;
};

export const getFixedAssetRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; asOf: string }) => ({
    companyId: companyIdOf(input),
    asOf: isoDate(input?.asOf, "As at"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const [meta, rows] = await Promise.all([
      loadCompanyMeta(sb, data.companyId),
      callRpc<FixedAssetRegisterRow[]>(
        sb,
        "report_fixed_asset_register",
        { _company_id: data.companyId, _as_of: data.asOf },
        ASSET_MIGRATION,
      ),
    ]);
    return {
      currency: meta.baseCurrency,
      asOf: data.asOf,
      rows: (rows ?? []).map((r) => ({
        ...r,
        cost_minor: num(r.cost_minor),
        residual_minor: num(r.residual_minor),
        accumulated_minor: num(r.accumulated_minor),
        disposal_proceeds_minor:
          r.disposal_proceeds_minor === null ? null : num(r.disposal_proceeds_minor),
      })),
    };
  });

export type DepreciationScheduleRow = {
  asset_id: string;
  asset_number: string;
  asset_name: string;
  cost_minor: number;
  opening_accumulated_minor: number;
  charge_minor: number;
  closing_accumulated_minor: number;
  disposal_date: string | null;
};

export const getDepreciationSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; from: string; to: string }) => {
    const from = isoDate(input?.from, "From");
    const to = isoDate(input?.to, "To");
    if (to < from) throw new Error("The end date is before the start date.");
    return { companyId: companyIdOf(input), from, to };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const [meta, rows] = await Promise.all([
      loadCompanyMeta(sb, data.companyId),
      callRpc<DepreciationScheduleRow[]>(
        sb,
        "report_depreciation_schedule",
        { _company_id: data.companyId, _from: data.from, _to: data.to },
        ASSET_MIGRATION,
      ),
    ]);
    return {
      currency: meta.baseCurrency,
      from: data.from,
      to: data.to,
      rows: (rows ?? []).map((r) => ({
        ...r,
        cost_minor: num(r.cost_minor),
        opening_accumulated_minor: num(r.opening_accumulated_minor),
        charge_minor: num(r.charge_minor),
        closing_accumulated_minor: num(r.closing_accumulated_minor),
      })),
    };
  });
