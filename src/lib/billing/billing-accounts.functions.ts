import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  billingAccountSchema,
  companyInput,
  updateBillingProfileInput,
  type BillingAccount,
} from "@/lib/billing/billing-accounts";

/**
 * Billing account server functions. Every call runs as the signed-in user; the SECURITY
 * DEFINER database functions re-check billing permissions, MFA and tenant membership, so a
 * client-supplied account or company id is never trusted on its own.
 */
type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function callRpc(
  client: RpcClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

export const listMyBillingAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingAccount[]> => {
    const data = await callRpc(context.supabase as unknown as RpcClient, "billing_my_accounts");
    return z.array(billingAccountSchema).parse(data ?? []);
  });

export const getCompanyBillingAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => companyInput.parse(input))
  .handler(async ({ data, context }): Promise<BillingAccount> => {
    const result = await callRpc(
      context.supabase as unknown as RpcClient,
      "billing_account_for_company",
      {
        _company_id: data.companyId,
      },
    );
    return billingAccountSchema.parse(result);
  });

export const updateBillingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateBillingProfileInput.parse(input))
  .handler(async ({ data, context }): Promise<BillingAccount> => {
    const result = await callRpc(
      context.supabase as unknown as RpcClient,
      "billing_update_account_profile",
      {
        _account_id: data.accountId,
        _profile: data.profile,
        _expected_updated_at: data.expectedUpdatedAt,
      },
    );
    return billingAccountSchema.parse(result);
  });

export const switchToIndividualBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => companyInput.parse(input))
  .handler(async ({ data, context }): Promise<BillingAccount> => {
    const result = await callRpc(
      context.supabase as unknown as RpcClient,
      "billing_use_individual_account",
      {
        _company_id: data.companyId,
      },
    );
    return billingAccountSchema.parse(result);
  });

export const switchToOrganizationBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => companyInput.parse(input))
  .handler(async ({ data, context }): Promise<BillingAccount> => {
    const result = await callRpc(
      context.supabase as unknown as RpcClient,
      "billing_use_organization_account",
      {
        _company_id: data.companyId,
      },
    );
    return billingAccountSchema.parse(result);
  });
