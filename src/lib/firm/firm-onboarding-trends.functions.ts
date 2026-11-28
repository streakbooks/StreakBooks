import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FirmOnboardingDailySnapshot = {
  firm_id: string;
  company_id: string;
  snapshot_date: string;
  total_steps: number;
  completed_steps: number;
  overdue_steps: number;
  unassigned_open_steps: number;
  blocked_steps: number;
};

export const firmOnboardingTrendInput = z
  .object({
    firmId: z.string().uuid(),
    days: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  })
  .strict();

export const listFirmOnboardingTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => firmOnboardingTrendInput.parse(input))
  .handler(async ({ data, context }): Promise<FirmOnboardingDailySnapshot[]> => {
    const sb = context.supabase;
    const { data: member, error: membershipError } = await sb
      .from("firm_members" as never)
      .select("id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    if (!member) throw new Error("Firm membership required");

    // The scheduled snapshots and comparison use UTC calendar days.
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - data.days + 1);
    const since = start.toISOString().slice(0, 10);
    const until = today.toISOString().slice(0, 10);
    const rows: FirmOnboardingDailySnapshot[] = [];
    const pageSize = 200;
    for (let page = 0; page <= 25; page++) {
      // Snapshot-level RLS rechecks independent company access and active links.
      const { data: batch, error } = await sb
        .from("firm_onboarding_daily_snapshots" as never)
        .select(
          "firm_id,company_id,snapshot_date,total_steps,completed_steps,overdue_steps,unassigned_open_steps,blocked_steps" as never,
        )
        .eq("firm_id" as never, data.firmId as never)
        .gte("snapshot_date" as never, since as never)
        .lte("snapshot_date" as never, until as never)
        .order("snapshot_date" as never, { ascending: false })
        .order("company_id" as never)
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      const pageRows = (batch ?? []) as FirmOnboardingDailySnapshot[];
      rows.push(...pageRows);
      if (rows.length > 5000)
        throw new Error("Historical report exceeds 5,000 rows. Use a shorter date range.");
      if (pageRows.length < pageSize) break;
    }
    return rows;
  });
