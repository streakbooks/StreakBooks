import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type FirmPartnerTier = {
  tier_code: string;
  minimum_active_paid_clients: number;
  discount_bps: number;
  updated_at: string;
};

export const listFirmPartnerTiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FirmPartnerTier[]> => {
    const { data, error } = await context.supabase.rpc("firm_partner_tier_admin_list" as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as FirmPartnerTier[];
  });

export const saveFirmPartnerTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        tierCode: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z][a-z0-9_-]{1,31}$/),
        minimumActivePaidClients: z.number().int().min(0).max(1000000),
        discountBps: z.number().int().min(0).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "set_firm_partner_tier" as never,
      {
        _tier_code: data.tierCode,
        _minimum_active_paid_clients: data.minimumActivePaidClients,
        _discount_bps: data.discountBps,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { saved: true };
  });
