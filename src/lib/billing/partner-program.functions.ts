import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clientAddressHash } from "@/lib/billing/client-address.server";
import { partnerPayoutsSwitchOn } from "@/lib/billing/domain/partners";

/**
 * CA partner programme. The database checks every permission, the two-person rules and the
 * payouts flag; payouts additionally need PARTNER_PAYOUTS_ENABLED=true on the server.
 */
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

export type PartnerBalance = {
  currency: string;
  pendingMinor: number;
  availableMinor: number;
  inPayoutMinor: number;
  paidOutMinor: number;
};

export type PartnerSummary = {
  id: string;
  name: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  firmId: string | null;
  firmName: string | null;
  contactEmail: string | null;
  countryCode: string | null;
  membershipReference: string | null;
  verificationEvidence: string | null;
  appliedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type ReferralStatus = {
  programOpen: boolean;
  attribution: {
    partnerName: string;
    attributedAt: string;
    locked: boolean;
    status: string;
  } | null;
  disclosure: { id: string; title: string; body: string; version: number } | null;
};

export type PartnerPortal = {
  program: {
    open: boolean;
    attributionModel: string;
    attributionWindowDays: number | null;
    payoutsEnabled: boolean;
  };
  firms: Array<{ id: string; name: string; applied: boolean }>;
  partners: Array<
    PartnerSummary & {
      role: "admin" | "member";
      codes: Array<{ id: string; code: string; status: string; createdAt: string }>;
      referrals: Array<{
        companyName: string;
        attributedAt: string;
        locked: boolean;
        status: string;
      }>;
      balances: PartnerBalance[];
      entries: Array<{
        id: number;
        type: string;
        amountMinor: number;
        currency: string;
        basisMinor: number | null;
        availableAt: string;
        memo: string | null;
        createdAt: string;
        companyName: string | null;
      }>;
      payouts: Array<{
        id: string;
        currency: string;
        amountMinor: number;
        status: string;
        requestedAt: string;
        paidAt: string | null;
        paymentReference: string | null;
      }>;
    }
  >;
};

export type CommissionRule = {
  id: string;
  name: string;
  partnerId: string | null;
  partnerName: string | null;
  kind: "percent" | "fixed";
  percentBps: number | null;
  fixedMinor: number | null;
  fixedCurrency: string | null;
  planCodes: string[] | null;
  countries: string[] | null;
  durationMonths: number | null;
  holdDays: number;
  minPayoutMinor: number;
  minPayoutCurrency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "draft" | "approved" | "retired";
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  reason: string;
};

export type PartnerProgramAdminData = {
  program: {
    attributionModel: string;
    attributionWindowDays: number | null;
    payoutsEnabled: boolean;
    regulatoryReviewReference: string | null;
    updatedAt: string;
  };
  changes: Array<{
    id: string;
    change: Record<string, string | number | boolean | null>;
    reason: string;
    status: "pending" | "applied" | "rejected";
    requestedBy: string;
    decidedBy: string | null;
    decisionReason: string | null;
    createdAt: string;
  }>;
  partners: Array<
    PartnerSummary & { referrals: number; codes: number; balances: PartnerBalance[] }
  >;
  rules: CommissionRule[];
  payouts: Array<{
    id: string;
    partnerId: string;
    partnerName: string;
    currency: string;
    amountMinor: number;
    status: string;
    requestedBy: string;
    requestedAt: string;
    approvedBy: string | null;
    paidAt: string | null;
    paymentReference: string | null;
  }>;
  viewer: string;
  payoutSwitchOn: boolean;
};

const uuid = z.string().uuid();
const reason = z.string().trim().min(3).max(500);

// ---------------------------------------------------------------- customers
export const getReferralStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: uuid }).strict().parse(input))
  .handler(
    async ({ data, context }) =>
      (await callRpc(context.supabase, "billing_referral_status", {
        _company_id: data.companyId,
      })) as ReferralStatus,
  );

export const recordReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: uuid,
        code: z.string().trim().min(6).max(24),
        disclosureId: uuid,
        accepted: z.literal(true),
      })
      .strict()
      .parse(input),
  )
  .handler(
    async ({ data, context }) =>
      (await callRpc(context.supabase, "billing_record_referral", {
        _company_id: data.companyId,
        _code: data.code,
        _disclosure_id: data.disclosureId,
        _ip_hash: await clientAddressHash(),
      })) as { result: "attributed" | "kept" | "already_attributed"; partnerName: string },
  );

// ---------------------------------------------------------------- partners
export const getPartnerPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }) =>
      (await callRpc(context.supabase, "billing_partner_portal")) as PartnerPortal,
  );

export const applyAsPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        firmId: uuid,
        contactEmail: z.string().trim().email().max(200),
        countryCode: z.string().regex(/^[A-Z]{2}$/),
        membershipReference: z.string().trim().max(60),
        termsId: uuid,
        accepted: z.literal(true),
      })
      .strict()
      .parse(input),
  )
  .handler(
    async ({ data, context }) =>
      (await callRpc(context.supabase, "billing_partner_apply", {
        _firm_id: data.firmId,
        _contact_email: data.contactEmail,
        _country: data.countryCode,
        _membership_reference: data.membershipReference,
        _terms_id: data.termsId,
        _ip_hash: await clientAddressHash(),
      })) as PartnerSummary,
  );

export const createReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ partnerId: uuid }).strict().parse(input))
  .handler(
    async ({ data, context }) =>
      (await callRpc(context.supabase, "billing_partner_create_code", {
        _partner_id: data.partnerId,
      })) as { id: string; code: string; status: string },
  );

export const disableReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ codeId: uuid }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "billing_partner_disable_code", { _code_id: data.codeId });
    return { ok: true };
  });

// ---------------------------------------------------------------- platform
export const getPartnerProgramAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const data = (await callRpc(context.supabase, "platform_partner_program")) as Omit<
      PartnerProgramAdminData,
      "payoutSwitchOn"
    >;
    return {
      ...data,
      payoutSwitchOn: partnerPayoutsSwitchOn(process.env),
    } as PartnerProgramAdminData;
  });

export const reviewPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        partnerId: uuid,
        decision: z.enum(["approve", "reject", "suspend"]),
        evidence: z.string().trim().max(1000),
        reason,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_review_partner", {
      _id: data.partnerId,
      _decision: data.decision,
      _evidence: data.evidence || null,
      _reason: data.reason,
    });
    return { ok: true };
  });

export const addPartnerUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        partnerId: uuid,
        email: z.string().trim().email().max(200),
        role: z.enum(["admin", "member"]),
        reason,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_add_partner_user", {
      _partner_id: data.partnerId,
      _email: data.email,
      _role: data.role,
      _reason: data.reason,
    });
    return { ok: true };
  });

const ruleInput = z
  .object({
    id: uuid.nullable(),
    name: z.string().trim().min(2).max(80),
    partnerId: uuid.nullable(),
    kind: z.enum(["percent", "fixed"]),
    percentBps: z.number().int().min(1).max(10000).nullable(),
    fixedMinor: z.number().int().min(1).nullable(),
    fixedCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    planCodes: z.array(z.string().regex(/^[a-z_]{2,40}$/)).max(20),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(250),
    durationMonths: z.number().int().min(1).max(120).nullable(),
    holdDays: z.number().int().min(0).max(365),
    minPayoutMinor: z.number().int().min(0),
    minPayoutCurrency: z.string().regex(/^[A-Z]{3}$/),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effectiveTo: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    reason,
  })
  .strict();

export const saveCommissionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ruleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { reason: why, ...rule } = data;
    return (await callRpc(context.supabase, "platform_save_commission_rule", {
      _data: rule,
      _reason: why,
    })) as CommissionRule;
  });

export const decideCommissionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ruleId: uuid,
        action: z.enum(["approve", "retire"]),
        effectiveTo: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
        reason,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.action === "approve") {
      await callRpc(context.supabase, "platform_approve_commission_rule", {
        _id: data.ruleId,
        _reason: data.reason,
      });
    } else {
      await callRpc(context.supabase, "platform_retire_commission_rule", {
        _id: data.ruleId,
        _effective_to: data.effectiveTo || null,
        _reason: data.reason,
      });
    }
    return { ok: true };
  });

export const requestProgramChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        change: z
          .object({
            attributionModel: z.enum(["last_touch", "first_touch"]).optional(),
            attributionWindowDays: z.number().int().min(1).max(730).nullable().optional(),
            payoutsEnabled: z.boolean().optional(),
            regulatoryReviewReference: z.string().trim().max(200).optional(),
          })
          .strict()
          .refine((change) => Object.keys(change).length > 0, "Describe a change"),
        reason,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_request_partner_program_change", {
      _change: data.change,
      _reason: data.reason,
    });
    return { ok: true };
  });

export const decideProgramChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ changeId: uuid, approve: z.boolean(), reason }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_decide_partner_program_change", {
      _id: data.changeId,
      _approve: data.approve,
      _reason: data.reason,
    });
    return { ok: true };
  });

function requirePayoutSwitch() {
  if (!partnerPayoutsSwitchOn(process.env)) {
    throw new Error("Partner payouts are switched off on this server");
  }
}

export const requestPartnerPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ partnerId: uuid, currency: z.string().regex(/^[A-Z]{3}$/), reason })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    requirePayoutSwitch();
    return (await callRpc(context.supabase, "platform_request_partner_payout", {
      _partner_id: data.partnerId,
      _currency: data.currency,
      _reason: data.reason,
    })) as { id: string; amountMinor: number; currency: string; status: string };
  });

export const decidePartnerPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        payoutId: uuid,
        decision: z.enum(["approve", "mark_paid", "cancel"]),
        reference: z.string().trim().max(120),
        reason,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.decision !== "cancel") requirePayoutSwitch();
    await callRpc(context.supabase, "platform_decide_partner_payout", {
      _id: data.payoutId,
      _decision: data.decision,
      _reference: data.reference || null,
      _reason: data.reason,
    });
    return { ok: true };
  });

export const adjustPartnerCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        partnerId: uuid,
        currency: z.string().regex(/^[A-Z]{3}$/),
        amountMinor: z
          .number()
          .int()
          .refine((value) => value !== 0, "Enter a non-zero amount"),
        reason: z.string().trim().min(10).max(500),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_adjust_partner_commission", {
      _partner_id: data.partnerId,
      _company_id: null,
      _currency: data.currency,
      _amount_minor: data.amountMinor,
      _reason: data.reason,
    });
    return { ok: true };
  });
