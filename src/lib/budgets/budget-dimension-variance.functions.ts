import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { monthStart } from "@/lib/accounting/fiscal-year";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import {
  loadAccountMetas,
  loadCompanyMeta,
  loadPostedLines,
  type Sb,
} from "@/lib/accounting/ledger-data";
import {
  buildDimensionVariance,
  eligibleDimensionActualLines,
  batchPostedLineIds,
  resolveDimensionActualCutoff,
  type DimensionActualAccount,
  type DimensionActualOption,
  type DimensionBudgetAmount,
  type DimensionPostedActivity,
} from "@/lib/budgets/budget-dimension-variance";
import { fiscalMonthStarts } from "@/lib/budgets/budget-math";
import { assertUuid } from "@/lib/company-validation";
import { companyIdOf, isoDate } from "@/lib/planning/rpc";

/**
 * Posted-journal accrual basis only, company base currency.
 *
 * Tracking attribution: explicit journal_line rows for this category. Document-level
 * tags are NOT silently assumed to apply to every line; revenue/tax/AP lines must not
 * be attributed without a verified per-line mapping. All other P&L lines appear in
 * a separate unassigned summary for auditability.
 *
 * Pages the complete result set rather than truncating a tenant's accounting data.
 */
export const getBudgetDimensionVariance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; budgetId: string; categoryId: string; through?: string }) => ({
      companyId: companyIdOf(input),
      budgetId: assertUuid(input?.budgetId, "budget"),
      categoryId: assertUuid(input?.categoryId, "category"),
      through: input.through ? isoDate(input.through, "As of") : undefined,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const sb = context.supabase as unknown as Sb;
    const [meta, budgetResult, categoryResult, metas] = await Promise.all([
      loadCompanyMeta(sb, data.companyId),
      sb
        .from("budgets" as never)
        .select("id,name,fiscal_year_start" as never)
        .eq("id" as never, data.budgetId as never)
        .eq("company_id" as never, data.companyId as never)
        .maybeSingle(),
      sb
        .from("tracking_categories" as never)
        .select("id,name,dimension_kind" as never)
        .eq("id" as never, data.categoryId as never)
        .eq("company_id" as never, data.companyId as never)
        .maybeSingle(),
      loadAccountMetas(sb, data.companyId),
    ]);
    if (budgetResult.error) throw new Error(budgetResult.error.message);
    if (categoryResult.error) throw new Error(categoryResult.error.message);
    if (!budgetResult.data) throw new Error("Budget not found in this organisation.");
    const category = categoryResult.data as unknown as {
      id: string;
      name: string;
      dimension_kind: string;
    } | null;
    if (!category || !["class", "department", "location"].includes(category.dimension_kind)) {
      throw new Error("Tracking category is unavailable.");
    }

    const budget = budgetResult.data as unknown as {
      id: string;
      name: string;
      fiscal_year_start: string;
    };
    const start = monthStart(budget.fiscal_year_start);
    const today = new Date().toISOString().slice(0, 10);
    const { through, partialMonth } = resolveDimensionActualCutoff(start, today, data.through);
    const months = fiscalMonthStarts(start).filter((month) => month <= through);
    const accounts: DimensionActualAccount[] = metas
      .filter((m) => m.account_type === "income" || m.account_type === "expense")
      .map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        kind: m.account_type as "income" | "expense",
      }));
    const incomeExpenseIds = accounts.map((a) => a.id);

    type RawBudget = {
      option_id: string;
      account_id: string;
      period_month: string;
      amount_minor: number | string;
    };
    type RawOption = { id: string; name: string; code: string | null };
    type Tag = { line_id: string; option_id: string };

    const [budgetRows, options, posted] = await Promise.all([
      fetchAllPages<RawBudget>(
        (from, to) =>
          sb
            .from("budget_dimension_lines" as never)
            .select("option_id,account_id,period_month,amount_minor" as never)
            .eq("company_id" as never, data.companyId as never)
            .eq("budget_id" as never, data.budgetId as never)
            .eq("category_id" as never, data.categoryId as never)
            .order("id" as never)
            .range(from, to) as unknown as PromiseLike<PageResult<RawBudget>>,
      ),
      fetchAllPages<RawOption>(
        (from, to) =>
          sb
            .from("tracking_options" as never)
            .select("id,name,code" as never)
            .eq("company_id" as never, data.companyId as never)
            .eq("category_id" as never, data.categoryId as never)
            .order("id" as never)
            .range(from, to) as unknown as PromiseLike<PageResult<RawOption>>,
      ),
      months.length === 0 || incomeExpenseIds.length === 0
        ? Promise.resolve([])
        : loadPostedLines(sb, data.companyId, meta.baseCurrency, {
            from: start,
            to: through,
            accountIds: incomeExpenseIds,
          }),
    ]);

    // A category query must never scan every historic journal assignment in
    // the organisation. Exclude closing entries before choosing relevant IDs.
    const includedPosted = eligibleDimensionActualLines(posted);
    const tags: Tag[] = [];
    for (const ids of batchPostedLineIds(includedPosted)) {
      const batch = await fetchAllPages<Tag>(
        (from, to) =>
          sb
            .from("line_tracking_assignments" as never)
            .select("line_id,option_id" as never)
            .eq("company_id" as never, data.companyId as never)
            .eq("category_id" as never, data.categoryId as never)
            .eq("entity_type" as never, "journal_line" as never)
            .in("line_id" as never, ids as never)
            .order("id" as never)
            .range(from, to) as unknown as PromiseLike<PageResult<Tag>>,
      );
      tags.push(...batch);
    }
    const taggedOption = new Map<string, string>();
    for (const tag of tags) {
      if (taggedOption.has(tag.line_id)) {
        throw new Error("Journal line has conflicting tracking assignments for this category.");
      }
      taggedOption.set(tag.line_id, tag.option_id);
    }
    const exactMinor = (input: number | string | bigint, field: string): number => {
      if (typeof input === "number" && !Number.isSafeInteger(input)) {
        throw new Error(`${field} exceeds safe currency precision.`);
      }
      if (typeof input === "string" && !/^-?\d+$/.test(input)) {
        throw new Error(`${field} must be an integer amount.`);
      }
      const value = BigInt(input);
      const asNumber = Number(value);
      if (!Number.isSafeInteger(asNumber)) {
        throw new Error(`${field} exceeds safe currency precision.`);
      }
      return asNumber;
    };
    const mappedBudget: DimensionBudgetAmount[] = budgetRows.map((row) => ({
      optionId: row.option_id,
      accountId: row.account_id,
      month: row.period_month,
      amountMinor: exactMinor(row.amount_minor, "Budget allocation"),
    }));
    const mappedActual: DimensionPostedActivity[] = includedPosted.map((line) => {
      if (!line.line_id) throw new Error("Posted journal line identity is missing.");
      return {
        lineId: line.line_id,
        optionId: taggedOption.get(line.line_id) ?? null,
        accountId: line.account_id,
        month: `${line.journal_date.slice(0, 7)}-01`,
        debitMinor: exactMinor(line.debit_minor, "Posted debit"),
        creditMinor: exactMinor(line.credit_minor, "Posted credit"),
      };
    });
    const report = buildDimensionVariance({
      months,
      accounts,
      options: options as DimensionActualOption[],
      budget: mappedBudget,
      actual: mappedActual,
    });
    return {
      categoryId: data.categoryId,
      categoryName: category.name,
      categoryKind: category.dimension_kind,
      budgetId: budget.id,
      budgetName: budget.name,
      fiscalStart: start,
      through,
      partialMonth,
      currency: meta.baseCurrency,
      basis: "accrual" as const,
      attribution: "journal_line" as const,
      report,
    };
  });
