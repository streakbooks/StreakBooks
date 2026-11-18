import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import type { Sb } from "@/lib/accounting/ledger-data";
import { buildReportDocument, factsSchema } from "./report-document";
import { callRpc } from "@/lib/planning/rpc";
import { standardSettingsSchema, encodeStandardSettings } from "./standard-settings";
import { isReportDate } from "./date-validation";
const requestSchema = z.object({
  companyId: z.string().uuid(),
  report: z.enum(["profit-and-loss", "balance-sheet"]),
  from: z.string().refine(isReportDate),
  to: z.string().refine(isReportDate),
  settings: standardSettingsSchema,
});
export type StandardStatementRequest = z.infer<typeof requestSchema>;
async function run(supabase: Sb, data: StandardStatementRequest) {
  if (data.from > data.to) throw new Error("End date must follow start date");
  await assertCompanyPermission(supabase, data.companyId, "reports.view");
  const facts =
    data.settings.basis === "cash"
      ? await (
          await import("./cash-standard.server")
        ).captureCashStandard(
          supabase,
          data.companyId,
          data.from,
          data.to,
          data.settings,
          data.report,
        )
      : await callRpc(
          supabase,
          "capture_standard_report_facts",
          {
            _company_id: data.companyId,
            _from: data.from,
            _to: data.to,
            _report_id: data.report,
            _settings: data.settings,
          },
          "The standard statement database update is required.",
        );
  const captured = factsSchema.parse(facts);
  if (
    captured.company.id !== data.companyId ||
    captured.from !== data.from ||
    captured.to !== data.to
  )
    throw new Error("Captured statement company or reporting dates do not match the request");
  return buildReportDocument(captured, {
    name: data.report,
    reportId: data.report,
    config: { settings: encodeStandardSettings(data.settings) },
  });
}
export const getStandardStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data, context }) => run(context.supabase, data));
export const exportStandardStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    requestSchema.extend({ format: z.enum(["pdf", "xlsx", "csv"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.export");
    const doc = await run(context.supabase, data);
    const { exportReportPdf, exportReportXlsx, exportReportCsv, bytesToBase64 } =
      await import("./document-export.server");
    const bytes =
      data.format === "pdf"
        ? await exportReportPdf(doc)
        : data.format === "xlsx"
          ? await exportReportXlsx(doc)
          : new TextEncoder().encode(exportReportCsv(doc));
    await callRpc(
      context.supabase,
      "record_app_audit_event",
      {
        _company_id: data.companyId,
        _action: "report.exported",
        _entity_type: "report",
        _entity_id: null,
        _details: { report: data.report, format: data.format, basis: data.settings.basis },
      },
      "Could not record report export.",
    );
    return {
      content: bytesToBase64(bytes),
      filename: `${data.report}-${data.to}.${data.format}`,
      mime:
        data.format === "pdf"
          ? "application/pdf"
          : data.format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv;charset=utf-8",
    };
  });
