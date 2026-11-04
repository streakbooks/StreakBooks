import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUuid } from "@/lib/company-validation";
import { callSalesRpc, requireRpc, type SalesClient } from "@/lib/sales/rpc";

const MIGRATION = "20261031170000_customer_supplier_portals.sql";

type PortalJson = null | boolean | number | string | PortalJson[] | { [key: string]: PortalJson };

async function rpc<T = PortalJson>(
  supabase: SalesClient,
  name: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return requireRpc(await callSalesRpc<T>(supabase, name, payload), name, MIGRATION);
}

function membershipInput(input: { membershipId?: string }) {
  return { membershipId: assertUuid(input?.membershipId, "portal") };
}

function origin(): string {
  const request = getRequest();
  if (!request?.url) return "";
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export const listPortalAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => rpc<PortalJson[]>(context.supabase, "portal_my_access", {}));

export const acceptPortalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token?: string }) => {
    const token = (input?.token ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("This invitation link is not valid");
    return { token };
  })
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "accept_portal_invite", { token: data.token }),
  );

export const getPortalHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(membershipInput)
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_home", { membership_id: data.membershipId }),
  );

export const listPortalInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { membershipId?: string; q?: string; status?: string; page?: number }) => ({
      ...membershipInput(input),
      q: (input.q ?? "").slice(0, 80),
      status: ["all", "open", "paid", "void", "overdue"].includes(input.status ?? "")
        ? input.status
        : "all",
      page: Math.max(1, Math.floor(Number(input.page) || 1)),
    }),
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_list_invoices", {
      membership_id: data.membershipId,
      q: data.q,
      status: data.status,
      page: data.page,
    }),
  );

export const getPortalInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { membershipId?: string; invoiceId?: string }) => ({
    ...membershipInput(input),
    invoiceId: assertUuid(input?.invoiceId, "invoice"),
  }))
  .handler(async ({ data, context }) => {
    const invoice = await rpc<Record<string, PortalJson>>(context.supabase, "portal_get_invoice", {
      membership_id: data.membershipId,
      invoice_id: data.invoiceId,
    });
    const { checkoutModeFor } = await import("@/lib/portals/portal-payments.server");
    // Public capability only. Credentials and payment authorization stay server-side.
    const checkout = checkoutModeFor(Boolean(invoice["allow_sandbox"]));
    return { ...invoice, checkout_mode: checkout.mode, checkout_live: checkout.livemode };
  });

export const listPortalCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(membershipInput)
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_list_credits", { membership_id: data.membershipId }),
  );

export const getPortalStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { membershipId?: string; from?: string; to?: string }) => ({
    ...membershipInput(input),
    from: /^\d{4}-\d{2}-\d{2}$/.test(input.from ?? "") ? input.from : null,
    to: /^\d{4}-\d{2}-\d{2}$/.test(input.to ?? "") ? input.to : null,
  }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_statement", {
      membership_id: data.membershipId,
      from: data.from,
      to: data.to,
    }),
  );

export const listPortalReceipts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(membershipInput)
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_list_receipts", { membership_id: data.membershipId }),
  );

export const startPortalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      membershipId?: string;
      invoiceId?: string;
      amountMinor?: number;
      idempotencyKey?: string;
    }) => {
      const amount = Math.floor(Number(input?.amountMinor));
      const key = (input?.idempotencyKey ?? "").trim();
      if (!Number.isInteger(amount) || amount <= 0)
        throw new Error("Enter a payment amount greater than zero.");
      if (!/^[A-Za-z0-9:_-]{8,80}$/.test(key)) throw new Error("Payment reference is invalid.");
      return {
        ...membershipInput(input),
        invoiceId: assertUuid(input?.invoiceId, "invoice"),
        amountMinor: amount,
        idempotencyKey: key,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { checkoutModeFor, createProviderCheckout } =
      await import("@/lib/portals/portal-payments.server");
    const invoice = await rpc<{
      allow_sandbox?: boolean;
      settlement_ready?: boolean;
      invoice?: { invoice_number?: string | null; currency_code?: string };
      company_name?: string;
    }>(context.supabase, "portal_get_invoice", {
      membership_id: data.membershipId,
      invoice_id: data.invoiceId,
    });
    const mode = checkoutModeFor(Boolean(invoice.allow_sandbox));
    if (mode.mode === "instructions") {
      return { mode: "instructions" as const, livemode: false, url: null };
    }
    const created = await rpc<{
      intent_id: string;
      amount_minor: number;
      currency: string;
      invoice_number: string | null;
      company_name: string;
      status: string;
    }>(context.supabase, "portal_create_payment_intent", {
      membership_id: data.membershipId,
      invoice_id: data.invoiceId,
      amount_minor: data.amountMinor,
      idempotency_key: data.idempotencyKey,
    });
    const checkout = await createProviderCheckout(mode.mode, {
      origin: origin(),
      intentId: created.intent_id,
      invoiceId: data.invoiceId,
      invoiceNumber: created.invoice_number ?? invoice.invoice?.invoice_number ?? null,
      amountMinor: Number(created.amount_minor),
      currency: created.currency,
      companyName: created.company_name ?? invoice.company_name ?? "LinkBooks",
    });
    await rpc(context.supabase, "portal_attach_provider", {
      membership_id: data.membershipId,
      intent_id: created.intent_id,
      provider: checkout.provider,
      provider_session_id: checkout.sessionId,
    });
    return {
      mode: mode.mode,
      livemode: mode.livemode,
      url: checkout.url,
      intentId: created.intent_id,
    };
  });

export const completeSandboxPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { membershipId?: string; intentId?: string }) => ({
    ...membershipInput(input),
    intentId: assertUuid(input?.intentId, "payment"),
  }))
  .handler(async ({ data, context }) => {
    const claimed = await rpc<{ intent_id: string; amount_minor: number; currency: string }>(
      context.supabase,
      "portal_claim_sandbox",
      { membership_id: data.membershipId, intent_id: data.intentId },
    );
    const { settlePortalPayment } = await import("@/lib/portals/portal-payments.server");
    return settlePortalPayment({
      provider: "linkbooks_sandbox",
      provider_event_id: `sandbox:${claimed.intent_id}`,
      event_type: "paid",
      intent_id: claimed.intent_id,
      amount_minor: Number(claimed.amount_minor),
      currency: claimed.currency,
      fee_minor: 0,
    });
  });

export const getSupplierWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(membershipInput)
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_supplier_workspace", { membership_id: data.membershipId }),
  );

export const submitSupplierDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      membershipId?: string;
      kind?: string;
      supplierReference?: string;
      documentDate?: string;
      dueDate?: string;
      currencyCode?: string;
      purchaseOrderId?: string;
      memo?: string;
      lines?: Array<{
        description?: string;
        quantity?: number;
        unitPriceMinor?: number;
        taxRateBps?: number;
      }>;
    }) => {
      if (input.kind !== "bill" && input.kind !== "credit_note")
        throw new Error("Choose a bill or a credit note");
      const lines = (input.lines ?? []).slice(0, 40).map((line) => ({
        description: (line.description ?? "").trim().slice(0, 500),
        quantity: Number(line.quantity),
        unit_price_minor: Math.floor(Number(line.unitPriceMinor)),
        tax_rate_bps: Math.floor(Number(line.taxRateBps ?? 0)),
      }));
      if (!lines.length) throw new Error("Add at least one line");
      return {
        ...membershipInput(input),
        kind: input.kind,
        supplierReference: (input.supplierReference ?? "").trim().slice(0, 80),
        documentDate: input.documentDate ?? "",
        dueDate: input.dueDate ?? "",
        currencyCode: (input.currencyCode ?? "").toUpperCase(),
        purchaseOrderId: input.purchaseOrderId ? assertUuid(input.purchaseOrderId, "order") : null,
        memo: (input.memo ?? "").slice(0, 500),
        lines,
      };
    },
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_submit_supplier_document", {
      membership_id: data.membershipId,
      kind: data.kind,
      supplier_reference: data.supplierReference,
      document_date: data.documentDate,
      due_date: data.dueDate || null,
      currency_code: data.currencyCode,
      purchase_order_id: data.purchaseOrderId,
      memo: data.memo,
      lines: data.lines,
    }),
  );

export const acknowledgePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { membershipId?: string; orderId?: string; note?: string }) => ({
    ...membershipInput(input),
    orderId: assertUuid(input?.orderId, "order"),
    note: (input.note ?? "").slice(0, 500),
  }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_acknowledge_order", {
      membership_id: data.membershipId,
      order_id: data.orderId,
      note: data.note,
    }),
  );

export const requestBankChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      membershipId?: string;
      accountName?: string;
      bankName?: string;
      accountNumber?: string;
      routingCode?: string;
      countryCode?: string;
    }) => ({
      ...membershipInput(input),
      accountName: (input.accountName ?? "").trim(),
      bankName: (input.bankName ?? "").trim(),
      accountNumber: (input.accountNumber ?? "").trim(),
      routingCode: (input.routingCode ?? "").trim(),
      countryCode: (input.countryCode ?? "").trim().toUpperCase(),
    }),
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_request_bank_change", {
      membership_id: data.membershipId,
      account_name: data.accountName,
      bank_name: data.bankName,
      account_number: data.accountNumber,
      routing_code: data.routingCode,
      country_code: data.countryCode,
    }),
  );

export const listPortalFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { membershipId?: string; companyId?: string; contactId?: string }) => {
    if (input.membershipId)
      return {
        membershipId: assertUuid(input.membershipId, "portal"),
        companyId: null,
        contactId: null,
      };
    return {
      membershipId: null,
      companyId: assertUuid(input.companyId, "company"),
      contactId: assertUuid(input.contactId, "contact"),
    };
  })
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_list_files", {
      membership_id: data.membershipId,
      company_id: data.companyId,
      contact_id: data.contactId,
    }),
  );

export const uploadPortalFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      membershipId?: string;
      companyId?: string;
      contactId?: string;
      fileName?: string;
      mimeType?: string;
      category?: string;
      contentBase64?: string;
      submissionId?: string;
    }) => ({
      membershipId: input.membershipId ? assertUuid(input.membershipId, "portal") : null,
      companyId: input.companyId ? assertUuid(input.companyId, "company") : null,
      contactId: input.contactId ? assertUuid(input.contactId, "contact") : null,
      fileName: (input.fileName ?? "document").slice(0, 180),
      mimeType: input.mimeType ?? "",
      category: input.category ?? "general",
      contentBase64: input.contentBase64 ?? "",
      submissionId: input.submissionId ? assertUuid(input.submissionId, "submission") : null,
    }),
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_upload_file", {
      membership_id: data.membershipId,
      company_id: data.companyId,
      contact_id: data.contactId,
      file_name: data.fileName,
      mime_type: data.mimeType,
      category: data.category,
      content_base64: data.contentBase64,
      submission_id: data.submissionId,
    }),
  );

export const downloadPortalFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { membershipId?: string; companyId?: string; fileId?: string }) => ({
    membershipId: input.membershipId ? assertUuid(input.membershipId, "portal") : null,
    companyId: input.companyId ? assertUuid(input.companyId, "company") : null,
    fileId: assertUuid(input?.fileId, "file"),
  }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_download_file", {
      membership_id: data.membershipId,
      company_id: data.companyId,
      file_id: data.fileId,
    }),
  );

export const listPortalMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { membershipId?: string; companyId?: string; contactId?: string }) => ({
    membershipId: input.membershipId ? assertUuid(input.membershipId, "portal") : null,
    companyId: input.companyId ? assertUuid(input.companyId, "company") : null,
    contactId: input.contactId ? assertUuid(input.contactId, "contact") : null,
  }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_list_messages", {
      membership_id: data.membershipId,
      company_id: data.companyId,
      contact_id: data.contactId,
    }),
  );

export const postPortalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      membershipId?: string;
      companyId?: string;
      contactId?: string;
      body?: string;
      invoiceId?: string;
    }) => ({
      membershipId: input.membershipId ? assertUuid(input.membershipId, "portal") : null,
      companyId: input.companyId ? assertUuid(input.companyId, "company") : null,
      contactId: input.contactId ? assertUuid(input.contactId, "contact") : null,
      body: (input.body ?? "").trim(),
      invoiceId: input.invoiceId ? assertUuid(input.invoiceId, "invoice") : null,
    }),
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_post_message", {
      membership_id: data.membershipId,
      company_id: data.companyId,
      contact_id: data.contactId,
      body: data.body,
      invoice_id: data.invoiceId,
    }),
  );

export const listPortalNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { membershipId?: string; markRead?: boolean }) => ({
    ...membershipInput(input),
    markRead: Boolean(input.markRead),
  }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_list_notifications", {
      membership_id: data.membershipId,
      mark_read: data.markRead,
    }),
  );

export const getPortalSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "get_portal_settings", { company_id: data.companyId }),
  );

export const savePortalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId?: string;
      settlementAccountId?: string | null;
      settlementUserId?: string | null;
      feeExpenseAccountId?: string | null;
      defaultPurchaseAccountId?: string | null;
      allowSandbox?: boolean;
      requireMfa?: boolean;
      inviteDays?: number;
    }) => ({
      companyId: assertUuid(input?.companyId),
      settlementAccountId: input.settlementAccountId
        ? assertUuid(input.settlementAccountId, "account")
        : null,
      settlementUserId: input.settlementUserId ? assertUuid(input.settlementUserId, "user") : null,
      feeExpenseAccountId: input.feeExpenseAccountId
        ? assertUuid(input.feeExpenseAccountId, "account")
        : null,
      defaultPurchaseAccountId: input.defaultPurchaseAccountId
        ? assertUuid(input.defaultPurchaseAccountId, "account")
        : null,
      allowSandbox: Boolean(input.allowSandbox),
      requireMfa: Boolean(input.requireMfa),
      inviteDays: Math.min(90, Math.max(1, Math.floor(Number(input.inviteDays) || 14))),
    }),
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "save_portal_settings", {
      company_id: data.companyId,
      settlement_account_id: data.settlementAccountId,
      settlement_user_id: data.settlementUserId,
      fee_expense_account_id: data.feeExpenseAccountId,
      default_purchase_account_id: data.defaultPurchaseAccountId,
      allow_sandbox: data.allowSandbox,
      require_mfa: data.requireMfa,
      invite_days: data.inviteDays,
    }),
  );

export const invitePortalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId?: string;
      contactId?: string;
      role?: string;
      email?: string;
      mfaRequired?: boolean;
    }) => {
      if (input.role !== "customer" && input.role !== "supplier")
        throw new Error("Choose customer or supplier");
      return {
        companyId: assertUuid(input.companyId),
        contactId: assertUuid(input.contactId, "contact"),
        role: input.role,
        email: (input.email ?? "").trim(),
        mfaRequired: Boolean(input.mfaRequired),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const invited = await rpc<{
      token: string;
      email: string;
      role: string;
      expires_at: string;
      is_demo: boolean;
    }>(context.supabase, "invite_portal_user", {
      company_id: data.companyId,
      contact_id: data.contactId,
      role: data.role,
      email: data.email,
      mfa_required: data.mfaRequired,
    });
    const link = `${origin()}/portal/invite/${invited.token}`;
    const emailed = await sendPortalMail(context.supabase, {
      companyId: data.companyId,
      isDemo: invited.is_demo,
      to: invited.email,
      subject: "Your LinkBooks portal invitation",
      text: `You have been invited to the ${invited.role} portal. Open this link to accept: ${link}`,
      entityType: "contact",
      entityId: data.contactId,
      template: "portal_invite",
    });
    return { ...invited, link, emailed };
  });

export const revokePortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string; membershipId?: string }) => ({
    companyId: assertUuid(input?.companyId),
    membershipId: assertUuid(input?.membershipId, "portal"),
  }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "revoke_portal_access", {
      company_id: data.companyId,
      membership_id: data.membershipId,
    }),
  );

export const listContactPortalAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string; contactId?: string }) => ({
    companyId: assertUuid(input?.companyId),
    contactId: assertUuid(input?.contactId, "contact"),
  }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "list_contact_portal_access", {
      company_id: data.companyId,
      contact_id: data.contactId,
    }),
  );

export const listStaffSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "staff_list_portal_submissions", { company_id: data.companyId }),
  );

export const decideStaffSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId?: string; submissionId?: string; decision?: string; reason?: string }) => {
      if (input.decision !== "approve" && input.decision !== "reject")
        throw new Error("Choose approve or reject");
      return {
        companyId: assertUuid(input.companyId),
        submissionId: assertUuid(input.submissionId, "submission"),
        decision: input.decision,
        reason: (input.reason ?? "").slice(0, 500),
      };
    },
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "staff_decide_portal_submission", {
      company_id: data.companyId,
      submission_id: data.submissionId,
      decision: data.decision,
      reason: data.reason,
    }),
  );

export const listBankRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "staff_list_bank_requests", { company_id: data.companyId }),
  );

export const decideBankRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId?: string; requestId?: string; decision?: string; note?: string }) => {
      if (input.decision !== "approve" && input.decision !== "reject")
        throw new Error("Choose approve or reject");
      return {
        companyId: assertUuid(input.companyId),
        requestId: assertUuid(input.requestId, "request"),
        decision: input.decision,
        note: (input.note ?? "").slice(0, 500),
      };
    },
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "staff_decide_bank_request", {
      company_id: data.companyId,
      request_id: data.requestId,
      decision: data.decision,
      note: data.note,
    }),
  );

export const deliverInvoiceToPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string; invoiceId?: string }) => ({
    companyId: assertUuid(input?.companyId),
    invoiceId: assertUuid(input?.invoiceId, "invoice"),
  }))
  .handler(async ({ data, context }) => {
    const delivered = await rpc<{
      email: string;
      is_demo: boolean;
      invoice_number: string | null;
      currency: string;
      due_minor: number;
      company_name: string;
    }>(context.supabase, "deliver_invoice_to_portal", {
      company_id: data.companyId,
      invoice_id: data.invoiceId,
    });
    const emailed = await sendPortalMail(context.supabase, {
      companyId: data.companyId,
      isDemo: delivered.is_demo,
      to: delivered.email,
      subject: `Invoice ${delivered.invoice_number ?? ""} from ${delivered.company_name}`,
      text: `${delivered.company_name} delivered an invoice to your portal. Sign in at ${origin()}/portal/login to view it.`,
      entityType: "sales_invoice",
      entityId: data.invoiceId,
      template: "invoice",
    });
    return { ...delivered, emailed };
  });

export const runPortalReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }) => {
    const result = await rpc<{
      is_demo: boolean;
      company_name: string;
      reminders: Array<{
        invoice_id: string;
        invoice_number: string | null;
        email: string;
        currency: string;
        due_minor: number;
      }>;
    }>(context.supabase, "run_portal_reminders", { company_id: data.companyId });
    let emailed = 0;
    for (const reminder of result.reminders ?? []) {
      const sent = await sendPortalMail(context.supabase, {
        companyId: data.companyId,
        isDemo: result.is_demo,
        to: reminder.email,
        subject: `Reminder: invoice ${reminder.invoice_number ?? ""} from ${result.company_name}`,
        text: `Invoice ${reminder.invoice_number ?? ""} is overdue. Sign in at ${origin()}/portal/login to view it and pay.`,
        entityType: "sales_invoice",
        entityId: reminder.invoice_id,
        template: "reminder",
      });
      if (sent.sent) emailed += 1;
    }
    return {
      count: result.reminders?.length ?? 0,
      emailed,
      email: result.reminders?.length ? undefined : "No reminders were due.",
    };
  });

export const listPortalAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_list_alerts", { company_id: data.companyId }),
  );

export const resolvePortalAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string; alertId?: string }) => ({
    companyId: assertUuid(input?.companyId),
    alertId: assertUuid(input?.alertId, "alert"),
  }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "portal_resolve_alert", {
      company_id: data.companyId,
      alert_id: data.alertId,
    }),
  );

export const retryPortalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string; intentId?: string }) => ({
    companyId: assertUuid(input?.companyId),
    intentId: assertUuid(input?.intentId, "payment"),
  }))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "retry_portal_payment_post", {
      company_id: data.companyId,
      intent_id: data.intentId,
    }),
  );

async function sendPortalMail(
  supabase: SalesClient,
  input: {
    companyId: string;
    isDemo: boolean;
    to: string;
    subject: string;
    text: string;
    entityType: string;
    entityId: string;
    template: string;
  },
): Promise<{ sent: boolean; reason: string }> {
  if (input.isDemo) return { sent: false, reason: "demo" };
  const { readEmailConfig, sendViaResend } = await import("@/lib/documents/email-provider.server");
  const config = readEmailConfig();
  if (!config.configured) return { sent: false, reason: "not_configured" };
  const result = await sendViaResend(config, {
    to: [input.to],
    subject: input.subject,
    text: input.text,
    html: `<p>${input.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`,
  });
  await callSalesRpc(supabase, "record_email_outbox", {
    company_id: input.companyId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    template: input.template,
    to: [input.to],
    subject: input.subject,
    provider: "resend",
    provider_message_id: result.ok ? result.messageId : null,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
  });
  return result.ok ? { sent: true, reason: "sent" } : { sent: false, reason: "failed" };
}
