import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { companyIdOf, callRpc } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import {
  mapNonprofitResult,
  mapNonprofitWorkspace,
  mapPortal,
  type NonprofitResult,
  type NonprofitWorkspace,
  type PortalEntry,
} from "@/lib/nonprofit/types";

export const NONPROFIT_MIGRATION =
  "Nonprofit Management needs database updates 20261128220000 and 20261128221000.";

async function posted(
  supabase: Parameters<typeof assertCompanyMember>[0],
  fn: string,
  args: Record<string, unknown>,
): Promise<NonprofitResult> {
  return mapNonprofitResult(await callRpc<unknown>(supabase, fn, args, NONPROFIT_MIGRATION));
}

async function guard(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  permission: Permission,
) {
  await assertCompanyMember(supabase, companyId);
  await assertCompanyPermission(supabase, companyId, permission);
}

export const getNonprofitWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<NonprofitWorkspace> => {
    await guard(context.supabase, data.companyId, "nonprofit.view");
    return mapNonprofitWorkspace(
      await callRpc<unknown>(
        context.supabase,
        "nonprofit_workspace",
        { _company_id: data.companyId },
        NONPROFIT_MIGRATION,
      ),
    );
  });

export const saveNonprofitSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; payload: Record<string, unknown> }) => ({
    companyId: companyIdOf(input),
    payload: input.payload,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.admin");
    return posted(context.supabase, "nonprofit_upsert_settings", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const createNonprofitFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; payload: Record<string, unknown> }) => ({
    companyId: companyIdOf(input),
    payload: input.payload,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.funds.manage");
    return posted(context.supabase, "nonprofit_create_fund", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const createNonprofitDonor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; payload: Record<string, unknown> }) => ({
    companyId: companyIdOf(input),
    payload: input.payload,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.donors.manage");
    return posted(context.supabase, "nonprofit_create_donor", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const submitNonprofitDonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; payload: Record<string, unknown> }) => ({
    companyId: companyIdOf(input),
    payload: input.payload,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.donations.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "nonprofit.post");
    return posted(context.supabase, "nonprofit_submit_donation", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const createNonprofitPledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; payload: Record<string, unknown> }) => ({
    companyId: companyIdOf(input),
    payload: input.payload,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.donations.manage");
    return posted(context.supabase, "nonprofit_create_pledge", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const createNonprofitGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; payload: Record<string, unknown> }) => ({
    companyId: companyIdOf(input),
    payload: input.payload,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.grants.approve");
    return posted(context.supabase, "nonprofit_create_grant", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const receiveNonprofitGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; grantId: string; amountMinor: number; on: string }) => ({
    companyId: companyIdOf(input),
    grantId: input.grantId,
    amountMinor: input.amountMinor,
    on: input.on,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.post");
    return posted(context.supabase, "nonprofit_receive_grant", {
      _company_id: data.companyId,
      _grant_id: data.grantId,
      _amount: data.amountMinor,
      _on: data.on,
    });
  });

export const satisfyNonprofitGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; grantId: string }) => ({
    companyId: companyIdOf(input),
    grantId: input.grantId,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.grants.approve");
    return posted(context.supabase, "nonprofit_satisfy_grant", {
      _company_id: data.companyId,
      _grant_id: data.grantId,
    });
  });

export const recogniseNonprofitGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; grantId: string; amountMinor: number; on: string }) => ({
    companyId: companyIdOf(input),
    grantId: input.grantId,
    amountMinor: input.amountMinor,
    on: input.on,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.post");
    return posted(context.supabase, "nonprofit_recognise_grant", {
      _company_id: data.companyId,
      _grant_id: data.grantId,
      _amount: data.amountMinor,
      _on: data.on,
    });
  });

export const postNonprofitExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; payload: Record<string, unknown> }) => ({
    companyId: companyIdOf(input),
    payload: input.payload,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.post");
    return posted(context.supabase, "nonprofit_post_expense", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const transferNonprofitFunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      fromFundId: string;
      toFundId: string;
      amountMinor: number;
      on: string;
    }) => ({
      companyId: companyIdOf(input),
      fromFundId: input.fromFundId,
      toFundId: input.toFundId,
      amountMinor: input.amountMinor,
      on: input.on,
    }),
  )
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.post");
    return posted(context.supabase, "nonprofit_transfer", {
      _company_id: data.companyId,
      _from: data.fromFundId,
      _to: data.toFundId,
      _amount: data.amountMinor,
      _on: data.on,
    });
  });

export const releaseNonprofitRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      fromFundId: string;
      toFundId: string;
      amountMinor: number;
      on: string;
    }) => ({
      companyId: companyIdOf(input),
      fromFundId: input.fromFundId,
      toFundId: input.toFundId,
      amountMinor: input.amountMinor,
      on: input.on,
    }),
  )
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.restrictions.release");
    return posted(context.supabase, "nonprofit_release", {
      _company_id: data.companyId,
      _from: data.fromFundId,
      _to: data.toFundId,
      _amount: data.amountMinor,
      _on: data.on,
    });
  });

export const createNonprofitRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; kind: string; payload: Record<string, unknown> }) => ({
    companyId: companyIdOf(input),
    kind: input.kind,
    payload: input.payload,
  }))
  .handler(async ({ data, context }) => {
    if (data.kind === "beneficiary") {
      await guard(context.supabase, data.companyId, "nonprofit.beneficiaries.view");
      await guard(context.supabase, data.companyId, "nonprofit.manage");
    } else {
      const permission: Permission =
        data.kind === "compliance" ? "nonprofit.compliance.manage" : "nonprofit.manage";
      await guard(context.supabase, data.companyId, permission);
    }
    return posted(context.supabase, "nonprofit_create_record", {
      _company_id: data.companyId,
      _kind: data.kind,
      _payload: data.payload,
    });
  });

export const getNonprofitPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalEntry[]> => {
    return mapPortal(
      await callRpc<unknown>(context.supabase, "nonprofit_my_portal", {}, NONPROFIT_MIGRATION),
    );
  });

export const grantNonprofitPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; payload: Record<string, unknown> }) => ({
    companyId: companyIdOf(input),
    payload: input.payload,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.portal.manage");
    return posted(context.supabase, "nonprofit_grant_portal", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });
