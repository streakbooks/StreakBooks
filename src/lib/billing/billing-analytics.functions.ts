import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Billing analytics; the database requires an aal2 platform session with billing.view. */
type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type BillingAnalytics = {
  range: { from: string; to: string };
  generatedAt: string;
  subscriptions: {
    byStatus: Record<string, number>;
    byPlan: Record<string, number>;
    byCountry: Record<string, number>;
  };
  mrr: Array<{ currency: string; mrrMinor: number; arrMinor: number; subscriptions: number }>;
  movements: Array<{ currency: string; movement: string; count: number; deltaMinor: number }>;
  lastMrrCapture: string | null;
  revenue: Array<{
    currency: string;
    invoices: number;
    grossMinor: number;
    netMinor: number;
    taxMinor: number;
    discountMinor: number;
    creditNotes: number;
    creditedMinor: number;
    creditedNetMinor: number;
    creditedTaxMinor: number;
    refundsMinor: number;
  }>;
  lifecycle: {
    trialsStarted: number;
    trialsExpired: number;
    activations: number;
    renewals: number;
    failedPayments: number;
    cancellationsRequested: number;
    cancellationsReversed: number;
    cancelled: number;
    cancellationReasons: Record<string, number>;
  };
  coupons: Array<{ code: string; redemptions: number }>;
  partners: {
    activeReferrals: number;
    commission: Array<{
      currency: string;
      accruedMinor: number;
      reversedMinor: number;
      adjustedMinor: number;
      paidOutMinor: number;
    }>;
  };
  webhooks: { received: number; backlog: number; dead: number; oldestBacklogAt: string | null };
  invoicesPending: number;
};

export const getBillingAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string().datetime(), to: z.string().datetime() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: snapshot, error } = await (context.supabase as unknown as RpcClient).rpc(
      "platform_billing_analytics" as never,
      { _from: data.from, _to: data.to } as never,
    );
    if (error) throw new Error(error.message);
    return snapshot as BillingAnalytics;
  });
