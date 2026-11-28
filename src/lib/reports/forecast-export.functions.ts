import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "@/lib/planning/rpc";
import { forecastSchema } from "./ecosystem-model";
import { forecastReportDocument } from "./forecast-document";

export const exportForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        config: forecastSchema,
        name: z.string().trim().min(1).max(160),
        format: z.enum(["pdf", "xlsx", "csv"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    await assertCompanyPermission(context.supabase, data.companyId, "reports.export");
    const { captureForecast } = await import("./forecast-calculation.server");
    const result = await captureForecast(context.supabase, data.companyId, data.config);
    const doc = forecastReportDocument(result, data.config, data.name);
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
        _details: {
          report: "operating-forecast",
          basis: result.accountingBasis,
          format: data.format,
          from: doc.from,
          to: doc.to,
          baselineFrom: data.config.baselineFrom,
          baselineTo: data.config.baselineTo,
        },
      },
      "Could not record forecast export",
    );
    return {
      content: bytesToBase64(bytes),
      filename: `operating-forecast-${doc.to}.${data.format}`,
      mime:
        data.format === "pdf"
          ? "application/pdf"
          : data.format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv;charset=utf-8",
    };
  });
