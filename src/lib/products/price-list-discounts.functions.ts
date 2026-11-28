import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  validateDiscountRuleInput,
  type DraftDiscountRule,
} from "@/lib/products/price-list-discounts";

export type ManagedDiscountRule = DraftDiscountRule & {
  price_list_id: string;
  product_name: string;
  product_code: string | null;
};

/** Return the complete manageable set, or an explicit truncation error. */
export const listManagedDiscountRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; priceListId: string }) => ({
    companyId: assertUuid(input.companyId),
    priceListId: assertUuid(input.priceListId),
  }))
  .handler(async ({ data, context }): Promise<ManagedDiscountRule[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const {
      data: rows,
      error,
      count,
    } = await context.supabase
      .from("product_price_list_discount_rules" as never)
      .select(
        "id, price_list_id, product_id, min_quantity, effective_from, effective_to, discount_bps" as never,
        { count: "exact" },
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("price_list_id" as never, data.priceListId as never)
      .order("min_quantity" as never, { ascending: false })
      .limit(501);
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 500 || (rows ?? []).length > 500) {
      throw new Error("More than 500 discount rules; pagination is required");
    }
    const raw = (rows ?? []) as Array<{
      id: string;
      price_list_id: string;
      product_id: string;
      min_quantity: string | number;
      effective_from: string;
      effective_to: string | null;
      discount_bps: number;
    }>;
    if (!raw.length) return [];
    const { data: products, error: productsError } = await context.supabase
      .from("products" as never)
      .select("id, name, code" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, [...new Set(raw.map((r) => r.product_id))] as never);
    if (productsError) throw new Error(productsError.message);
    const productNames = new Map(
      ((products ?? []) as Array<{ id: string; name: string; code: string | null }>).map((p) => [
        p.id,
        p,
      ]),
    );
    return raw.map((rule) => {
      const checked = validateDiscountRuleInput({
        minQuantity: String(rule.min_quantity),
        effectiveFrom: rule.effective_from,
        effectiveTo: rule.effective_to,
        discountBps: rule.discount_bps,
      });
      return {
        id: rule.id,
        price_list_id: rule.price_list_id,
        product_id: rule.product_id,
        min_quantity: checked.minQuantity,
        effective_from: checked.effectiveFrom,
        effective_to: checked.effectiveTo,
        discount_bps: checked.discountBps,
        product_name: productNames.get(rule.product_id)?.name ?? "Unavailable product",
        product_code: productNames.get(rule.product_id)?.code ?? null,
      };
    });
  });

export const saveManagedDiscountRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      priceListId: string;
      productId: string;
      id?: string;
      minQuantity: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      discountBps: number;
    }) => ({
      companyId: assertUuid(input.companyId),
      priceListId: assertUuid(input.priceListId),
      productId: assertUuid(input.productId),
      id: input.id ? assertUuid(input.id) : null,
      rule: validateDiscountRuleInput(input),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const [listResult, productResult, companyResult] = await Promise.all([
      context.supabase
        .from("product_price_lists" as never)
        .select("id, currency_code, is_active" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, data.priceListId as never)
        .maybeSingle(),
      context.supabase
        .from("products" as never)
        .select("id, is_active" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, data.productId as never)
        .maybeSingle(),
      context.supabase
        .from("companies" as never)
        .select("base_currency" as never)
        .eq("id" as never, data.companyId as never)
        .single(),
    ]);
    if (listResult.error) throw new Error(listResult.error.message);
    if (productResult.error) throw new Error(productResult.error.message);
    if (companyResult.error) throw new Error(companyResult.error.message);
    const list = listResult.data as { currency_code: string; is_active: boolean } | null;
    const product = productResult.data as { is_active: boolean } | null;
    if (!list?.is_active) throw new Error("Choose an active price list in this organisation");
    if (!product?.is_active) throw new Error("Choose an active product in this organisation");
    if (list.currency_code !== (companyResult.data as { base_currency: string }).base_currency) {
      throw new Error("Price list currency does not match this organisation");
    }
    const payload = {
      product_id: data.productId,
      min_quantity: data.rule.minQuantity,
      effective_from: data.rule.effectiveFrom,
      effective_to: data.rule.effectiveTo,
      discount_bps: data.rule.discountBps,
      updated_at: new Date().toISOString(),
    };
    const table = context.supabase.from("product_price_list_discount_rules" as never);
    if (data.id) {
      const { data: saved, error } = await table
        .update(payload as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("price_list_id" as never, data.priceListId as never)
        .eq("id" as never, data.id as never)
        .select("id" as never)
        .maybeSingle();
      if (error)
        throw new Error(
          error.code === "23505"
            ? "Another discount rule already uses this product, threshold and start date"
            : error.message,
        );
      if (!saved) throw new Error("Discount rule no longer exists in this list");
      return { id: (saved as { id: string }).id };
    }
    const { data: saved, error } = await table
      .insert({
        company_id: data.companyId,
        price_list_id: data.priceListId,
        ...payload,
      } as never)
      .select("id" as never)
      .single();
    if (error)
      throw new Error(
        error.code === "23505"
          ? "Another discount rule already uses this product, threshold and start date"
          : error.message,
      );
    return { id: (saved as { id: string }).id };
  });

export const deleteManagedDiscountRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; priceListId: string; ruleId: string }) => ({
    companyId: assertUuid(input.companyId),
    priceListId: assertUuid(input.priceListId),
    ruleId: assertUuid(input.ruleId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const { data: removed, error } = await context.supabase
      .from("product_price_list_discount_rules" as never)
      .delete()
      .eq("company_id" as never, data.companyId as never)
      .eq("price_list_id" as never, data.priceListId as never)
      .eq("id" as never, data.ruleId as never)
      .select("id" as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!removed) throw new Error("Discount rule no longer exists");
    return { deleted: true };
  });
