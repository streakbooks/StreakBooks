import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { companyIdOf, callRpc } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import {
  mapLedgerTie,
  mapRealEstateResult,
  mapRealEstateWorkspace,
  type RealEstateResult,
  type RealEstateWorkspace,
} from "@/lib/real-estate/types";

export const REAL_ESTATE_MIGRATION =
  "Real Estate Management needs database updates 20261128232000 through 20261128233000.";

type Supabase = Parameters<typeof assertCompanyMember>[0];

async function guard(supabase: Supabase, companyId: string, permission: Permission) {
  await assertCompanyMember(supabase, companyId);
  await assertCompanyPermission(supabase, companyId, permission);
}

function payloadOf(input: { companyId: string; payload?: Record<string, unknown> }) {
  const payload = input.payload ?? {};
  if (JSON.stringify(payload).length > 200000) throw new Error("That request is too large.");
  return { companyId: companyIdOf(input), payload };
}

async function posted(
  supabase: Supabase,
  fn: string,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<RealEstateResult> {
  return mapRealEstateResult(
    await callRpc<unknown>(
      supabase,
      fn,
      { _company_id: companyId, _payload: payload },
      REAL_ESTATE_MIGRATION,
    ),
  );
}

export const getRealEstateWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<RealEstateWorkspace> => {
    await guard(context.supabase, data.companyId, "realestate.view");
    return mapRealEstateWorkspace(
      await callRpc<unknown>(
        context.supabase,
        "realestate_workspace",
        { _company_id: data.companyId },
        REAL_ESTATE_MIGRATION,
      ),
    );
  });

export const getRealEstateLedgerTie = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "realestate.view");
    return mapLedgerTie(
      await callRpc<unknown>(
        context.supabase,
        "realestate_ledger_tie",
        { _company_id: data.companyId },
        REAL_ESTATE_MIGRATION,
      ),
    );
  });

function command(permission: Permission, fn: string) {
  return createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator(payloadOf)
    .handler(async ({ data, context }) => {
      await guard(context.supabase, data.companyId, permission);
      return posted(context.supabase, fn, data.companyId, data.payload);
    });
}

export const saveRealEstateSettings = command("realestate.admin", "realestate_upsert_settings");
export const createRealEstateProject = command("realestate.manage", "realestate_create_project");
export const createRealEstatePhase = command("realestate.manage", "realestate_create_phase");
export const createRealEstateStructure = command(
  "realestate.manage",
  "realestate_create_structure",
);
export const createRealEstateLevel = command("realestate.manage", "realestate_create_level");
export const createRealEstateUnit = command(
  "realestate.inventory.manage",
  "realestate_create_unit",
);
export const importRealEstateUnits = command(
  "realestate.inventory.manage",
  "realestate_import_units",
);
export const repriceRealEstateUnit = command(
  "realestate.inventory.manage",
  "realestate_reprice_unit",
);
export const transitionRealEstateUnit = command(
  "realestate.inventory.manage",
  "realestate_transition_unit",
);
export const placeRealEstateHold = command("realestate.sales.manage", "realestate_place_hold");
export const releaseRealEstateHold = command("realestate.sales.manage", "realestate_release_hold");
export const confirmRealEstateBooking = command(
  "realestate.sales.manage",
  "realestate_confirm_booking",
);
export const advanceRealEstateSale = command("realestate.sales.manage", "realestate_advance_sale");
export const saveRealEstatePlan = command("realestate.sales.manage", "realestate_save_plan");
export const cancelRealEstateSale = command("realestate.sales.manage", "realestate_cancel_sale");
export const createRealEstateBroker = command(
  "realestate.commissions.manage",
  "realestate_create_broker",
);
export const saveRealEstateCommissionRule = command(
  "realestate.commissions.manage",
  "realestate_save_commission_rule",
);
export const suggestRealEstateCommission = command(
  "realestate.commissions.manage",
  "realestate_suggest_commission",
);
export const recordRealEstateCost = command("realestate.costs.manage", "realestate_record_cost");
export const saveRealEstateBudget = command("realestate.budgets.manage", "realestate_save_budget");

export const expireRealEstateHolds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "realestate.sales.manage");
    return mapRealEstateResult(
      await callRpc<unknown>(
        context.supabase,
        "realestate_expire_holds",
        { _company_id: data.companyId },
        REAL_ESTATE_MIGRATION,
      ),
    );
  });

export const collectRealEstate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadOf)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "realestate.collections.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "realestate.post");
    return posted(context.supabase, "realestate_collect", data.companyId, data.payload);
  });

export const refundRealEstate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadOf)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "realestate.reverse");
    await assertCompanyPermission(context.supabase, data.companyId, "realestate.post");
    return posted(context.supabase, "realestate_refund", data.companyId, data.payload);
  });

export const recogniseRealEstate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadOf)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "realestate.post");
    await assertCompanyPermission(context.supabase, data.companyId, "realestate.approve");
    return posted(context.supabase, "realestate_recognise", data.companyId, data.payload);
  });

export const reverseRealEstateRecognition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadOf)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "realestate.reverse");
    await assertCompanyPermission(context.supabase, data.companyId, "realestate.post");
    return posted(context.supabase, "realestate_reverse_recognition", data.companyId, data.payload);
  });

export const approveRealEstateCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadOf)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "realestate.approve");
    return posted(context.supabase, "realestate_approve_commission", data.companyId, data.payload);
  });

export const postRealEstateCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadOf)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "realestate.post");
    return posted(context.supabase, "realestate_post_commission", data.companyId, data.payload);
  });

export const approveRealEstateBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadOf)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "realestate.approve");
    return posted(context.supabase, "realestate_approve_budget", data.companyId, data.payload);
  });
