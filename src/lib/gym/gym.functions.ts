import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { companyIdOf, callRpc } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import {
  mapGymPortal,
  mapGymResult,
  mapGymStatement,
  mapGymWorkspace,
  type GymPortal,
  type GymResult,
  type GymStatement,
  type GymWorkspace,
} from "@/lib/gym/types";

export const GYM_MIGRATION =
  "Gym & Fitness Management needs database update 20261128380000 before this action can run.";

type Client = Parameters<typeof assertCompanyMember>[0];

async function guard(supabase: Client, companyId: string, permission: Permission) {
  await assertCompanyMember(supabase, companyId);
  await assertCompanyPermission(supabase, companyId, permission);
}

async function posted(
  supabase: Client,
  fn: string,
  args: Record<string, unknown>,
): Promise<GymResult> {
  return mapGymResult(await callRpc<unknown>(supabase, fn, args, GYM_MIGRATION));
}

export const getGymWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<GymWorkspace> => {
    await guard(context.supabase, data.companyId, "gym.view");
    return mapGymWorkspace(
      await callRpc<unknown>(
        context.supabase,
        "gym_workspace",
        { _company_id: data.companyId },
        GYM_MIGRATION,
      ),
    );
  });

export const getGymStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; memberId: string; from: string; to: string }) => ({
    companyId: companyIdOf(input),
    memberId: input.memberId,
    from: input.from,
    to: input.to,
  }))
  .handler(async ({ data, context }): Promise<GymStatement> => {
    await guard(context.supabase, data.companyId, "gym.view");
    return mapGymStatement(
      await callRpc<unknown>(
        context.supabase,
        "gym_member_statement",
        { _company_id: data.companyId, _member_id: data.memberId, _from: data.from, _to: data.to },
        GYM_MIGRATION,
      ),
    );
  });

export const getGymPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<GymPortal> => {
    await assertCompanyMember(context.supabase, data.companyId);
    return mapGymPortal(
      await callRpc<unknown>(
        context.supabase,
        "gym_my_portal",
        { _company_id: data.companyId },
        GYM_MIGRATION,
      ),
    );
  });

function payloadValidator(input: { companyId: string; payload: Record<string, unknown> }) {
  return { companyId: companyIdOf(input), payload: input.payload ?? {} };
}

export const saveGymSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.admin");
    return posted(context.supabase, "gym_upsert_settings", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const createGymBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.admin");
    return posted(context.supabase, "gym_create_branch", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const saveGymPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.plans.manage");
    return posted(context.supabase, "gym_save_plan", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const createGymMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.members.manage");
    return posted(context.supabase, "gym_create_member", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const activateGymMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.members.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "gym.post");
    return posted(context.supabase, "gym_activate_membership", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const recordGymReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.billing.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "gym.post");
    return posted(context.supabase, "gym_record_receipt", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const recogniseGymRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; asOf: string }) => ({
    companyId: companyIdOf(input),
    asOf: input.asOf,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.post");
    return posted(context.supabase, "gym_recognise_due", {
      _company_id: data.companyId,
      _as_of: data.asOf,
    });
  });

export const freezeGymMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.members.manage");
    return posted(context.supabase, "gym_freeze_membership", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const reactivateGymMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; membershipId: string }) => ({
    companyId: companyIdOf(input),
    membershipId: input.membershipId,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.members.manage");
    return posted(context.supabase, "gym_reactivate_membership", {
      _company_id: data.companyId,
      _membership_id: data.membershipId,
    });
  });

export const cancelGymMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.reverse");
    await assertCompanyPermission(context.supabase, data.companyId, "gym.post");
    return posted(context.supabase, "gym_cancel_membership", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const renewGymMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.members.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "gym.post");
    return posted(context.supabase, "gym_renew_membership", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const bookGymAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.schedule.manage");
    return posted(context.supabase, "gym_book_appointment", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const cancelGymAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; appointmentId: string }) => ({
    companyId: companyIdOf(input),
    appointmentId: input.appointmentId,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.schedule.manage");
    return posted(context.supabase, "gym_cancel_appointment", {
      _company_id: data.companyId,
      _appointment_id: data.appointmentId,
    });
  });

export const saveGymClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.schedule.manage");
    return posted(context.supabase, "gym_save_class", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const bookGymClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.schedule.manage");
    return posted(context.supabase, "gym_book_class", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const cancelGymBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; bookingId: string }) => ({
    companyId: companyIdOf(input),
    bookingId: input.bookingId,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.schedule.manage");
    return posted(context.supabase, "gym_cancel_booking", {
      _company_id: data.companyId,
      _booking_id: data.bookingId,
    });
  });

export const checkInGymMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.attendance.manage");
    return posted(context.supabase, "gym_check_in", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const saveGymTrainer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.trainers.manage");
    return posted(context.supabase, "gym_save_trainer", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const sellGymPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.billing.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "gym.post");
    return posted(context.supabase, "gym_sell_package", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const consumeGymSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.billing.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "gym.post");
    return posted(context.supabase, "gym_consume_session", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const approveGymCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; commissionId: string }) => ({
    companyId: companyIdOf(input),
    commissionId: input.commissionId,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.approve");
    await assertCompanyPermission(context.supabase, data.companyId, "gym.post");
    return posted(context.supabase, "gym_approve_commission", {
      _company_id: data.companyId,
      _commission_id: data.commissionId,
    });
  });

export const issueGymVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.billing.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "gym.post");
    return posted(context.supabase, "gym_issue_voucher", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const redeemGymVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.billing.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "gym.post");
    return posted(context.supabase, "gym_redeem_voucher", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const saveGymEquipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.manage");
    return posted(context.supabase, "gym_save_equipment", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const saveGymLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.manage");
    return posted(context.supabase, "gym_save_lead", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const convertGymLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "gym.members.manage");
    return posted(context.supabase, "gym_convert_lead", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });

export const saveGymBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payloadValidator)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "gym.admin");
    return posted(context.supabase, "gym_save_budget", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });
