import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  assertRunnableReport,
  savedReportName,
  namedSavedConfig,
  reportLibraryMetadata,
  type SavedReport,
} from "./saved-report";

export const listSavedReportViews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; reportId?: string }) => ({
    companyId: assertUuid(input?.companyId),
    reportId: input?.reportId ?? "",
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    let q = context.supabase
      .from("report_saved_views" as never)
      .select(
        "id, report_id, name, user_id, modified_by, access_level, firm_id, version, is_favourite, config, created_at, updated_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, context.userId as never)
      .order("updated_at" as never, { ascending: false });
    if (data.reportId) q = q.eq("report_id" as never, data.reportId as never);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveReportView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      reportId: string;
      name: string;
      config: Record<string, unknown>;
      isFavourite?: boolean;
    }) => {
      const name = savedReportName.parse(input?.name);
      const reportId = assertRunnableReport(input?.reportId);
      return {
        companyId: assertUuid(input.companyId),
        reportId,
        name,
        config: {
          ...namedSavedConfig(input.config ?? {}, name),
          _library: reportLibraryMetadata.parse(input.config?.["_library"] ?? {}),
        },
        isFavourite: Boolean(input.isFavourite),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const { data: row, error } = await context.supabase
      .from("report_saved_views" as never)
      .insert({
        company_id: data.companyId,
        user_id: context.userId,
        report_id: data.reportId,
        name: data.name,
        is_favourite: data.isFavourite,
        config: data.config,
      } as never)
      .select("id, name" as never)
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string; name: string };
  });

export const deleteSavedReportView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; viewId: string }) => ({
    companyId: assertUuid(input?.companyId),
    viewId: assertUuid(input?.viewId, "view"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const { error } = await context.supabase
      .from("report_saved_views" as never)
      .delete()
      .eq("id" as never, data.viewId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, context.userId as never)
      .select("id" as never)
      .single();
    if (error)
      throw new Error("Report was not deleted: it may no longer exist or access was revoked.");
    return { ok: true as const };
  });

/** Library is always scoped by both authenticated owner and current tenant. */
export const listReportLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      query?: string;
      reportId?: string;
      favourite?: boolean;
      state?: "active" | "archived" | "templates";
      sort?: "name" | "updated_at";
      page?: number;
    }) => ({
      companyId: assertUuid(input?.companyId),
      query: (input.query ?? "")
        .trim()
        .slice(0, 80)
        .replace(/[%_\\]/g, " "),
      reportId: input.reportId ? assertRunnableReport(input.reportId) : "",
      favourite: input.favourite === true,
      state: input.state === "archived" || input.state === "templates" ? input.state : "active",
      sort: input.sort === "name" ? "name" : "updated_at",
      page: Number.isSafeInteger(input.page) ? Math.min(100000, Math.max(0, input.page!)) : 0,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    let query = context.supabase
      .from("report_saved_views" as never)
      .select(
        "id, report_id, name, user_id, modified_by, access_level, firm_id, version, is_favourite, config, created_at, updated_at" as never,
        { count: "exact" },
      )
      .eq("company_id" as never, data.companyId as never);
    if (data.state === "archived")
      query = query.eq("config->_library->>archived" as never, "true" as never);
    else
      query = query.or("config->_library->>archived.is.null,config->_library->>archived.eq.false");
    if (data.state === "templates")
      query = query.eq("config->_library->>template" as never, "true" as never);
    if (data.query) query = query.ilike("name" as never, `%${data.query}%` as never);
    if (data.reportId) query = query.eq("report_id" as never, data.reportId as never);
    if (data.favourite) query = query.eq("is_favourite" as never, true as never);
    const {
      data: rows,
      error,
      count,
    } = await query
      .order(data.sort as never, { ascending: data.sort === "name" })
      .order("id" as never, { ascending: true })
      .range(data.page * 20, data.page * 20 + 19);
    if (error) throw new Error(error.message);
    const views = (rows ?? []) as unknown as SavedReport[];
    const ids = [...new Set(views.flatMap((row) => [row.user_id, row.modified_by ?? row.user_id]))];
    const profiles = ids.length
      ? await context.supabase.from("profiles").select("id,full_name,email").in("id", ids)
      : { data: [], error: null };
    if (profiles.error) throw new Error(profiles.error.message);
    const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.email || p.id]));
    return {
      userId: context.userId,
      rows: views.map(({ config, ...row }) => ({
        ...row,
        ownerName: names.get(row.user_id) ?? row.user_id,
        modifierName: names.get(row.modified_by ?? row.user_id) ?? row.modified_by ?? row.user_id,
        config_json: JSON.stringify(config ?? {}),
      })),
      total: count ?? 0,
    };
  });

export const updateSavedReportView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      viewId: string;
      updatedAt: string;
      name: string;
      config: Record<string, unknown>;
      isFavourite: boolean;
    }) => ({
      companyId: assertUuid(input?.companyId),
      viewId: assertUuid(input?.viewId, "view"),
      updatedAt: input.updatedAt,
      name: savedReportName.parse(input.name),
      config: {
        ...namedSavedConfig(input.config, input.name),
        _library: reportLibraryMetadata.parse(input.config["_library"] ?? {}),
      },
      isFavourite: input.isFavourite === true,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const { data: row, error } = await context.supabase
      .from("report_saved_views" as never)
      .update({
        name: data.name,
        config: data.config,
        is_favourite: data.isFavourite,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, data.viewId as never)
      .eq("company_id" as never, data.companyId as never)

      .eq("updated_at" as never, data.updatedAt as never)
      .select("id" as never)
      .single();
    if (error || !row)
      throw new Error("Report changed or is no longer accessible. Refresh before trying again.");
    return { ok: true as const };
  });

/** Copy the stored configuration server-side; never copy another tenant's results. */
export const duplicateSavedReportView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; viewId: string }) => ({
    companyId: assertUuid(input?.companyId),
    viewId: assertUuid(input?.viewId, "view"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const { data: source, error } = await context.supabase
      .from("report_saved_views" as never)
      .select("report_id, name, config" as never)
      .eq("id" as never, data.viewId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, context.userId as never)
      .single();
    if (error || !source) throw new Error("Report is no longer accessible.");
    const view = source as unknown as SavedReport;
    const { error: insertError } = await context.supabase
      .from("report_saved_views" as never)
      .insert({
        company_id: data.companyId,
        user_id: context.userId,
        report_id: assertRunnableReport(view.report_id),
        name: `${view.name.slice(0, 73)} (copy)`,
        config: {
          ...namedSavedConfig(view.config, `${view.name.slice(0, 73)} (copy)`),
          _library: {
            ...reportLibraryMetadata.parse(view.config["_library"] ?? {}),
            archived: false,
            template: false,
          },
        },
        is_favourite: false,
      } as never);
    if (insertError) throw new Error(insertError.message);
    return { ok: true as const };
  });
