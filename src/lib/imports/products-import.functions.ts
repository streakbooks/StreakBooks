import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { prepareProductsCsv } from "./products-import";

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
  .inputValidator((input: { companyId: string; csvText: string }) => {
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
        "record_audit_event" as never,
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
