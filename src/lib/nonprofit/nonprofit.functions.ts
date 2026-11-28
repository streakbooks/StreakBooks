import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { companyIdOf, callRpc } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import { donorStatementDelivery, donorStatementText } from "@/lib/nonprofit/donor-statement";
import {
  mapNonprofitDonorStatement,
  mapNonprofitResult,
  mapNonprofitStatement,
  mapNonprofitWorkspace,
  mapPortal,
  mapPortalDonorStatements,
  type DonorStatement,
  type NonprofitResult,
  type NonprofitStatement,
  type NonprofitWorkspace,
  type PortalDonorStatement,
  type PortalEntry,
} from "@/lib/nonprofit/types";

export const NONPROFIT_MIGRATION =
  "Nonprofit Management needs database updates 20261128220000, 20261128221000, 20261128233000, 20261128240000, 20261128250000 and 20261128260000.";

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

export const postNonprofitMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      kind: string;
      fundId: string;
      amountMinor: number;
      currencyCode: string;
      on: string;
      idempotencyKey: string;
    }) => ({
      companyId: companyIdOf(input),
      kind: input.kind,
      fundId: input.fundId,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
      on: input.on,
      idempotencyKey: input.idempotencyKey,
    }),
  )
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.post");
    const fx = data.kind === "fx_settlement";
    return posted(context.supabase, "nonprofit_post_movement", {
      _company_id: data.companyId,
      _payload: {
        kind: data.kind,
        fund_id: data.fundId,
        on: data.on,
        currency_code: data.currencyCode,
        idempotency_key: data.idempotencyKey,
        ...(fx ? { difference_minor: data.amountMinor } : { amount_minor: data.amountMinor }),
      },
    });
  });

export const impairNonprofitPledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; pledgeId: string; amountMinor: number; on: string }) => ({
    companyId: companyIdOf(input),
    pledgeId: input.pledgeId,
    amountMinor: input.amountMinor,
    on: input.on,
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.post");
    return posted(context.supabase, "nonprofit_impair_pledge", {
      _company_id: data.companyId,
      _pledge_id: data.pledgeId,
      _amount: data.amountMinor,
      _on: data.on,
    });
  });

export const allocateNonprofitExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      expenseId: string;
      functionalClass: string;
      amountMinor: number;
      on: string;
      idempotencyKey: string;
    }) => ({
      companyId: companyIdOf(input),
      expenseId: input.expenseId,
      functionalClass: input.functionalClass,
      amountMinor: input.amountMinor,
      on: input.on,
      idempotencyKey: input.idempotencyKey,
    }),
  )
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.allocations.manage");
    await assertCompanyPermission(context.supabase, data.companyId, "nonprofit.post");
    return posted(context.supabase, "nonprofit_allocate_expense", {
      _company_id: data.companyId,
      _expense_id: data.expenseId,
      _class: data.functionalClass,
      _amount: data.amountMinor,
      _on: data.on,
      _key: data.idempotencyKey,
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

export const requestNonprofitDisbursement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; beneficiaryId: string; fundId: string; amountMinor: number }) => ({
      companyId: companyIdOf(input),
      beneficiaryId: input.beneficiaryId,
      fundId: input.fundId,
      amountMinor: input.amountMinor,
    }),
  )
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.beneficiaries.view");
    await assertCompanyPermission(context.supabase, data.companyId, "nonprofit.manage");
    return posted(context.supabase, "nonprofit_request_disbursement", {
      _company_id: data.companyId,
      _payload: {
        beneficiary_id: data.beneficiaryId,
        fund_id: data.fundId,
        amount_minor: data.amountMinor,
      },
    });
  });

export const decideNonprofitDisbursement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; disbursementId: string; decision: string; on: string }) => ({
      companyId: companyIdOf(input),
      disbursementId: input.disbursementId,
      decision: input.decision,
      on: input.on,
    }),
  )
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.disbursements.approve");
    if (data.decision === "posted") {
      await assertCompanyPermission(context.supabase, data.companyId, "nonprofit.post");
    }
    return posted(context.supabase, "nonprofit_decide_disbursement", {
      _company_id: data.companyId,
      _disbursement_id: data.disbursementId,
      _decision: data.decision,
      _on: data.on,
    });
  });

function statementDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be a calendar date`);
  }
  return value;
}

export const getNonprofitStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; from: string; asOf: string }) => ({
    companyId: companyIdOf(input),
    from: statementDate(input.from, "The statement start"),
    asOf: statementDate(input.asOf, "The statement as-of date"),
  }))
  .handler(async ({ data, context }): Promise<NonprofitStatement> => {
    await guard(context.supabase, data.companyId, "nonprofit.view");
    return mapNonprofitStatement(
      await callRpc<unknown>(
        context.supabase,
        "nonprofit_fund_statement",
        { _company_id: data.companyId, _from: data.from, _as_of: data.asOf },
        NONPROFIT_MIGRATION,
      ),
    );
  });

function donorIdOf(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("Choose a donor or the consolidated statement");
  return value;
}

async function donorStatement(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  from: string,
  asOf: string,
  donorId: string | null,
): Promise<DonorStatement> {
  return mapNonprofitDonorStatement(
    await callRpc<unknown>(
      supabase,
      "nonprofit_donor_statement",
      { _company_id: companyId, _from: from, _as_of: asOf, _donor_id: donorId },
      NONPROFIT_MIGRATION,
    ),
  );
}

export const getNonprofitDonorStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; from: string; asOf: string; donorId: string | null }) => ({
      companyId: companyIdOf(input),
      from: statementDate(input.from, "The statement start"),
      asOf: statementDate(input.asOf, "The statement as-of date"),
      donorId: donorIdOf(input.donorId),
    }),
  )
  .handler(async ({ data, context }): Promise<DonorStatement> => {
    await guard(context.supabase, data.companyId, "nonprofit.view");
    return donorStatement(context.supabase, data.companyId, data.from, data.asOf, data.donorId);
  });

export const recordNonprofitDonorStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; from: string; asOf: string; donorId: string | null }) => ({
      companyId: companyIdOf(input),
      from: statementDate(input.from, "The statement start"),
      asOf: statementDate(input.asOf, "The statement as-of date"),
      donorId: donorIdOf(input.donorId),
    }),
  )
  .handler(async ({ data, context }): Promise<DonorStatement> => {
    await guard(context.supabase, data.companyId, "nonprofit.export");
    return mapNonprofitDonorStatement(
      await callRpc<unknown>(
        context.supabase,
        "nonprofit_record_donor_statement",
        {
          _company_id: data.companyId,
          _from: data.from,
          _as_of: data.asOf,
          _donor_id: data.donorId,
          _delivery_status: "not_requested",
        },
        NONPROFIT_MIGRATION,
      ),
    );
  });

export const recordNonprofitDonorStatements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; from: string; asOf: string }) => ({
    companyId: companyIdOf(input),
    from: statementDate(input.from, "The statement start"),
    asOf: statementDate(input.asOf, "The statement as-of date"),
  }))
  .handler(async ({ data, context }) => {
    await guard(context.supabase, data.companyId, "nonprofit.export");
    const value = await callRpc<unknown>(
      context.supabase,
      "nonprofit_record_donor_statements",
      { _company_id: data.companyId, _from: data.from, _as_of: data.asOf },
      NONPROFIT_MIGRATION,
    );
    const generated =
      value !== null && typeof value === "object" && "generated" in value
        ? Number((value as { generated: unknown }).generated)
        : 0;
    return {
      generated: Number.isSafeInteger(generated) ? generated : 0,
      email_delivery: "not_configured" as const,
      statutory_filing: false as const,
      tax_certificate: false as const,
    };
  });

export const deliverNonprofitDonorStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; from: string; asOf: string; donorId: string }) => ({
    companyId: companyIdOf(input),
    from: statementDate(input.from, "The statement start"),
    asOf: statementDate(input.asOf, "The statement as-of date"),
    donorId: donorIdOf(input.donorId),
  }))
  .handler(async ({ data, context }): Promise<DonorStatement> => {
    await guard(context.supabase, data.companyId, "nonprofit.export");
    if (!data.donorId) throw new Error("Choose one donor before emailing a statement");
    const preview = await donorStatement(
      context.supabase,
      data.companyId,
      data.from,
      data.asOf,
      data.donorId,
    );
    const { readEmailConfig, sendViaResend } =
      await import("@/lib/documents/email-provider.server");
    const config = readEmailConfig();
    const decision = donorStatementDelivery({
      requested: true,
      emailConfigured: config.configured,
      consent: preview.donor?.consent_status ?? null,
      email: preview.donor?.email ?? null,
      anonymous: preview.donor?.anonymous === true,
    });
    let status: "not_configured" | "withheld" | "sent" | "failed" =
      decision === "withheld" ? "withheld" : "not_configured";
    const recipient = preview.donor?.email ?? null;
    if (decision === "ready" && config.configured && recipient && preview.donor) {
      const lines = preview.currencies.map((row) => ({
        label: "Net recognised gifts",
        currency: row.currency_code,
        amountMinor: row.net_minor,
      }));
      const text = donorStatementText({
        organisationName: preview.organisation.name,
        donorName: preview.donor.display_name,
        periodFrom: preview.period_from,
        asOf: preview.as_of,
        wording: preview.wording,
        lines,
      });
      const sent = await sendViaResend(config, {
        to: [recipient],
        subject: `Donor statement ${preview.period_from} to ${preview.as_of}`,
        html: `<pre>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
        text,
      });
      status = sent.ok ? "sent" : "failed";
    }
    return mapNonprofitDonorStatement(
      await callRpc<unknown>(
        context.supabase,
        "nonprofit_record_donor_statement",
        {
          _company_id: data.companyId,
          _from: data.from,
          _as_of: data.asOf,
          _donor_id: data.donorId,
          _delivery_status: status,
        },
        NONPROFIT_MIGRATION,
      ),
    );
  });

export const getMyNonprofitDonorStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { from: string; asOf: string }) => ({
    from: statementDate(input.from, "The statement start"),
    asOf: statementDate(input.asOf, "The statement as-of date"),
  }))
  .handler(async ({ data, context }): Promise<PortalDonorStatement[]> => {
    return mapPortalDonorStatements(
      await callRpc<unknown>(
        context.supabase,
        "nonprofit_my_donor_statement",
        { _from: data.from, _as_of: data.asOf },
        NONPROFIT_MIGRATION,
      ),
    );
  });
