import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";

const firmScope = z.object({ firmId: z.string().uuid() }).strict();

async function assertFirmMembership(
  context: { supabase: Parameters<typeof assertCompanyPermission>[0]; userId: string },
  firmId: string,
  mustManage: boolean,
) {
  const { data, error } = await context.supabase
    .from("firm_members" as never)
    .select("role" as never)
    .eq("firm_id" as never, firmId as never)
    .eq("user_id" as never, context.userId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Firm membership required");
  if (mustManage && !["owner", "admin"].includes((data as { role: string }).role))
    throw new Error("Firm administrator access required");
}

export type FirmServiceCategory = {
  id: string;
  firm_id: string;
  name: string;
  is_active: boolean;
  version: number;
};
export type FirmCustomOnboardingStep = {
  firm_id: string;
  task_key: string;
  title: string;
  is_active: boolean;
  sort_order: number;
  due_in_days: number | null;
  reminders_enabled: boolean;
  version: number;
};

export const listFirmServiceCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmScope.parse(input))
  .handler(async ({ data, context }): Promise<FirmServiceCategory[]> => {
    await assertFirmMembership(context, data.firmId, false);
    const { data: rows, error } = await context.supabase
      .from("firm_service_categories" as never)
      .select("id,firm_id,name,is_active,version" as never)
      .eq("firm_id" as never, data.firmId as never)
      .order("name" as never)
      .limit(101);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 100) throw new Error("Firm services exceed 100 categories");
    return (rows ?? []) as FirmServiceCategory[];
  });

const serviceInput = firmScope
  .extend({
    id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    name: z.string().trim().min(2).max(80),
    is_active: z.boolean(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (Boolean(item.id) !== Boolean(item.version))
      ctx.addIssue({ code: "custom", message: "Refresh the service category before saving" });
  });
export type FirmServiceInput = z.infer<typeof serviceInput>;

export const saveFirmServiceCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => serviceInput.parse(input))
  .handler(async ({ data, context }): Promise<FirmServiceCategory> => {
    await assertFirmMembership(context, data.firmId, true);
    const { firmId, id, version, ...fields } = data;
    const table = context.supabase.from("firm_service_categories" as never);
    const projection = "id,firm_id,name,is_active,version";
    if (!id) {
      const { data: created, error } = await table
        .insert({
          ...fields,
          firm_id: firmId,
          created_by: context.userId,
          updated_by: context.userId,
        } as never)
        .select(projection as never)
        .single();
      if (error) throw new Error(error.message);
      return created as FirmServiceCategory;
    }
    const { data: saved, error } = await table
      .update({ ...fields, updated_by: context.userId } as never)
      .eq("firm_id" as never, firmId as never)
      .eq("id" as never, id as never)
      .eq("version" as never, version! as never)
      .select(projection as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Service category changed. Refresh and retry.");
    return saved as FirmServiceCategory;
  });

export const listFirmCustomOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmScope.parse(input))
  .handler(async ({ data, context }): Promise<FirmCustomOnboardingStep[]> => {
    await assertFirmMembership(context, data.firmId, false);
    const { data: rows, error } = await context.supabase
      .from("firm_onboarding_template_steps" as never)
      .select(
        "firm_id,task_key,title,is_active,sort_order,due_in_days,reminders_enabled,version" as never,
      )
      .eq("firm_id" as never, data.firmId as never)
      .order("sort_order" as never)
      .order("task_key" as never)
      .limit(101);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 100) throw new Error("Firm onboarding templates exceed 100 steps");
    return (rows ?? []) as FirmCustomOnboardingStep[];
  });

const onboardingInput = firmScope
  .extend({
    task_key: z
      .string()
      .regex(/^custom_[0-9a-f]{32}$/)
      .optional(),
    version: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(180),
    is_active: z.boolean(),
    sort_order: z.number().int().min(0).max(10000),
    due_in_days: z.number().int().min(0).max(365).nullable(),
    reminders_enabled: z.boolean(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (Boolean(item.task_key) !== Boolean(item.version))
      ctx.addIssue({ code: "custom", message: "Refresh custom onboarding step before saving" });
  });
export type FirmCustomOnboardingInput = z.infer<typeof onboardingInput>;

export const saveFirmCustomOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => onboardingInput.parse(input))
  .handler(async ({ data, context }): Promise<FirmCustomOnboardingStep> => {
    await assertFirmMembership(context, data.firmId, true);
    const { firmId, task_key, version, ...fields } = data;
    const table = context.supabase.from("firm_onboarding_template_steps" as never);
    const projection =
      "firm_id,task_key,title,is_active,sort_order,due_in_days,reminders_enabled,version";
    if (!task_key) {
      const { data: created, error } = await table
        .insert({
          ...fields,
          firm_id: firmId,
          created_by: context.userId,
          updated_by: context.userId,
        } as never)
        .select(projection as never)
        .single();
      if (error) throw new Error(error.message);
      return created as FirmCustomOnboardingStep;
    }
    const { data: saved, error } = await table
      .update({ ...fields, updated_by: context.userId } as never)
      .eq("firm_id" as never, firmId as never)
      .eq("task_key" as never, task_key as never)
      .eq("version" as never, version! as never)
      .select(projection as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Checklist template changed. Refresh and retry.");
    return saved as FirmCustomOnboardingStep;
  });

export const applyFirmCustomOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    firmScope.extend({ companyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFirmMembership(context, data.firmId, true);
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: result, error } = await context.supabase.rpc(
      "apply_firm_onboarding_template" as never,
      { _firm_id: data.firmId, _company_id: data.companyId } as never,
    );
    if (error) throw new Error(error.message);
    return result as { added: number; available: number };
  });
