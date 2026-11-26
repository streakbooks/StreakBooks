import { assertUuid } from "@/lib/company-validation";
import { buildIlikeOr } from "@/lib/purchases/search-terms";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { loadTaxTreatment } from "@/lib/sales/sales-common";
import {
  buildPosCatalogueQuote,
  parsePosQuote,
  type PosCatalogueItem,
  type PosQuoteInput,
} from "./catalogue-quote";

/** Read-only catalogue preview; never posts, accepts a payment or claims stock availability. */
export const previewPosCatalogueCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PosQuoteInput) => parsePosQuote(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.view");
    const { data: company, error: companyError } = await context.supabase
      .from("companies")
      .select("base_currency")
      .eq("id", data.companyId)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (!company?.base_currency) throw new Error("Company currency is unavailable");
    const treatment = await loadTaxTreatment(context.supabase, data.companyId);
    const { data: products, error } = await context.supabase
      .from("products" as never)
      .select(
        "id, company_id, name, code, unit, is_active, sales_price_minor, sales_tax_rate_bps" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("is_active" as never, true as never)
      .in("id" as never, [...new Set(data.lines.map((line) => line.productId))] as never)
      .limit(100);
    if (error) throw new Error(error.message);
    return buildPosCatalogueQuote(
      data,
      (products ?? []) as PosCatalogueItem[],
      company.base_currency,
      treatment,
    );
  });

/** Bounded, tenant-scoped lookup without exposing purchase costs to a cashier. */
export const searchPosCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; q?: string }) => ({
    companyId: assertUuid(input?.companyId),
    q: typeof input.q === "string" ? input.q.trim().slice(0, 100) : "",
  }))
  .handler(async ({ data, context }): Promise<PosCatalogueItem[]> => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.view");
    let query = context.supabase
      .from("products" as never)
      .select(
        "id, company_id, name, code, unit, is_active, sales_price_minor, sales_tax_rate_bps" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("is_active" as never, true as never);
    const search = buildIlikeOr(["name", "code"], data.q);
    if (search) query = query.or(search as never);
    const { data: rows, error } = await query
      .order("name" as never)
      .order("id" as never)
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as PosCatalogueItem[];
  });
