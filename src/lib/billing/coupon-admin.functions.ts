import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Coupon administration; the database requires an aal2 platform session and audits changes. */
type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

export type CouponRow = {
  code: string;
  name: string;
  kind: string;
  percent_bps: number;
  amount_minor: number;
  amount_currency: string | null;
  intervals: string;
  plan_codes: string[] | null;
  countries: string[] | null;
  starts_on: string | null;
  ends_on: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  per_account_limit: number | null;
  min_purchase_minor: number | null;
  min_purchase_currency: string | null;
  duration_type: string;
  duration_months: number | null;
  is_active: boolean;
  reserved: number;
  termsLocked: boolean;
  mappings: Array<{ provider: string; mode: string; currency: string; couponId: string }>;
};

const reason = z.string().trim().min(3).max(500);
const couponInput = z
  .object({
    code: z.string().trim().min(3).max(40),
    name: z.string().trim().max(120),
    kind: z.enum(["percent", "amount"]),
    percentBps: z.number().int().min(0).max(5000),
    amountMinor: z.number().int().min(0),
    amountCurrency: z.string().regex(/^([A-Z]{3})?$/),
    durationType: z.enum(["once", "repeating", "forever"]),
    durationMonths: z.number().int().min(1).max(36).nullable(),
    intervals: z.enum(["any", "month", "year"]),
    planCodes: z.array(z.string().regex(/^[a-z_]{2,40}$/)).max(20),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(250),
    startsOn: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    endsOn: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    maxRedemptions: z.number().int().min(1).nullable(),
    perAccountLimit: z.number().int().min(1).nullable(),
    minPurchaseMinor: z.number().int().min(1).nullable(),
    minPurchaseCurrency: z.string().regex(/^([A-Z]{3})?$/),
    active: z.boolean(),
    reason,
  })
  .strict();

export const getCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }) => (await callRpc(context.supabase, "platform_coupons")) as CouponRow[],
  );

export const saveCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => couponInput.parse(input))
  .handler(async ({ data, context }) => {
    const { reason: why, ...coupon } = data;
    await callRpc(context.supabase, "platform_save_coupon", {
      _data: {
        ...coupon,
        durationMonths: coupon.durationType === "repeating" ? coupon.durationMonths : null,
        minPurchaseCurrency: coupon.minPurchaseMinor ? coupon.minPurchaseCurrency : "",
      },
      _reason: why,
    });
    return { ok: true as const };
  });

export const linkProviderCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        code: z.string().trim().min(3).max(40),
        provider: z.enum(["stripe", "razorpay"]),
        mode: z.enum(["test", "live"]),
        couponId: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_-]{3,120}$/),
        reason,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_link_provider_coupon", {
      _code: data.code,
      _provider: data.provider,
      _mode: data.mode,
      _coupon_id: data.couponId,
      _reason: data.reason,
    });
    return { ok: true as const };
  });
