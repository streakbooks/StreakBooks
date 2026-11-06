import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { validateRuleInput, type DraftTierPriceRule } from "@/lib/products/price-list-tiers";
import { validateDiscountRuleInput, type DraftDiscountRule } from "@/lib/products/price-list-discounts";
import {
  assertMatchingCatalogueCurrency,
  validateCatalogueName,
  validateCatalogueDescription,
  validateCataloguePriceMinor,
} from "@/lib/products/catalogue-masterdata-rules";

export type ProductCategory = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
};
export type ProductPriceList = {
  id: string;
  name: string;
  description: string;
  currency_code: string;
  is_active: boolean;
};
export type PriceListItem = {
  id: string;
  product_id: string;
  unit_price_minor: number;
  product_name: string;
  product_code: string | null;
  base_price_minor: number;
};

function uniqueNameError(error: { code?: string | null; message: string }) {
  return error.code === "23505"
    ? "Another category or price list already uses this name in this organisation"
    : error.message;
}

export const listProductCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }): Promise<ProductCategory[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase
      .from("product_categories" as never)
      .select("id, name, description, is_active" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("name" as never)
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProductCategory[];
  });

export const saveProductCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string; id?: string; name: string; description?: string; isActive?: boolean;
  }) => ({
    companyId: assertUuid(input.companyId),
    id: input.id ? assertUuid(input.id) : null,
    name: validateCatalogueName(input.name),
    description: validateCatalogueDescription(input.description),
    isActive: input.isActive !== false,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const payload = {
      name: data.name, description: data.description, is_active: data.isActive,
      updated_at: new Date().toISOString(),
    };
    const query = context.supabase.from("product_categories" as never);
    if (data.id) {
      const { data: saved, error } = await query
        .update(payload as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, data.id as never)
        .select("id" as never)
        .single();
      if (error) throw new Error(uniqueNameError(error));
      return { id: (saved as { id: string }).id };
    }
    const { data: saved, error } = await query
      .insert({ company_id: data.companyId, ...payload } as never)
      .select("id" as never).single();
    if (error) throw new Error(uniqueNameError(error));
    return { id: (saved as { id: string }).id };
  });

export const listProductPriceLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }): Promise<ProductPriceList[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase
      .from("product_price_lists" as never)
      .select("id, name, description, currency_code, is_active" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("name" as never)
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProductPriceList[];
  });

export const saveProductPriceList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string; id?: string; name: string; description?: string; isActive?: boolean;
  }) => ({
    companyId: assertUuid(input.companyId),
    id: input.id ? assertUuid(input.id) : null,
    name: validateCatalogueName(input.name),
    description: validateCatalogueDescription(input.description),
    isActive: input.isActive !== false,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const { data: org, error: orgError } = await context.supabase
      .from("companies" as never)
      .select("base_currency" as never)
      .eq("id" as never, data.companyId as never)
      .single();
    if (orgError) throw new Error(orgError.message);
    const currency = (org as { base_currency: string }).base_currency;
    const payload = {
      name: data.name, description: data.description, is_active: data.isActive,
      updated_at: new Date().toISOString(),
    };
    const query = context.supabase.from("product_price_lists" as never);
    if (data.id) {
      const { data: saved, error } = await query.update(payload as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, data.id as never)
        .select("id" as never).single();
      if (error) throw new Error(uniqueNameError(error));
      return { id: (saved as { id: string }).id };
    }
    const { data: saved, error } = await query.insert({
      company_id: data.companyId, currency_code: currency, ...payload,
    } as never).select("id" as never).single();
    if (error) throw new Error(uniqueNameError(error));
    return { id: (saved as { id: string }).id };
  });

export const listProductPriceOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; priceListId: string }) => ({
    companyId: assertUuid(input.companyId),
    priceListId: assertUuid(input.priceListId),
  }))
  .handler(async ({ data, context }): Promise<PriceListItem[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase
      .from("product_price_list_items" as never)
      .select("id, product_id, unit_price_minor" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("price_list_id" as never, data.priceListId as never)
      .order("created_at" as never)
      .limit(500);
    if (error) throw new Error(error.message);
    const overrides = (rows ?? []) as Array<{
      id: string; product_id: string; unit_price_minor: number;
    }>;
    if (!overrides.length) return [];
    const { data: products, error: productsError } = await context.supabase
      .from("products" as never)
      .select("id, name, code, sales_price_minor" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, overrides.map((item) => item.product_id) as never);
    if (productsError) throw new Error(productsError.message);
    const productsById = new Map(
      ((products ?? []) as Array<{
        id: string; name: string; code: string | null; sales_price_minor: number;
      }>).map((product) => [product.id, product]),
    );
    return overrides.map((item) => {
      const product = productsById.get(item.product_id);
      return {
        ...item,
        product_name: product?.name ?? "Unavailable item",
        product_code: product?.code ?? null,
        base_price_minor: product?.sales_price_minor ?? 0,
      };
    });
  });

export const saveProductPriceOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string; priceListId: string; productId: string; unitPriceMinor: number;
  }) => {
    return {
      companyId: assertUuid(input.companyId),
      priceListId: assertUuid(input.priceListId),
      productId: assertUuid(input.productId),
      unitPriceMinor: validateCataloguePriceMinor(input.unitPriceMinor),
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const [list, product] = await Promise.all([
      context.supabase.from("product_price_lists" as never)
        .select("id, currency_code, is_active" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, data.priceListId as never).maybeSingle(),
      context.supabase.from("products" as never)
        .select("id, is_active" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, data.productId as never).maybeSingle(),
    ]);
    if (list.error) throw new Error(list.error.message);
    if (product.error) throw new Error(product.error.message);
    if (!list.data || !(list.data as { is_active: boolean }).is_active) {
      throw new Error("Select an active price list in this organisation");
    }
    if (!product.data || !(product.data as { is_active: boolean }).is_active) {
      throw new Error("Select an active catalogue item in this organisation");
    }
    const { data: company, error: companyError } = await context.supabase
      .from("companies" as never)
      .select("base_currency" as never)
      .eq("id" as never, data.companyId as never)
      .single();
    if (companyError) throw new Error(companyError.message);
    assertMatchingCatalogueCurrency(
      (list.data as { currency_code: string }).currency_code,
      (company as { base_currency: string }).base_currency,
    );
    const { data: saved, error } = await context.supabase
      .from("product_price_list_items" as never)
      .upsert({
        company_id: data.companyId, price_list_id: data.priceListId,
        product_id: data.productId, unit_price_minor: data.unitPriceMinor,
        updated_at: new Date().toISOString(),
      } as never, { onConflict: "price_list_id,product_id" })
      .select("id" as never).single();
    if (error) throw new Error(error.message);
    return { id: (saved as { id: string }).id };
  });

export const deleteProductPriceOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; priceListItemId: string }) => ({
    companyId: assertUuid(input.companyId),
    priceListItemId: assertUuid(input.priceListItemId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const { data: deleted, error } = await context.supabase
      .from("product_price_list_items" as never)
      .delete()
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.priceListItemId as never)
      .select("id" as never).maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error("Price override no longer exists");
    return { ok: true };
  });

/**
 * Resolve exact sales-price overrides only for products used by an invoice/quote editor.
 * This is read-only; the sales document still saves each unit price as a line snapshot.
 */
export const resolveSalesDraftPriceList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    priceListId: string;
    documentCurrency: string;
    productIds: string[];
  }) => {
    if (!Array.isArray(input.productIds) || input.productIds.length > 250) {
      throw new Error("Too many products for one price-list lookup");
    }
    if (typeof input.documentCurrency !== "string" ||
      !/^[A-Z]{3}$/.test(input.documentCurrency)) {
      throw new Error("Invalid document currency");
    }
    return {
      companyId: assertUuid(input.companyId),
      priceListId: assertUuid(input.priceListId),
      documentCurrency: input.documentCurrency,
      productIds: [...new Set(input.productIds.map((id) => assertUuid(id, "product")))],
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: list, error: listError } = await context.supabase
      .from("product_price_lists" as never)
      .select("id, currency_code, is_active" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.priceListId as never)
      .maybeSingle();
    if (listError) throw new Error(listError.message);
    if (!list || !(list as { is_active: boolean }).is_active) {
      throw new Error("The selected price list is archived or unavailable");
    }
    assertMatchingCatalogueCurrency(
      (list as { currency_code: string }).currency_code,
      data.documentCurrency,
    );
    if (!data.productIds.length) {
      return {
        currency: data.documentCurrency,
        items: [] as Array<{ product_id: string; unit_price_minor: number }>,
        rules: [] as DraftTierPriceRule[],
        discounts: [] as DraftDiscountRule[],
        basePrices: [] as Array<{ product_id: string; unit_price_minor: number }>,
      };
    }
    const { data: rows, error } = await context.supabase
      .from("product_price_list_items" as never)
      .select("product_id, unit_price_minor" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("price_list_id" as never, data.priceListId as never)
      .in("product_id" as never, data.productIds as never)
      .limit(250);
    if (error) throw new Error(error.message);
    const items = (rows ?? []) as Array<{ product_id: string; unit_price_minor: number }>;
    for (const item of items) validateCataloguePriceMinor(item.unit_price_minor);

    // The query deliberately fetches ALL candidate rules for these products.
    // Filtering by quantity and document date is performed for each draft line.
    const { data: tiers, error: tiersError, count: tierCount } = await context.supabase
      .from("product_price_list_rules" as never)
      .select(
        "id, product_id, min_quantity, effective_from, effective_to, unit_price_minor" as never,
        { count: "exact" },
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("price_list_id" as never, data.priceListId as never)
      .in("product_id" as never, data.productIds as never)
      .limit(1001);
    if (tiersError) throw new Error(tiersError.message);
    if ((tierCount ?? 0) > 1000 || (tiers ?? []).length > 1000) {
      throw new Error("The selected price list has too many matching rules (maximum 1,000)");
    }
    const rules: DraftTierPriceRule[] = ((tiers ?? []) as Array<{
      id: string; product_id: string; min_quantity: string | number;
      effective_from: string; effective_to: string | null; unit_price_minor: number;
    }>).map((r) => {
      const checked = validateRuleInput({
        minQuantity: String(r.min_quantity),
        effectiveFrom: r.effective_from,
        effectiveTo: r.effective_to,
        unitPriceMinor: r.unit_price_minor,
      });
      return {
        id: r.id, product_id: r.product_id,
        min_quantity: checked.minQuantity,
        effective_from: checked.effectiveFrom,
        effective_to: checked.effectiveTo,
        unit_price_minor: checked.unitPriceMinor,
      };
    });
    const { data: discountsRaw, error: discountError, count: discountCount } =
      await context.supabase.from("product_price_list_discount_rules" as never)
        .select(
          "id, product_id, min_quantity, effective_from, effective_to, discount_bps" as never,
          { count: "exact" },
        )
        .eq("company_id" as never, data.companyId as never)
        .eq("price_list_id" as never, data.priceListId as never)
        .in("product_id" as never, data.productIds as never)
        .limit(1001);
    if (discountError) throw new Error(discountError.message);
    if ((discountCount ?? 0) > 1000 || (discountsRaw ?? []).length > 1000) {
      throw new Error("The selected list has too many matching discount rules (maximum 1,000)");
    }
    const discounts: DraftDiscountRule[] = ((discountsRaw ?? []) as Array<{
      id: string; product_id: string; min_quantity: string | number;
      effective_from: string; effective_to: string | null; discount_bps: number;
    }>).map((r) => {
      const checked = validateDiscountRuleInput({
        minQuantity: String(r.min_quantity),
        effectiveFrom: r.effective_from,
        effectiveTo: r.effective_to,
        discountBps: r.discount_bps,
      });
      return {
        id: r.id, product_id: r.product_id,
        min_quantity: checked.minQuantity,
        effective_from: checked.effectiveFrom,
        effective_to: checked.effectiveTo,
        discount_bps: checked.discountBps,
      };
    });

    // Needed to preview percentage-only discounts on existing invoice/quote lines,
    // including products beyond the editor's first-page catalogue list.
    const { data: catalogue, error: catalogueError } = await context.supabase
      .from("products" as never)
      .select("id, sales_price_minor" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, data.productIds as never)
      .limit(250);
    if (catalogueError) throw new Error(catalogueError.message);
    const basePrices = ((catalogue ?? []) as Array<{
      id: string; sales_price_minor: number;
    }>).map((p) => {
      validateCataloguePriceMinor(p.sales_price_minor);
      return { product_id: p.id, unit_price_minor: p.sales_price_minor };
    });
    return { currency: data.documentCurrency, items, rules, discounts, basePrices };
  });
