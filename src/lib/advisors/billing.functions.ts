import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createCheckoutFor, parseCheckoutRequest } from "@/lib/billing/billing.functions";
import {
  mapAdvisorsSubscription,
  mapBillingBoard,
  type AdvisorsBillingBoard,
  type AdvisorsSubscription,
} from "@/lib/advisors/billing";
import { mapClient, type AdvisorsClient } from "@/lib/advisors/management";
import { requireCheckoutIdForAttach } from "@/lib/advisors/security-surface";

type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) {
    const message = error.message ?? "Advisors billing request failed.";
    if (
      message.includes("schema cache") ||
      message.includes("Could not find the function") ||
      message.includes("PGRST202")
    ) {
      throw new Error(
        "Advisors billing is not available in this database yet. Apply the Advisors SQL migrations (AD-07), then reload the API schema cache and try again.",
      );
    }
    throw new Error(message);
  }
  return data;
}

const reasonSchema = z.string().trim().min(3).max(500);

export const getAdvisorsBillingBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.string().trim().max(40).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .strict()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdvisorsBillingBoard> => {
    return mapBillingBoard(
      await callRpc(context.supabase, "platform_advisors_list_billing", {
        _status: data.status || null,
        _limit: data.limit ?? 100,
      }),
    );
  });

export const linkAdvisorsClientCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        companyId: z.string().uuid(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsClient> => {
    return mapClient(
      await callRpc(context.supabase, "platform_advisors_link_client_company", {
        _client_id: data.clientId,
        _company_id: data.companyId,
        _reason: data.reason,
      }),
    );
  });

export const prepareAdvisorsSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        engagementId: z.string().uuid(),
        interval: z.enum(["month", "year"]).optional(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsSubscription> => {
    return mapAdvisorsSubscription(
      await callRpc(context.supabase, "platform_advisors_prepare_subscription", {
        _engagement_id: data.engagementId,
        _interval: data.interval ?? null,
        _reason: data.reason,
      }),
    );
  });

export const syncAdvisorsSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ subscriptionId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsSubscription> => {
    return mapAdvisorsSubscription(
      await callRpc(context.supabase, "platform_advisors_sync_subscription", {
        _subscription_id: data.subscriptionId,
      }),
    );
  });

export const markAdvisorsManualBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        subscriptionId: z.string().uuid(),
        active: z.boolean(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsSubscription> => {
    return mapAdvisorsSubscription(
      await callRpc(context.supabase, "platform_advisors_mark_manual_billing", {
        _subscription_id: data.subscriptionId,
        _active: data.active,
        _reason: data.reason,
      }),
    );
  });

const checkoutSchema = z
  .object({
    subscriptionId: z.string().uuid(),
    companyId: z.string().uuid(),
    planCode: z.string().trim().min(3).max(80),
    interval: z.enum(["month", "year"]),
    method: z.enum(["card", "upi", "emandate"]),
    origin: z.string().url(),
    reason: reasonSchema,
    billing: z.object({
      email: z.string().trim().email(),
      firstName: z.string().trim().min(1).max(60),
      lastName: z.string().trim().min(1).max(60),
      company: z.string().trim().max(120).optional(),
      line1: z.string().trim().min(3).max(120),
      line2: z.string().trim().max(120).optional(),
      city: z.string().trim().min(2).max(80),
      state: z.string().trim().max(80).optional(),
      postalCode: z.string().trim().max(20).optional(),
      country: z.string().trim().length(2),
    }),
  })
  .strict();

export const startAdvisorsSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => checkoutSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Existing billing engine only — never invent payment success here.
    const billing = data.billing;
    const checkout = await createCheckoutFor(
      context,
      parseCheckoutRequest({
        companyId: data.companyId,
        planCode: data.planCode,
        interval: data.interval,
        method: data.method,
        origin: data.origin,
        offerCode: "",
        billing: {
          email: billing.email,
          firstName: billing.firstName,
          lastName: billing.lastName,
          line1: billing.line1,
          city: billing.city,
          country: billing.country,
          ...(billing.company ? { company: billing.company } : {}),
          ...(billing.line2 ? { line2: billing.line2 } : {}),
          ...(billing.state ? { state: billing.state } : {}),
          ...(billing.postalCode ? { postalCode: billing.postalCode } : {}),
        },
      }),
    );

    const checkoutId = requireCheckoutIdForAttach(checkout.checkoutId);

    await callRpc(context.supabase, "platform_advisors_attach_checkout", {
      _subscription_id: data.subscriptionId,
      _checkout_id: checkoutId,
      _reason: data.reason,
    });

    return checkout;
  });
