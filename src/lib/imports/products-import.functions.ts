import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { prepareProductsCsv } from "./products-import";
import { productAccountProblem } from "@/lib/products/product-rules";

export type ProductsImportResult = {
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
  auditError: string | null;
};

/**
 * Non-posting catalogue importer. The database's unique active-SKU index makes
 * repeated submissions safe, including concurrent attempts with different SKU case.
 * Rows are individually inserted; a database failure may cause a partial import.
 */
export const importProductsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; csvText: string }) => {
    if (typeof input.csvText !== "string" || input.csvText.length > 5 * 1024 * 1024) {
      throw new Error("Invalid CSV input or file exceeds 5 MB");
    }
    return { companyId: assertUuid(input.companyId), csvText: input.csvText };
  })
  .handler(async ({ data, context }): Promise<ProductsImportResult> => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const { data: company, error: companyError } = await context.supabase
      .from("companies" as never)
      .select("base_currency" as never)
      .eq("id" as never, data.companyId as never)
      .single();
    if (companyError) throw new Error(companyError.message);
    const currency = (company as { base_currency: string } | null)?.base_currency;
    if (!currency) throw new Error("Organisation base currency is missing");

    // Always revalidate on the authenticated server, regardless of client preview.
    const records = prepareProductsCsv(data.csvText, currency);

    // Check every requested account in this organisation before any insert. A pasted
    // foreign-company UUID must never become an accounting default for this company.
    const accountIds = [
      ...new Set(
        records.flatMap((row) =>
          [row.incomeAccountId, row.expenseAccountId].filter((id): id is string => Boolean(id)),
        ),
      ),
    ];
    const accountById = new Map<
      string,
      { account_type: string; is_active: boolean; is_postable: boolean; archived_at: string | null }
    >();
    if (accountIds.length) {
      const { data: accounts, error: accountsError } = await context.supabase
        .from("accounts" as never)
        .select("id, account_type, is_active, is_postable, archived_at" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, accountIds as never);
      if (accountsError) throw new Error(accountsError.message);
      for (const account of (accounts ?? []) as Array<{
        id: string;
        account_type: string;
        is_active: boolean;
        is_postable: boolean;
        archived_at: string | null;
      }>) {
        accountById.set(account.id.toLowerCase(), account);
      }
    }
    const categoryIds = [
      ...new Set(records.map((row) => row.categoryId).filter((id): id is string => Boolean(id))),
    ];
    const categoryMap = new Map<string, boolean>();
    if (categoryIds.length) {
      const { data: categories, error: categoryError } = await context.supabase
        .from("product_categories" as never)
        .select("id, is_active" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, categoryIds as never);
      if (categoryError) throw new Error(categoryError.message);
      for (const category of (categories ?? []) as Array<{ id: string; is_active: boolean }>) {
        categoryMap.set(category.id.toLowerCase(), category.is_active);
      }
    }
    for (const row of records) {
      if (row.categoryId && categoryMap.get(row.categoryId.toLowerCase()) !== true) {
        throw new Error(
          `Row ${row.sourceRow}: Category must be active and belong to this organisation`,
        );
      }
      for (const [role, accountId] of [
        ["income", row.incomeAccountId],
        ["expense", row.expenseAccountId],
      ] as const) {
        if (!accountId) continue;
        const account = accountById.get(accountId.toLowerCase());
        const problem = productAccountProblem(role, account?.account_type, row.kind);
        if (problem) throw new Error(`Row ${row.sourceRow}: ${problem}`);
        if (!account || !account.is_active || account.archived_at || !account.is_postable) {
          throw new Error(`Row ${row.sourceRow}: The ${role} account is inactive or not postable`);
        }
      }
    }
    const result: ProductsImportResult = {
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      auditError: null,
    };
    const createdCodes: string[] = [];
    for (const row of records) {
      const { error } = await context.supabase.from("products" as never).insert({
        company_id: data.companyId,
        kind: row.kind,
        code: row.code,
        name: row.name,
        sales_price_minor: row.salesPriceMinor,
        purchase_cost_minor: row.purchaseCostMinor,
        description: row.description,
        unit: row.unit,
        sales_tax_rate_bps: row.salesTaxRateBps,
        purchase_tax_rate_bps: row.purchaseTaxRateBps,
        income_account_id: row.incomeAccountId,
        expense_account_id: row.expenseAccountId,
        category_id: row.categoryId,
        is_active: true,
      } as never);
      if (!error) {
        result.created++;
        createdCodes.push(row.code);
      } else if (error.code === "23505") {
        // The company-scoped case-insensitive active-SKU unique index enforces idempotency.
        result.skipped++;
      } else {
        result.failed++;
        result.errors.push({ row: row.sourceRow, message: error.message });
      }
    }

    if (createdCodes.length) {
      const { error } = await context.supabase.rpc(
        "record_app_audit_event" as never,
        {
          _company_id: data.companyId,
          _action: "products.import",
          _entity_type: "products",
          _entity_id: null,
          _details: {
            created: result.created,
            skipped: result.skipped,
            failed: result.failed,
            sku_codes: createdCodes,
            source: "csv",
          },
        } as never,
      );
      if (error) result.auditError = error.message;
    }
    return result;
  });
