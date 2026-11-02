import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { loadAccountMetas, type Sb } from "@/lib/accounting/ledger-data";
import { validateSavedConfig } from "./saved-report";
import { customDefinitionSchema } from "./custom-definition";
import { buildReportDocument } from "./report-document";
import {
  packPayloadSchema,
  deliveryPayloadSchema,
  schedulePayloadSchema,
  dashboardSchema,
  forecastSchema,
  packConfigSchema,
  dateSchema,
} from "./ecosystem-model";
import { callRpc } from "@/lib/planning/rpc";
const missing = "The reporting ecosystem database update is required.";
const scope = (input: { companyId: string }) => ({ companyId: assertUuid(input?.companyId) });
export const getReportingFeatureAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(scope)
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    return JSON.stringify(
      await callRpc(
        context.supabase,
        "get_reporting_feature_access",
        { _company_id: data.companyId },
        missing,
      ),
    );
  });
export const getReportingWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; packPage?: number; packState?: string; packQuery?: string }) => ({
      ...scope(input),
      packPage: z.number().int().min(0).max(100000).default(0).parse(input.packPage),
      packState: z
        .enum(["all", "drafts", "published", "archived"])
        .default("all")
        .parse(input.packState),
      packQuery: z.string().trim().max(160).default("").parse(input.packQuery),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    let packQuery = context.supabase
      .from("report_packs")
      .select(
        "id,company_id,owner_id,name,from_date,to_date,config,status,version,reviewer_id,preparer_id,prepared_by,approved_by,snapshot_hash,created_at,updated_at",
        { count: "exact" },
      )
      .eq("company_id", data.companyId);
    if (data.packState === "drafts")
      packQuery = packQuery.in("status", [
        "draft",
        "in_progress",
        "ready_for_review",
        "review_required",
        "approved",
      ]);
    if (data.packState === "published")
      packQuery = packQuery.in("status", ["published", "delivered"]);
    if (data.packState === "archived") packQuery = packQuery.eq("status", "archived");
    if (data.packQuery)
      packQuery = packQuery.ilike("name", `%${data.packQuery.replace(/[\\%_]/g, "\\$&")}%`);
    const [packs, models, schedules, deliveries, members, counts] = await Promise.all([
      packQuery
        .order("updated_at", { ascending: false })
        .order("id")
        .range(data.packPage * 50, data.packPage * 50 + 49),
      context.supabase
        .from("report_models" as never)
        .select("id,name,kind,config,version,updated_at" as never)
        .eq("company_id" as never, data.companyId as never)
        .order("updated_at" as never, { ascending: false })
        .limit(200),
      context.supabase
        .from("report_schedules" as never)
        .select("*" as never)
        .eq("company_id" as never, data.companyId as never)
        .order("next_run_at" as never)
        .limit(200),
      context.supabase
        .from("report_deliveries" as never)
        .select(
          "id,pack_id,view_id,schedule_id,subject,status,attempts,provider_id,last_error,scheduled_for,created_at,updated_at" as never,
        )
        .eq("company_id" as never, data.companyId as never)
        .order("created_at" as never, { ascending: false })
        .limit(100),
      context.supabase
        .from("company_members" as never)
        .select("user_id,role" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("status" as never, "active" as never)
        .limit(500),
      callRpc<Record<string, number>>(
        context.supabase,
        "report_pack_counts",
        { _company_id: data.companyId },
        missing,
      ),
    ]);
    for (const result of [packs, models, schedules, deliveries, members])
      if (result.error) throw new Error(result.error.message);
    const people = (members.data ?? []) as unknown as Array<{ user_id: string; role: string }>;
    const ids = people.map((p) => p.user_id);
    const profiles = ids.length
      ? await context.supabase.from("profiles").select("id,full_name,email").in("id", ids)
      : { data: [], error: null };
    if (profiles.error) throw new Error(profiles.error.message);
    const profileMap = new Map((profiles.data ?? []).map((p) => [p.id, p]));
    return JSON.stringify({
      packs: packs.data ?? [],
      models: models.data ?? [],
      schedules: schedules.data ?? [],
      deliveries: deliveries.data ?? [],
      members: people.map((p) => ({
        ...p,
        name: profileMap.get(p.user_id)?.full_name || profileMap.get(p.user_id)?.email || p.user_id,
        email: profileMap.get(p.user_id)?.email ?? "",
      })),
      userId: context.userId,
      packTotal: packs.count ?? 0,
      packCounts: counts,
      hasMore: (data.packPage + 1) * 50 < (packs.count ?? 0),
    });
  });
export const getReportAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(scope)
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    return loadAccountMetas(context.supabase as Sb, data.companyId);
  });
export const previewCustomReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; from: string; to: string; definition: unknown }) => {
    const from = dateSchema.parse(input.from),
      to = dateSchema.parse(input.to);
    if (from > to) throw new Error("Invalid reporting period");
    return {
      ...scope(input),
      from,
      to,
      definition: customDefinitionSchema.parse(input.definition),
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const facts = await callRpc(
      context.supabase,
      "capture_custom_report_facts",
      { _company_id: data.companyId, _from: data.from, _to: data.to, _definition: data.definition },
      missing,
    );
    return JSON.stringify(
      buildReportDocument(facts, {
        name: data.definition.title,
        config: { _builder: data.definition },
      }),
    );
  });
export const getSavedReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; viewId: string }) => ({
    ...scope(input),
    viewId: assertUuid(input.viewId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const { data: row, error } = await context.supabase
      .from("report_saved_views" as never)
      .select("*" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.viewId as never)
      .single();
    if (error) throw new Error("Report is unavailable or access was revoked");
    const report = row as unknown as { config: Record<string, unknown> };
    validateSavedConfig(report.config);
    return JSON.stringify(row);
  });
export const setReportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        viewId: z.string().uuid(),
        level: z.enum(["private", "company", "selected", "firm"]),
        firmId: z.string().uuid().nullable().optional(),
        grants: z
          .array(z.object({ userId: z.string().uuid(), access: z.enum(["view", "edit"]) }))
          .max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.export");
    // Scope the requested object before the RPC; the database independently checks ownership.
    const { data: row, error } = await context.supabase
      .from("report_saved_views" as never)
      .select("id" as never)
      .eq("id" as never, data.viewId as never)
      .eq("company_id" as never, data.companyId as never)
      .single();
    if (error || !row) throw new Error("Report access denied");
    await callRpc(
      context.supabase,
      "set_report_access",
      {
        _view_id: data.viewId,
        _level: data.level,
        _grants: data.grants,
        _firm_id: data.firmId ?? null,
      },
      missing,
    );
    return { ok: true };
  });
export const saveReportPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; payload: unknown }) => ({
    ...scope(input),
    payload: packPayloadSchema.parse(input.payload),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    const id = await callRpc(
      context.supabase,
      "save_report_pack",
      { _company_id: data.companyId, _payload: data.payload },
      missing,
    );
    return String(id);
  });
export const transitionReportPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid(),
        version: z.number().int().positive(),
        action: z.enum([
          "start",
          "submit",
          "approve",
          "request_changes",
          "publish",
          "archive",
          "restore",
        ]),
        note: z.string().max(4000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    const { data: pack, error } = await context.supabase
      .from("report_packs" as never)
      .select("id" as never)
      .eq("id" as never, data.id as never)
      .eq("company_id" as never, data.companyId as never)
      .single();
    if (error || !pack) throw new Error("Pack access denied");
    await callRpc(
      context.supabase,
      "transition_report_pack",
      { _id: data.id, _version: data.version, _action: data.action, _note: data.note },
      missing,
    );
    return { ok: true };
  });
export const getReportPack = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; id: string }) => ({
    ...scope(input),
    id: assertUuid(input.id),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const { data: pack, error } = await context.supabase
      .from("report_packs" as never)
      .select("*" as never)
      .eq("id" as never, data.id as never)
      .eq("company_id" as never, data.companyId as never)
      .single();
    if (error || !pack) throw new Error("Pack not found");
    const { data: comments, error: commentError } = await context.supabase
      .from("report_comments" as never)
      .select("id,author_id,body,created_at" as never)
      .eq("pack_id" as never, data.id as never)
      .eq("company_id" as never, data.companyId as never)
      .order("created_at" as never)
      .limit(500);
    if (commentError) throw new Error(commentError.message);
    const saved = pack as unknown as { snapshot: unknown };
    if (
      saved.snapshot &&
      (await callRpc(context.supabase, "report_pack_integrity", { _id: data.id }, missing)) !== true
    )
      throw new Error("Report snapshot integrity check failed");
    return JSON.stringify({ pack, comments: comments ?? [] });
  });
export const addReportComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        packId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const { error } = await context.supabase.from("report_comments" as never).insert({
      company_id: data.companyId,
      pack_id: data.packId,
      author_id: context.userId,
      body: data.body,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const saveReportingModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const data = z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid().optional(),
        version: z.number().int().positive().optional(),
        name: z.string().trim().min(1).max(160),
        kind: z.enum(["dashboard", "forecast", "pack_template"]),
        config: z.unknown(),
      })
      .parse(input);
    const config =
      data.kind === "dashboard"
        ? dashboardSchema.parse(data.config)
        : data.kind === "forecast"
          ? forecastSchema.parse(data.config)
          : packConfigSchema.parse(data.config);
    if (data.id && !data.version) throw new Error("Refresh the model before saving");
    return { ...data, config };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const patch = {
      name: data.name,
      kind: data.kind,
      config: data.config,
      updated_at: new Date().toISOString(),
      ...(data.id ? { version: data.version! + 1 } : {}),
    };
    const query = context.supabase.from("report_models" as never);
    const result = data.id
      ? await query
          .update(patch as never)
          .eq("id" as never, data.id as never)
          .eq("company_id" as never, data.companyId as never)
          .eq("owner_id" as never, context.userId as never)
          .eq("version" as never, data.version as never)
          .select("id" as never)
          .single()
      : await query
          .insert({ ...patch, company_id: data.companyId, owner_id: context.userId } as never)
          .select("id" as never)
          .single();
    if (result.error) throw new Error("Model changed or access was denied; refresh before saving");
    return JSON.stringify(result.data);
  });
export const queueReportDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; payload: unknown }) => ({
    ...scope(input),
    payload: deliveryPayloadSchema.parse(input.payload),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.export");
    const status = await callRpc<{ configured: boolean }>(
      context.supabase,
      "get_reporting_delivery_status",
      { _company_id: data.companyId },
      missing,
    );
    if (!status.configured)
      throw new Error(
        "Report delivery is not ready. The delivery service needs a verified sender and server-side email secret.",
      );
    return String(
      await callRpc(
        context.supabase,
        "queue_report_delivery",
        { _company_id: data.companyId, _payload: data.payload },
        missing,
      ),
    );
  });
export const saveReportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; payload: unknown }) => ({
    ...scope(input),
    payload: schedulePayloadSchema.parse(input.payload),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.export");
    return String(
      await callRpc(
        context.supabase,
        "save_report_schedule",
        { _company_id: data.companyId, _payload: data.payload },
        missing,
      ),
    );
  });
export const deleteReportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; id: string }) => ({
    ...scope(input),
    id: assertUuid(input.id),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.export");
    const { data: row, error } = await context.supabase
      .from("report_schedules" as never)
      .select("id" as never)
      .eq("id" as never, data.id as never)
      .eq("company_id" as never, data.companyId as never)
      .single();
    if (error || !row) throw new Error("Schedule access denied");
    await callRpc(context.supabase, "delete_report_schedule", { _id: data.id }, missing);
    return { ok: true };
  });
export const captureReportDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; viewId?: string; packId?: string; from?: string; to?: string }) =>
      z
        .object({
          companyId: z.string().uuid(),
          viewId: z.string().uuid().optional(),
          packId: z.string().uuid().optional(),
          from: dateSchema.optional(),
          to: dateSchema.optional(),
        })
        .refine((v) => Boolean(v.viewId) !== Boolean(v.packId), "Choose one saved report or pack")
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    if (data.packId) {
      const { data: p, error } = await context.supabase
        .from("report_packs" as never)
        .select("name,config,snapshot" as never)
        .eq("id" as never, data.packId as never)
        .eq("company_id" as never, data.companyId as never)
        .single();
      if (error || !p) throw new Error("Pack not found");
      const pack = p as unknown as {
        name: string;
        config: Record<string, unknown>;
        snapshot: unknown;
      };
      if (!pack.snapshot)
        throw new Error("Submit this pack for review to capture its financial snapshot");
      if (
        (await callRpc(
          context.supabase,
          "report_pack_integrity",
          { _id: data.packId },
          missing,
        )) !== true
      )
        throw new Error("Report snapshot integrity check failed");
      return JSON.stringify(buildReportDocument(pack.snapshot, pack));
    }
    const { data: v, error } = await context.supabase
      .from("report_saved_views" as never)
      .select("name,report_id,config" as never)
      .eq("id" as never, data.viewId as never)
      .eq("company_id" as never, data.companyId as never)
      .single();
    if (error || !v) throw new Error("Report not found");
    const view = v as unknown as {
      name: string;
      report_id: string;
      config: Record<string, unknown>;
    };
    const from = dateSchema.parse(data.from ?? view.config["from"]),
      to = dateSchema.parse(data.to ?? view.config["to"]);
    const def = view.config["_builder"]
      ? customDefinitionSchema.parse(view.config["_builder"])
      : null;
    const facts = await callRpc(
      context.supabase,
      def ? "capture_custom_report_facts" : "capture_reporting_facts",
      { _company_id: data.companyId, _from: from, _to: to, ...(def ? { _definition: def } : {}) },
      missing,
    );
    return JSON.stringify(
      buildReportDocument(facts, {
        name: view.name,
        reportId: view.report_id,
        config: view.config,
      }),
    );
  });
export const exportReportDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        packId: z.string().uuid().optional(),
        viewId: z.string().uuid().optional(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
        format: z.enum(["pdf", "xlsx", "csv"]),
      })
      .refine((v) => Boolean(v.packId) !== Boolean(v.viewId), "Choose one saved report or pack")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.export");
    let facts: unknown;
    let definition: { name: string; config: Record<string, unknown>; reportId?: string };
    if (data.packId) {
      const { data: p, error } = await context.supabase
        .from("report_packs" as never)
        .select("name,config,snapshot" as never)
        .eq("id" as never, data.packId as never)
        .eq("company_id" as never, data.companyId as never)
        .single();
      if (error || !p) throw new Error("Pack access denied");
      const pack = p as unknown as {
        name: string;
        config: Record<string, unknown>;
        snapshot: unknown;
      };
      if (!pack.snapshot) throw new Error("Submit the pack for review to capture its snapshot");
      if (
        (await callRpc(
          context.supabase,
          "report_pack_integrity",
          { _id: data.packId },
          missing,
        )) !== true
      )
        throw new Error("Report snapshot integrity check failed");
      facts = pack.snapshot;
      definition = pack;
    } else {
      const { data: v, error } = await context.supabase
        .from("report_saved_views" as never)
        .select("name,report_id,config" as never)
        .eq("id" as never, data.viewId as never)
        .eq("company_id" as never, data.companyId as never)
        .single();
      if (error || !v) throw new Error("Report access denied");
      const view = v as unknown as {
        name: string;
        report_id: string;
        config: Record<string, unknown>;
      };
      const def = view.config["_builder"]
        ? customDefinitionSchema.parse(view.config["_builder"])
        : null;
      facts = await callRpc(
        context.supabase,
        def ? "capture_custom_report_facts" : "capture_reporting_facts",
        {
          _company_id: data.companyId,
          _from: dateSchema.parse(data.from ?? view.config["from"]),
          _to: dateSchema.parse(data.to ?? view.config["to"]),
          ...(def ? { _definition: def } : {}),
        },
        missing,
      );
      definition = { name: view.name, reportId: view.report_id, config: view.config };
    }
    const doc = buildReportDocument(facts, definition);
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
      "record_audit_event",
      {
        _company_id: data.companyId,
        _action: "report.exported",
        _entity_type: "report",
        _entity_id: data.packId ?? data.viewId,
        _details: { format: data.format },
      },
      missing,
    );
    return {
      content: bytesToBase64(bytes),
      filename: `${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${doc.to}.${data.format}`,
      mime:
        data.format === "pdf"
          ? "application/pdf"
          : data.format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv;charset=utf-8",
    };
  });

export const getManagementMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; from: string; to: string }) => ({
    ...scope(input),
    from: dateSchema.parse(input.from),
    to: dateSchema.parse(input.to),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const facts = await callRpc(
      context.supabase,
      "capture_reporting_facts",
      { _company_id: data.companyId, _from: data.from, _to: data.to },
      missing,
    );
    const { managementMetrics } = await import("./management");
    return managementMetrics(facts);
  });
export const previewForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; config: unknown }) => ({
    ...scope(input),
    config: forecastSchema.parse(input.config),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const { documentFigures } = await import("./report-document"),
      { forecastProjection } = await import("./management"),
      { addMonthsIso, monthEnd, todayIso } = await import("@/lib/accounting/fiscal-year");
    const base = await callRpc(
      context.supabase,
      "capture_reporting_facts",
      { _company_id: data.companyId, _from: data.config.baselineFrom, _to: data.config.baselineTo },
      missing,
    );
    const { current } = documentFigures(base);
    const today = todayIso();
    const actuals: Array<{ month: string; revenueMinor: string; expenseMinor: string }> = [];
    // Only closed months can be compared with a full-month projection; future values stay explicitly absent.
    const completed = Array.from({ length: data.config.months }, (_, i) =>
      addMonthsIso(data.config.start, i),
    ).filter((date) => monthEnd(date) < today);
    for (let i = 0; i < completed.length; i += 6) {
      const batch = await Promise.all(
        completed.slice(i, i + 6).map(async (month) => {
          const facts = await callRpc(
            context.supabase,
            "capture_reporting_facts",
            { _company_id: data.companyId, _from: month, _to: monthEnd(month) },
            missing,
          );
          const { current: p } = documentFigures(facts);
          return {
            month,
            revenueMinor: (p.revenue + p.contraRevenue).toString(),
            expenseMinor: p.expense.toString(),
          };
        }),
      );
      actuals.push(...batch);
    }
    return forecastProjection(
      data.config,
      {
        revenueMinor: (current.revenue + current.contraRevenue).toString(),
        expenseMinor: current.expense.toString(),
      },
      actuals,
    );
  });
export const getFirmReportingPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        firmId: z.string().uuid(),
        from: dateSchema,
        to: dateSchema,
        companyIds: z.array(z.string().uuid()).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: member, error } = await sb
      .from("firm_members" as never)
      .select("id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .single();
    if (error || !member) throw new Error("Firm membership required");
    const { data: links, error: linkError } = await sb
      .from("firm_client_links" as never)
      .select(
        "company_id,companies(name,base_currency,fiscal_year_end_month,fiscal_year_end_day)" as never,
      )
      .eq("firm_id" as never, data.firmId as never)
      .is("revoked_at" as never, null)
      .limit(101);
    if (linkError) throw new Error(linkError.message);
    const clients = (links ?? []) as unknown as Array<{
      company_id: string;
      companies: {
        name: string;
        base_currency: string;
        fiscal_year_end_month: number;
        fiscal_year_end_day: number;
      } | null;
    }>;
    if (clients.length > 100)
      throw new Error("Select a firm with at most 100 clients for this portfolio view");
    if (data.companyIds?.some((id) => !clients.some((c) => c.company_id === id)))
      throw new Error("One or more selected clients are not authorized");
    const selected = data.companyIds?.length
      ? clients.filter((c) => data.companyIds!.includes(c.company_id))
      : clients;
    const { managementMetrics } = await import("./management");
    const rows = [];
    for (let i = 0; i < selected.length; i += 5) {
      rows.push(
        ...(await Promise.all(
          selected.slice(i, i + 5).map(async (client) => {
            await assertCompanyPermission(sb, client.company_id, "reports.view");
            const facts = await callRpc(
              sb,
              "capture_reporting_facts",
              { _company_id: client.company_id, _from: data.from, _to: data.to },
              missing,
            );
            const { data: packs, error: packError } = await sb
              .from("report_packs" as never)
              .select("id,name,status,to_date,updated_at" as never)
              .eq("company_id" as never, client.company_id as never)
              .eq("to_date" as never, data.to as never)
              .order("updated_at" as never, { ascending: false })
              .limit(20);
            if (packError) throw new Error(packError.message);
            return {
              companyId: client.company_id,
              name: client.companies?.name ?? "Client",
              metrics: managementMetrics(facts),
              packs_json: JSON.stringify(packs ?? []),
            };
          }),
        )),
      );
    }
    return rows;
  });

export const getReportGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; viewId: string }) => ({
    ...scope(input),
    viewId: assertUuid(input.viewId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const { data: report, error } = await context.supabase
      .from("report_saved_views" as never)
      .select("id" as never)
      .eq("id" as never, data.viewId as never)
      .eq("company_id" as never, data.companyId as never)
      .single();
    if (error || !report) throw new Error("Report access denied");
    const result = await context.supabase
      .from("report_grants" as never)
      .select("user_id,access" as never)
      .eq("view_id" as never, data.viewId as never);
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []) as unknown as Array<{ user_id: string; access: "view" | "edit" }>;
  });
