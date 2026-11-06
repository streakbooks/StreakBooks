import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FirmStaffCapacity = {
  user_id: string;
  max_open_steps: number;
  version: number;
};

export type FirmWorkloadContext = {
  viewerId: string;
  canManage: boolean;
  staff: Array<{
    user_id: string;
    display_name: string;
    max_open_steps: number;
    version: number;
  }>;
};

const firmInput = z.object({ firmId: z.string().uuid() }).strict();

export const listFirmOnboardingWorkloadContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmInput.parse(input))
  .handler(async ({ data, context }): Promise<FirmWorkloadContext> => {
    const sb = context.supabase;
    const { data: viewer, error: viewerError } = await sb
      .from("firm_members" as never)
      .select("role" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (viewerError) throw new Error(viewerError.message);
    if (!viewer) throw new Error("Firm membership required");
    const canManage = ["owner", "admin"].includes((viewer as { role: string }).role);
    const { data: memberships, error: membersError } = await sb
      .from("firm_members" as never)
      .select("user_id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .limit(201);
    if (membersError) throw new Error(membersError.message);
    if ((memberships ?? []).length > 200)
      throw new Error("Staff directory exceeds the 200-person workload limit");

    const staffIds = canManage
      ? (memberships ?? []).map((member) => (member as { user_id: string }).user_id)
      : [context.userId];
    if (!staffIds.length) return { viewerId: context.userId, canManage, staff: [] };
    const [capacityResult, profilesResult] = await Promise.all([
      sb
        .from("firm_onboarding_staff_capacity" as never)
        .select("user_id,max_open_steps,version" as never)
        .eq("firm_id" as never, data.firmId as never)
        .in("user_id" as never, staffIds as never),
      sb.from("profiles").select("id,full_name,email").in("id", staffIds),
    ]);
    if (capacityResult.error || profilesResult.error)
      throw new Error(capacityResult.error?.message ?? profilesResult.error?.message);
    const configured = new Map(
      ((capacityResult.data ?? []) as FirmStaffCapacity[]).map((row) => [row.user_id, row]),
    );
    const names = new Map(
      (profilesResult.data ?? []).map((profile) => [
        profile.id,
        profile.full_name || profile.email || "Firm colleague",
      ]),
    );
    return {
      viewerId: context.userId,
      canManage,
      staff: staffIds.map((id) => ({
        user_id: id,
        display_name: names.get(id) ?? "Firm colleague",
        max_open_steps: configured.get(id)?.max_open_steps ?? 20,
        version: configured.get(id)?.version ?? 0,
      })),
    };
  });

export const saveFirmOnboardingCapacityInput = firmInput.extend({
  userId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  maxOpenSteps: z.number().int().min(1).max(200),
}).strict();

export const saveFirmOnboardingCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveFirmOnboardingCapacityInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: member, error: memberError } = await sb
      .from("firm_members" as never)
      .select("role" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member || !["owner", "admin"].includes((member as { role: string }).role))
      throw new Error("Firm administrator access required");

    const projection = "user_id,max_open_steps,version";
    if (data.expectedVersion === 0) {
      const { data: created, error } = await sb
        .from("firm_onboarding_staff_capacity" as never)
        .insert({
          firm_id: data.firmId,
          user_id: data.userId,
          max_open_steps: data.maxOpenSteps,
          updated_by: context.userId,
        } as never)
        .select(projection as never)
        .single();
      if (error) throw new Error("Staff workload changed. Refresh and retry: " + error.message);
      return created as FirmStaffCapacity;
    }
    const { data: saved, error } = await sb
      .from("firm_onboarding_staff_capacity" as never)
      .update({ max_open_steps: data.maxOpenSteps, updated_by: context.userId } as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, data.userId as never)
      .eq("version" as never, data.expectedVersion as never)
      .select(projection as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Staff workload changed. Refresh and retry.");
    return saved as FirmStaffCapacity;
  });
