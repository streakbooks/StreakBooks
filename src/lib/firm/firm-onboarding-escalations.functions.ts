import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";

const scope = z.object({ firmId: z.string().uuid() }).strict();

export type FirmOnboardingEscalationPolicy = {
  firm_id: string;
  enabled: boolean;
  first_overdue_days: number;
  repeat_every_days: number;
  version: number;
};
export type FirmOnboardingEscalationEvent = {
  id: string;
  firm_id: string;
  company_id: string;
  task_key: string;
  recipient_user_id: string;
  escalated_on: string;
  overdue_days: number;
  policy_version: number;
  created_at: string;
};

async function assertFirmMember(
  context: { supabase: Parameters<typeof assertCompanyPermission>[0]; userId: string },
  firmId: string,
  requireAdmin: boolean,
) {
  const { data: member, error } = await context.supabase
    .from("firm_members" as never)
    .select("role" as never)
    .eq("firm_id" as never, firmId as never)
    .eq("user_id" as never, context.userId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) throw new Error("Firm membership required");
  if (requireAdmin && !["owner", "admin"].includes((member as { role: string }).role))
    throw new Error("Firm administrator access required");
}

export const listFirmOnboardingEscalationPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scope.parse(input))
  .handler(async ({ data, context }): Promise<FirmOnboardingEscalationPolicy | null> => {
    await assertFirmMember(context, data.firmId, false);
    const { data: policy, error } = await context.supabase
      .from("firm_onboarding_escalation_policies" as never)
      .select("firm_id,enabled,first_overdue_days,repeat_every_days,version" as never)
      .eq("firm_id" as never, data.firmId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (policy ?? null) as FirmOnboardingEscalationPolicy | null;
  });

export const saveFirmEscalationPolicyInput = scope
  .extend({
    expectedVersion: z.number().int().min(0),
    enabled: z.boolean(),
    firstOverdueDays: z.number().int().min(1).max(30),
    repeatEveryDays: z.number().int().min(1).max(30),
  })
  .strict();

export const saveFirmOnboardingEscalationPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveFirmEscalationPolicyInput.parse(input))
  .handler(async ({ data, context }): Promise<FirmOnboardingEscalationPolicy> => {
    await assertFirmMember(context, data.firmId, true);
    const values = {
      enabled: data.enabled,
      first_overdue_days: data.firstOverdueDays,
      repeat_every_days: data.repeatEveryDays,
      updated_by: context.userId,
    };
    const table = context.supabase.from("firm_onboarding_escalation_policies" as never);
    const projection = "firm_id,enabled,first_overdue_days,repeat_every_days,version";
    if (data.expectedVersion === 0) {
      const { data: created, error } = await table
        .insert({ firm_id: data.firmId, ...values } as never)
        .select(projection as never)
        .single();
      if (error) throw new Error("Policy changed. Refresh before retrying: " + error.message);
      return created as FirmOnboardingEscalationPolicy;
    }
    const { data: saved, error } = await table
      .update(values as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("version" as never, data.expectedVersion as never)
      .select(projection as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Escalation policy changed. Refresh and retry.");
    return saved as FirmOnboardingEscalationPolicy;
  });

export const listFirmOnboardingEscalationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scope.parse(input))
  .handler(async ({ data, context }): Promise<FirmOnboardingEscalationEvent[]> => {
    await assertFirmMember(context, data.firmId, true);
    // Record-level RLS requires an active linked client and accounting.view access.
    const { data: events, error } = await context.supabase
      .from("firm_onboarding_escalation_events" as never)
      .select(
        "id,firm_id,company_id,task_key,recipient_user_id,escalated_on,overdue_days,policy_version,created_at" as never,
      )
      .eq("firm_id" as never, data.firmId as never)
      .order("created_at" as never, { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (events ?? []) as FirmOnboardingEscalationEvent[];
  });
