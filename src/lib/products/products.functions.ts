import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { productAccountProblem } from "@/lib/products/product-rules";
import { productSkuProblem } from "@/lib/products/catalogue-input";
import { normaliseBulkPriceChange, type BulkPriceField } from "@/lib/products/bulk-price-rules";
import { productsToCsv, type CatalogueCsvItem } from "@/lib/products/catalogue-csv";
import { buildIlikeOr } from "@/lib/purchases/search-terms";

export type ProductRow = {
  id: string;
  kind: string;
  code: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  sales_price_minor: number;
  purchase_cost_minor: number;
  income_account_id: string | null;
  expense_account_id: string | null;
  sales_tax_rate_bps: number;
  purchase_tax_rate_bps: number;
  unit: string;
  is_active: boolean;
  created_at: string;
};

function productWriteError(error: { code?: string | null; message: string }): string {
  return error.code === "23505" ? "Another item already uses this code" : error.message;
}

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      q?: string;
      kind?: string;
      includeInactive?: boolean;
      status?: string;
      sort?: string;
      limit?: number;
    }) => ({
      companyId: assertUuid(input.companyId),
      q: (input.q ?? "").trim().slice(0, 100),
      kind: (input.kind ?? "all").trim(),
      status: (() => {
        const status = input.status ?? (input.includeInactive ? "all" : "active");
        if (!["all", "active", "archived"].includes(status)) {
          throw new Error("Invalid catalogue status");
        }
        return status;
      })(),
      sort: (() => {
        const sort = input.sort ?? "name";
        if (!["name", "name_desc", "code", "price_asc", "price_desc", "recent"].includes(sort)) {
          throw new Error("Invalid catalogue sort");
        }
        return sort;
      })(),
      limit: Math.min(Math.max(Number(input.limit) || 100, 1), 500),
    }),
  )
  .handler(async ({ data, context }): Promise<ProductRow[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    let q = context.supabase
      .from("products" as never)
      .select(
        "id, kind, code, name, description, category_id, sales_price_minor, purchase_cost_minor, income_account_id, expense_account_id, sales_tax_rate_bps, purchase_tax_rate_bps, unit, is_active, created_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("is_active" as never, (data.status === "active") as never);
    if (data.kind !== "all") q = q.eq("kind" as never, data.kind as never);
    const search = buildIlikeOr(["name", "code", "description"], data.q);
    if (search) q = q.or(search as never);
    const order = {
      name: { column: "name", ascending: true },
      name_desc: { column: "name", ascending: false },
      code: { column: "code", ascending: true },
      price_asc: { column: "sales_price_minor", ascending: true },
      price_desc: { column: "sales_price_minor", ascending: false },
      recent: { column: "created_at", ascending: false },
    }[data.sort as "name" | "name_desc" | "code" | "price_asc" | "price_desc" | "recent"];
    q = q
      .order(order.column as never, { ascending: order.ascending, nullsFirst: false })
      .order("id" as never);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProductRow[];
  });

export type CatalogueSort = "name" | "name_desc" | "code" | "price_asc" | "price_desc" | "recent";
export type CatalogueFilters = {
  companyId: string;
  q?: string;
  kind?: string;
  status?: string;
  sort?: string;
  categoryId?: string;
};

function parseCatalogueFilters(input: CatalogueFilters) {
  const status = input.status ?? "active";
  const kind = input.kind ?? "all";
  const sort = input.sort ?? "name";
  if (!["active", "archived", "all"].includes(status)) throw new Error("Invalid catalogue status");
  if (!["all", "service", "product", "non_inventory"].includes(kind)) {
    throw new Error("Invalid catalogue kind");
  }
  if (!["name", "name_desc", "code", "price_asc", "price_desc", "recent"].includes(sort)) {
    throw new Error("Invalid catalogue sort");
  }
  return {
    companyId: assertUuid(input.companyId),
    categoryId: input.categoryId ? assertUuid(input.categoryId, "category") : null,
    q: (input.q ?? "").trim().slice(0, 100),
    kind,
    status,
    sort: sort as CatalogueSort,
  };
}

const CATALOGUE_SORT: Record<CatalogueSort, { column: string; ascending: boolean }> = {
  name: { column: "name", ascending: true },
  name_desc: { column: "name", ascending: false },
  code: { column: "code", ascending: true },
  price_asc: { column: "sales_price_minor", ascending: true },
  price_desc: { column: "sales_price_minor", ascending: false },
  recent: { column: "created_at", ascending: false },
};

const PRODUCT_COLUMNS =
  "id, kind, code, name, description, category_id, sales_price_minor, purchase_cost_minor, income_account_id, expense_account_id, sales_tax_rate_bps, purchase_tax_rate_bps, unit, is_active, created_at";

/** Count and page are calculated on the server with identical filters and a stable sort. */
export const listProductsPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CatalogueFilters & { page?: number; pageSize?: number }) => {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("Invalid page");
    if (![25, 50, 100].includes(pageSize)) throw new Error("Invalid page size");
    return { ...parseCatalogueFilters(input), page, pageSize };
  })
  .handler(async ({ data, context }): Promise<{ rows: ProductRow[]; total: number }> => {
    await assertCompanyMember(context.supabase, data.companyId);
    let query = context.supabase
      .from("products" as never)
      .select(PRODUCT_COLUMNS as never, { count: "exact" })
      .eq("company_id" as never, data.companyId as never);
    if (data.status !== "all") {
      query = query.eq("is_active" as never, (data.status === "active") as never);
    }
    if (data.kind !== "all") query = query.eq("kind" as never, data.kind as never);
    if (data.categoryId) query = query.eq("category_id" as never, data.categoryId as never);
    const search = buildIlikeOr(["name", "code", "description"], data.q);
    if (search) query = query.or(search as never);
    const order = CATALOGUE_SORT[data.sort];
    const offset = (data.page - 1) * data.pageSize;
    query = query
      .order(order.column as never, { ascending: order.ascending, nullsFirst: false })
      .order("id" as never)
      .range(offset, offset + data.pageSize - 1);
    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as ProductRow[], total: count ?? 0 };
  });

/**
 * Download the filtered catalogue, including archived rows when requested.
 * Hard cap guards browser memory and response size; no silent partial exports.
 */
export const exportProductsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CatalogueFilters) => parseCatalogueFilters(input))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: company, error: companyError } = await context.supabase
      .from("companies" as never)
      .select("base_currency" as never)
      .eq("id" as never, data.companyId as never)
      .single();
    if (companyError) throw new Error(companyError.message);
    const currency = (company as { base_currency: string } | null)?.base_currency;
    if (!currency) throw new Error("Organisation currency is missing");

    let counter = context.supabase
      .from("products" as never)
      .select("id" as never, { head: true, count: "exact" })
      .eq("company_id" as never, data.companyId as never);
    if (data.status !== "all") {
      counter = counter.eq("is_active" as never, (data.status === "active") as never);
    }
    if (data.kind !== "all") counter = counter.eq("kind" as never, data.kind as never);
    if (data.categoryId) counter = counter.eq("category_id" as never, data.categoryId as never);
    const search = buildIlikeOr(["name", "code", "description"], data.q);
    if (search) counter = counter.or(search as never);
    const { count, error: countError } = await counter;
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 5000) {
      throw new Error("Export supports up to 5,000 matching items; narrow your filters");
    }

    const collected: CatalogueCsvItem[] = [];
    const seenIds = new Set<string>();
    const order = CATALOGUE_SORT[data.sort];
    for (let offset = 0; offset < (count ?? 0); offset += 500) {
      let query = context.supabase
        .from("products" as never)
        .select(PRODUCT_COLUMNS as never)
        .eq("company_id" as never, data.companyId as never);
      if (data.status !== "all") {
        query = query.eq("is_active" as never, (data.status === "active") as never);
      }
      if (data.kind !== "all") query = query.eq("kind" as never, data.kind as never);
      if (data.categoryId) query = query.eq("category_id" as never, data.categoryId as never);
      if (search) query = query.or(search as never);
      query = query
        .order(order.column as never, { ascending: order.ascending, nullsFirst: false })
        .order("id" as never)
        .range(offset, offset + 499);
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      for (const row of (rows ?? []) as ProductRow[]) {
        if (seenIds.has(row.id)) throw new Error("Catalogue changed during export; try again");
        seenIds.add(row.id);
        collected.push(row);
      }
    }
    if (collected.length !== (count ?? 0)) {
      throw new Error("Catalogue changed during export; try again");
    }
    const csv = productsToCsv(collected, currency);
    if (new TextEncoder().encode(csv).byteLength > 5 * 1024 * 1024) {
      throw new Error("The CSV export exceeds 5 MB; narrow your filters");
    }
    return {
      csv,
      count: collected.length,
      currency,
      filename: `products-services-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  });

export const getProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; productId: string }) => ({
    companyId: assertUuid(input.companyId),
    productId: assertUuid(input.productId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: row, error } = await context.supabase
      .from("products" as never)
      .select("*" as never)
      .eq("id" as never, data.productId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Product not found");
    return row;
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      id?: string;
      kind: string;
      code?: string;
      name: string;
      description?: string;
      categoryId?: string | null;
      salesPriceMinor?: number;
      purchaseCostMinor?: number;
      incomeAccountId?: string;
      expenseAccountId?: string;
      salesTaxRateBps?: number;
      purchaseTaxRateBps?: number;
      unit?: string;
      isActive?: boolean;
    }) => {
      const name = (input.name ?? "").trim();
      if (!name) throw new Error("Name is required");
      const code = (input.code ?? "").trim();
      const skuProblem = productSkuProblem(code);
      if (skuProblem) throw new Error(skuProblem);
      if (!["service", "product", "non_inventory"].includes(input.kind)) {
        throw new Error("Invalid product kind");
      }
      // Reject invalid accounting inputs instead of silently changing amounts or tax rates.
      for (const [label, value] of [
        ["Sales price", input.salesPriceMinor],
        ["Purchase cost", input.purchaseCostMinor],
      ] as const) {
        if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
          throw new Error(`${label} must be a non-negative integer amount in minor currency units`);
        }
      }
      for (const [label, value] of [
        ["Sales tax", input.salesTaxRateBps],
        ["Purchase tax", input.purchaseTaxRateBps],
      ] as const) {
        if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 10000)) {
          throw new Error(`${label} rate must be between 0 and 10000 basis points`);
        }
      }
      return {
        companyId: assertUuid(input.companyId),
        id: input.id ? assertUuid(input.id) : undefined,
        kind: input.kind,
        code: code || null,
        name: name.slice(0, 200),
        description: (input.description ?? "").trim().slice(0, 2000) || null,
        categoryId: input.categoryId ? assertUuid(input.categoryId, "category") : null,
        salesPriceMinor: input.salesPriceMinor ?? 0,
        purchaseCostMinor: input.purchaseCostMinor ?? 0,
        incomeAccountId: input.incomeAccountId
          ? assertUuid(input.incomeAccountId, "income account")
          : null,
        expenseAccountId: input.expenseAccountId
          ? assertUuid(input.expenseAccountId, "expense account")
          : null,
        salesTaxRateBps: input.salesTaxRateBps ?? 0,
        purchaseTaxRateBps: input.purchaseTaxRateBps ?? 0,
        unit: ((input.unit ?? "each").trim() || "each").slice(0, 40),
        isActive: input.isActive !== false,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    for (const [role, accountId] of [
      ["income", data.incomeAccountId],
      ["expense", data.expenseAccountId],
    ] as const) {
      if (!accountId) continue;
      const { data: acct, error: acctErr } = await context.supabase
        .from("accounts" as never)
        .select("account_type, is_active, is_postable, archived_at" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, accountId as never)
        .maybeSingle();
      if (acctErr) throw new Error(acctErr.message);
      const a = acct as {
        account_type: string;
        is_active: boolean;
        is_postable: boolean;
        archived_at: string | null;
      } | null;
      const problem = productAccountProblem(role, a?.account_type, data.kind);
      if (problem) throw new Error(problem);
      if (a && (!a.is_active || a.archived_at)) throw new Error(`The ${role} account is inactive`);
      if (a && !a.is_postable) throw new Error(`The ${role} account is not postable`);
    }
    if (data.categoryId) {
      const { data: category, error: categoryError } = await context.supabase
        .from("product_categories" as never)
        .select("id, is_active" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, data.categoryId as never)
        .maybeSingle();
      if (categoryError) throw new Error(categoryError.message);
      if (!category) throw new Error("Category does not belong to this organisation");
      if (!(category as { is_active: boolean }).is_active) {
        // Older records can retain archived categories; new assignments must be active.
        if (!data.id) throw new Error("Select an active category");
        const { data: existing, error: existingError } = await context.supabase
          .from("products" as never)
          .select("category_id" as never)
          .eq("company_id" as never, data.companyId as never)
          .eq("id" as never, data.id as never).maybeSingle();
        if (existingError) throw new Error(existingError.message);
        if ((existing as { category_id: string | null } | null)?.category_id !== data.categoryId) {
          throw new Error("Archived categories cannot be assigned to other items");
        }
      }
    }
    const payload = {
      company_id: data.companyId,
      kind: data.kind,
      category_id: data.categoryId,
      code: data.code,
      name: data.name,
      description: data.description,
      sales_price_minor: data.salesPriceMinor,
      purchase_cost_minor: data.purchaseCostMinor,
      income_account_id: data.incomeAccountId,
      expense_account_id: data.expenseAccountId,
      sales_tax_rate_bps: data.salesTaxRateBps,
      purchase_tax_rate_bps: data.purchaseTaxRateBps,
      unit: data.unit,
      is_active: data.isActive,
      archived_at: data.isActive ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("products" as never)
        .update(payload as never)
        .eq("id" as never, data.id as never)
        .eq("company_id" as never, data.companyId as never)
        .select("id")
        .single();
      if (error) throw new Error(productWriteError(error));
      return { id: (row as { id: string }).id };
    }
    const { data: row, error } = await context.supabase
      .from("products" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(productWriteError(error));
    return { id: (row as { id: string }).id };
  });

export const archiveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; productId: string; restore?: boolean }) => ({
    companyId: assertUuid(input.companyId),
    productId: assertUuid(input.productId),
    restore: Boolean(input.restore),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const { error } = await context.supabase
      .from("products" as never)
      .update({
        is_active: data.restore,
        archived_at: data.restore ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, data.productId as never)
      .eq("company_id" as never, data.companyId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Batch archive/restore is a single company-scoped database statement.
 * The active SKU unique index remains the final authority when restoring items.
 */
export const setProductsActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; productIds: string[]; isActive: boolean }) => {
    if (
      !Array.isArray(input.productIds) ||
      input.productIds.length < 1 ||
      input.productIds.length > 100
    ) {
      throw new Error("Select between 1 and 100 items");
    }
    if (typeof input.isActive !== "boolean") throw new Error("Invalid status");
    const productIds = [...new Set(input.productIds.map((id) => assertUuid(id, "product")))];
    return { companyId: assertUuid(input.companyId), productIds, isActive: input.isActive };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const { data: existing, error: readError } = await context.supabase
      .from("products" as never)
      .select("id, is_active" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, data.productIds as never);
    if (readError) throw new Error(readError.message);
    const items = (existing ?? []) as { id: string; is_active: boolean }[];
    if (items.length !== data.productIds.length) {
      throw new Error("One or more selected items no longer exist in this organisation");
    }
    const idsToChange = items
      .filter((item) => item.is_active !== data.isActive)
      .map((item) => item.id);
    if (!idsToChange.length) return { changed: 0 };
    const { data: updated, error } = await context.supabase
      .from("products" as never)
      .update({
        is_active: data.isActive,
        archived_at: data.isActive ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, idsToChange as never)
      .select("id" as never);
    if (error) throw new Error(productWriteError(error));
    return { changed: (updated ?? []).length };
  });

/**
 * An exact uniform price change to selected catalogue items. One SQL UPDATE
 * statement changes all matching items; historical posted documents are untouched.
 */
export const setProductPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      productIds: string[];
      field: BulkPriceField;
      valueMinor: number;
    }) => {
      const validated = normaliseBulkPriceChange(input);
      return {
        ...validated,
        companyId: assertUuid(input.companyId),
        productIds: validated.productIds.map((id) => assertUuid(id, "product")),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const { data: existing, error: readError } = await context.supabase
      .from("products" as never)
      .select("id" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, data.productIds as never);
    if (readError) throw new Error(readError.message);
    if ((existing ?? []).length !== data.productIds.length) {
      throw new Error("One or more selected items do not belong to this organisation");
    }
    const { data: updated, error } = await context.supabase
      .from("products" as never)
      .update({
        [data.field]: data.valueMinor,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, data.productIds as never)
      .select("id" as never);
    if (error) throw new Error(error.message);
    const changed = (updated ?? []).length;
    if (changed !== data.productIds.length) {
      throw new Error("Not all items could be updated; refresh the catalogue and review prices");
    }
    const { error: auditError } = await context.supabase.rpc(
      "record_audit_event" as never,
      {
        _company_id: data.companyId,
        _action: "products.bulk_price_set",
        _entity_type: "products",
        _entity_id: null,
        _details: {
          field: data.field,
          value_minor: data.valueMinor,
          item_ids: data.productIds,
          changed,
          source: "catalogue_bulk_edit",
        },
      } as never,
    );
    return { changed, auditError: auditError?.message ?? null };
  });
