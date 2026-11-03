import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { prepareProjectsCsv } from "./projects-import";

export type ProjectsImportResult = {
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
  auditError: string | null;
};

/** Non-posting project master-data import; project codes are case-sensitive per DB constraint. */
export const importProjectsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; csvText: string }) => {
    if (typeof input.csvText !== "string" || input.csvText.length > 5 * 1024 * 1024) {
      throw new Error("Invalid CSV or file exceeds 5 MB");
    }
    return { companyId: assertUuid(input.companyId), csvText: input.csvText };
  })
  .handler(async ({ data, context }): Promise<ProjectsImportResult> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounts.manage");
    const rows = prepareProjectsCsv(data.csvText);
    const contactIds = new Map<string, string>();
    // Resolve all optional customer references before creating any projects.
    for (const row of rows) {
      if (!row.customer || contactIds.has(row.customer)) continue;
      const { data: contacts, error } = await context.supabase
        .from("contacts" as never)
        .select("id" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("name" as never, row.customer as never)
        .in("kind" as never, ["customer", "both"] as never)
        .eq("is_active" as never, true as never)
        .limit(2);
      if (error) throw new Error(error.message);
      if ((contacts ?? []).length !== 1) {
        throw new Error(
          `Row ${row.sourceRow}: Customer "${row.customer}" must match exactly one active customer in this organisation`,
        );
      }
      contactIds.set(row.customer, ((contacts ?? []) as Array<{ id: string }>)[0]!.id);
    }

    const result: ProjectsImportResult = {
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      auditError: null,
    };
    const createdCodes: string[] = [];
    for (const row of rows) {
      const { error } = await context.supabase.from("projects" as never).insert({
        company_id: data.companyId,
        code: row.code,
        name: row.name,
        status: "active",
        contact_id: row.customer ? contactIds.get(row.customer) : null,
        start_date: row.startDate,
        created_by: context.userId,
      } as never);
      if (!error) {
        result.created++;
        createdCodes.push(row.code);
      } else if (error.code === "23505") {
        // Unique (company_id, code) enforces exact-code idempotency under concurrent retries.
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
          _action: "projects.import",
          _entity_type: "project",
          _entity_id: null,
          _details: {
            source: "csv",
            created: result.created,
            skipped: result.skipped,
            failed: result.failed,
            project_codes: createdCodes,
          },
        } as never,
      );
      if (error) result.auditError = error.message;
    }
    return result;
  });
