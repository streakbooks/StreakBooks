import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
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
