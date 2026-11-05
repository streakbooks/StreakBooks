import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUuid } from "@/lib/company-validation";
import { assertPriceFloor } from "@/lib/billing/provider-actions";
import { isBillingCurrency, isPlanCode } from "@/lib/billing/pricing";

export const savePlanVersionDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      planCode: string;
      currency: string;
      interval: string;
      amountMinor: number;
      reason: string;
    }) => {
      if (
        !isPlanCode(input?.planCode) ||
        !isBillingCurrency(input?.currency) ||
        !["month", "year"].includes(input?.interval)
      )
        throw new Error("Choose a supported plan, currency and interval.");
      assertPriceFloor(input.currency, input.interval as "month" | "year", input.amountMinor);
      return input;
    },
  )
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.rpc(
      "platform_price_action" as never,
      { _action: "draft", _payload: data, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    return result as { versionId: string; status: string; marginWarning: string | null };
  });
export const publishPlanVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string; reason: string; password?: string }) => ({
    versionId: assertUuid(input?.versionId),
    reason: input?.reason ?? "",
  }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc(
      "platform_price_action" as never,
      { _action: "publish", _payload: data, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, grandfathered: true as const };
  });
export const rollbackPlanVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planCode: string; reason: string; password?: string }) => {
    if (!isPlanCode(input?.planCode)) throw new Error("Choose a plan.");
    return { planCode: input.planCode, reason: input.reason };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc(
      "platform_price_action" as never,
      { _action: "rollback", _payload: data, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
