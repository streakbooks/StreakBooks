import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import { loadAccountMetas, type Sb } from "@/lib/accounting/ledger-data";
import { fiscalMonthStarts } from "@/lib/budgets/budget-math";
import { validateBudgetAllocations, type AllocationCell } from "@/lib/budgets/budget-dimensions";
import { callRpc, companyIdOf, isMissingRelation, num } from "@/lib/planning/rpc";

export type BudgetDimCategory = {
  id: string;
  name: string;
  dimension_kind: "class" | "department" | "location";
  is_active: boolean;
};
export type BudgetDimOption = {
  id: string;
  category_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
};
export type BudgetDimAccount = {
  id: string;
  code: string;
  name: string;
  kind: "income" | "expense";
  is_active: boolean;
  is_postable: boolean;
};
export type BudgetDimRevision = {
  id: string;
  category_id: string;
  version: number;
  line_count: number;
  recorded_at: string;
};
export type BudgetDimensionData = {
  available: boolean;
  updatedAt: string;
  months: string[];
  currency: string;
  categories: BudgetDimCategory[];
  options: BudgetDimOption[];
  accounts: BudgetDimAccount[];
  base: Array<{ accountId: string; month: string; amountMinor: number }>;
  lines: AllocationCell[];
  revisions: BudgetDimRevision[];
};

const MIGRATION = "Dimension budgets require migration 20261106204000_budget_dimension_allocations.sql.";

export const getBudgetDimensionAllocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; budgetId: string }) => ({
    companyId: companyIdOf(input),
    budgetId: assertUuid(input?.budgetId, "budget"),
  }))
  .handler(async ({ data, context }): Promise<BudgetDimensionData> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const { data: budget, error: headError } = await sb
      .from("budgets" as never)
      .select("id,fiscal_year_start,updated_at" as never)
      .eq("id" as never, data.budgetId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (headError) throw new Error(headError.message);
    if (!budget) throw new Error("Budget not found.");
    const head = budget as unknown as {
      fiscal_year_start: string;
      updated_at: string;
    };
    const months = fiscalMonthStarts(head.fiscal_year_start);
    const placeholder: BudgetDimensionData = {
      available: false,
      updatedAt: head.updated_at,
      months,
      currency: "",
      categories: [],
      options: [],
      accounts: [],
      base: [],
      lines: [],
      revisions: [],
    };

    const probe = await sb
      .from("budget_dimension_lines" as never)
      .select("id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("budget_id" as never, data.budgetId as never)
      .limit(1);
    if (probe.error) {
      if (isMissingRelation(probe.error)) return placeholder;
      throw new Error(probe.error.message);
    }

    type Line = {
      option_id: string;
      account_id: string;
      period_month: string;
      amount_minor: number | string;
    };
    type Base = {
      account_id: string;
      period_month: string;
      amount_minor: number | string;
    };

    const [categories, options, lines, base, revisions, accounts, company] = await Promise.all([
      fetchAllPages<BudgetDimCategory>((from, to) =>
        sb.from("tracking_categories" as never)
          .select("id,name,dimension_kind,is_active" as never)
          .eq("company_id" as never, data.companyId as never)
          .in("dimension_kind" as never, ["class", "department", "location"] as never)
          .order("id" as never).range(from,to) as unknown as PromiseLike<PageResult<BudgetDimCategory>>),
      fetchAllPages<BudgetDimOption>((from, to) =>
        sb.from("tracking_options" as never)
          .select("id,category_id,name,code,is_active" as never)
          .eq("company_id" as never, data.companyId as never)
          .order("id" as never).range(from,to) as unknown as PromiseLike<PageResult<BudgetDimOption>>),
      fetchAllPages<Line>((from, to) =>
        sb.from("budget_dimension_lines" as never)
          .select("option_id,account_id,period_month,amount_minor" as never)
          .eq("company_id" as never, data.companyId as never)
          .eq("budget_id" as never, data.budgetId as never)
          .order("id" as never).range(from,to) as unknown as PromiseLike<PageResult<Line>>),
      fetchAllPages<Base>((from, to) =>
        sb.from("budget_lines" as never)
          .select("account_id,period_month,amount_minor" as never)
          .eq("company_id" as never, data.companyId as never)
          .eq("budget_id" as never, data.budgetId as never)
          .order("id" as never).range(from,to) as unknown as PromiseLike<PageResult<Base>>),
      sb.from("budget_dimension_revisions" as never)
        .select("id,category_id,version,line_count,recorded_at" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("budget_id" as never, data.budgetId as never)
        .order("recorded_at" as never, {ascending:false} as never)
        .limit(200),
      loadAccountMetas(sb, data.companyId),
      sb.from("companies" as never)
        .select("base_currency" as never)
        .eq("id" as never, data.companyId as never)
        .maybeSingle(),
    ]);
    if (revisions.error) throw new Error(revisions.error.message);
    if (company.error) throw new Error(company.error.message);
    return {
      available: true,
      updatedAt: head.updated_at,
      months,
      currency: (company.data as unknown as {base_currency:string})?.base_currency ?? "",
      categories,
      options,
      accounts: accounts.filter(a=>a.account_type==="income"||a.account_type==="expense")
        .map(a=>({
          id:a.id, code:a.code, name:a.name,
          kind:a.account_type as "income"|"expense",
          is_active:a.is_active,is_postable:a.is_postable,
        })),
      base: base.map(b=>({
        accountId:b.account_id,month:b.period_month,amountMinor:num(b.amount_minor),
      })),
      lines: lines.map(l=>({
        optionId:l.option_id,accountId:l.account_id,
        month:l.period_month,amountMinor:num(l.amount_minor),
      })),
      revisions:(revisions.data??[]) as unknown as BudgetDimRevision[],
    };
  });

export const saveBudgetDimensionAllocations = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId:string;
    budgetId:string;
    categoryId:string;
    expectedUpdatedAt:string;
    rows:AllocationCell[];
  })=>{
    if(typeof input.expectedUpdatedAt!=="string"||
       !/^\d{4}-\d{2}-\d{2}T/.test(input.expectedUpdatedAt)||
       !Number.isFinite(Date.parse(input.expectedUpdatedAt))){
      throw new Error("Reload the budget to obtain its current version.");
    }
    if(!Array.isArray(input.rows)||input.rows.length>5000)
      throw new Error("Too many allocation cells.");
    return {
      companyId:companyIdOf(input),
      budgetId:assertUuid(input.budgetId,"budget"),
      categoryId:assertUuid(input.categoryId,"category"),
      expectedUpdatedAt:input.expectedUpdatedAt,
      rows:input.rows.map(row=>({
        optionId:assertUuid(row.optionId,"option"),
        accountId:assertUuid(row.accountId,"account"),
        month:row.month,
        amountMinor:row.amountMinor,
      })),
    };
  })
  .handler(async({data,context})=>{
    await assertCompanyPermission(context.supabase,data.companyId,"accounts.manage");
    const sb=context.supabase as unknown as Sb;
    const [{data:head,error:headErr},baseRows]=await Promise.all([
      sb.from("budgets" as never)
        .select("fiscal_year_start" as never)
        .eq("id" as never,data.budgetId as never)
        .eq("company_id" as never,data.companyId as never)
        .maybeSingle(),
      fetchAllPages<{
        account_id:string;period_month:string;amount_minor:number;
      }>((from,to)=>
        sb.from("budget_lines" as never)
          .select("account_id,period_month,amount_minor" as never)
          .eq("budget_id" as never,data.budgetId as never)
          .eq("company_id" as never,data.companyId as never)
          .order("id" as never).range(from,to) as unknown as PromiseLike<
            PageResult<{account_id:string;period_month:string;amount_minor:number}>
          >
      ),
    ]);
    if(headErr)throw new Error(headErr.message);
    if(!head)throw new Error("Budget not found.");
    // Client-side validation is a fast UX guard. The SQL RPC validates again under
    // a header row lock, preventing cross-tenant, stale or concurrent writes.
    const checked=validateBudgetAllocations({
      rows:data.rows,
      base:((baseRows??[]) as Array<{
        account_id:string;period_month:string;amount_minor:number;
      }>).map(r=>({
        accountId:r.account_id,month:r.period_month,amountMinor:num(r.amount_minor),
      })),
      months:fiscalMonthStarts((head as unknown as {fiscal_year_start:string}).fiscal_year_start),
    });
    const result=await callRpc<{stored:number;version:number;updated_at:string}>(
      sb,"save_budget_dimension_category",{
        _company_id:data.companyId,
        _budget_id:data.budgetId,
        _category_id:data.categoryId,
        _expected_updated_at:data.expectedUpdatedAt,
        _lines:checked.rows.map(row=>({
          option_id:row.optionId,account_id:row.accountId,
          period_month:row.month,amount_minor:row.amountMinor,
        })),
      },MIGRATION
    );
    return {stored:num(result.stored),version:num(result.version),updatedAt:result.updated_at};
  });
