import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Payment operations for platform staff; the database requires an aal2 platform session. */
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

export type PaymentSettings = {
  routes: Array<{
    id: string;
    country: string | null;
    provider: "stripe" | "razorpay";
    enabled: boolean;
    priority: number;
  }>;
  billingCountries: string[];
  webhooks: Array<{
    id: string;
    provider: string;
    eventType: string;
    status: string;
    attempts: number;
    lastError: string | null;
    mode: string | null;
    receivedAt: string;
    processedAt: string | null;
  }>;
  webhookCounts: Record<string, number>;
};

const reason = z.string().trim().min(3).max(500);
const country = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/));

const routeInput = z
  .object({
    country: country.nullable(),
    provider: z.enum(["stripe", "razorpay"]),
    enabled: z.boolean(),
    priority: z.number().int().min(1).max(1000),
    reason,
  })
  .strict();
const countryInput = z.object({ country, enabled: z.boolean(), reason }).strict();
const requeueInput = z.object({ id: z.string().uuid(), reason }).strict();

export const getPaymentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }) =>
      (await callRpc(context.supabase, "platform_payment_settings")) as PaymentSettings,
  );

export const setProviderRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => routeInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_set_provider_route", {
      _country: data.country,
      _provider: data.provider,
      _enabled: data.enabled,
      _priority: data.priority,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

export const setCountryBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => countryInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_set_country_billing", {
      _country: data.country,
      _enabled: data.enabled,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

export const requeueWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requeueInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_requeue_webhook_event", {
      _id: data.id,
      _reason: data.reason,
    });
    return { ok: true as const };
  });
