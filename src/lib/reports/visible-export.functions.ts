import { isReportDate } from "./date-validation";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "@/lib/planning/rpc";
import type { ReportDocument } from "./report-document";

const text = z.string().max(500);
const requestSchema = z
  .object({
    companyId: z.string().uuid(),
    reportId: z.string().min(1).max(100),
    title: z.string().min(1).max(150),
    companyName: z.string().min(1).max(200),
    currency: z.string().min(3).max(3),
    from: z.string().refine(isReportDate, "Choose a real calendar date"),
    to: z.string().refine(isReportDate, "Choose a real calendar date"),
    basis: z.string().max(300).default(""),
    headers: z.array(z.string().min(1).max(150)).min(2).max(24),
    rows: z.array(z.array(text).min(1).max(24)).max(2000),
    format: z.enum(["pdf", "xlsx", "csv"]),
  })
  .superRefine((v, ctx) => {
    if (v.from > v.to) ctx.addIssue({ code: "custom", message: "Invalid reporting dates" });
    for (const [index, row] of v.rows.entries())
      if (row.length !== v.headers.length) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index],
          message: "Report data and column widths do not match",
        });
        break;
      }
  });

export type VisibleReportExportRequest = z.input<typeof requestSchema>;

/**
 * Dedicated export of the currently loaded report rows.
 * Unlike standard financial statement exports, this intentionally does not claim
 * to be a fresh database financial snapshot; it is a faithful, labelled screen export.
 */
export const exportVisibleReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    await assertCompanyPermission(context.supabase, data.companyId, "reports.export");
    const capturedAt = new Date().toISOString();
    const document: ReportDocument = {
      title: data.title,
      company: data.companyName,
      currency: data.currency,
      from: data.from,
      to: data.to,
      capturedAt,
      subtitle: data.basis,
      header: "",
      footer: "LinkBooks · Screen export",
      notes:
        "Contains the rows loaded in the report at the time of export. A paginated report may contain only the visible page. For certified financial statements, use the standard report export.",
      orientation: data.headers.length > 4 ? "landscape" : "portrait",
      sections: [
        {
          id: data.reportId,
          title: data.title,
          labelHeader: data.headers[0]!,
          columns: data.headers.slice(1),
          rows: data.rows.map((row) => ({
            label: row[0] ?? "",
            kind: "account" as const,
            values: row.slice(1),
            format: "money" as const,
            thousands: true,
            negative: "parentheses" as const,
          })),
        },
      ],
    };
    const { exportReportPdf, exportReportXlsx, exportReportCsv, bytesToBase64 } =
      await import("./document-export.server");
    // Export Excel strings as text when they are not numeric; never run spreadsheet formula input.
    const bytes =
      data.format === "pdf"
        ? await exportReportPdf(document)
        : data.format === "xlsx"
          ? await exportReportXlsx(document)
          : new TextEncoder().encode(exportReportCsv(document));
    await callRpc(
      context.supabase,
      "record_audit_event",
      {
        _company_id: data.companyId,
        _action: "report.exported",
        _entity_type: "report",
        _entity_id: null,
        _details: {
          report: data.reportId,
          format: data.format,
          scope: "loaded_rows",
          rows: data.rows.length,
        },
      },
      "Could not record report export",
    );
    const safe = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return {
      content: bytesToBase64(bytes),
      filename: `${safe}-${data.to}.${data.format}`,
      mime:
        data.format === "pdf"
          ? "application/pdf"
          : data.format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv;charset=utf-8",
    };
  });
