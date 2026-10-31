import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { readEmailConfig, sendViaResend } from "@/lib/documents/email-provider.server";
import { escapeHtml } from "@/lib/documents/email-templates";
import { configuredSender, loadCommunicationConfig } from "@/lib/notifications/communication-settings.server";
import { inQuietHours } from "@/lib/notifications/communication-rules";

type Db = Parameters<typeof assertCompanyMember>[0];
type HistoryRow = {
  id: string; template: string; to_addresses: string[]; subject: string;
  status: "sent" | "failed"; error: string | null; created_at: string;
  provider_message_id: string | null;
};
type AlertRow = { title: string; body: string; priority: string; target_path: string | null };

async function companyInfo(db: Db, companyId: string) {
  const { data, error } = await db.from("companies" as never)
    .select("name,is_demo,timezone" as never)
    .eq("id" as never, companyId as never).single();
  if (error) throw new Error(error.message);
  return data as { name: string; is_demo: boolean; timezone: string };
}

async function currentRecipient(db: Db): Promise<string> {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user?.email) throw new Error("Your account has no verified email address for delivery");
  // Supabase Auth is authoritative for the recipient; never accept a to-address from a browser.
  if (!data.user.email_confirmed_at) throw new Error("Verify your account email before requesting messages");
  return data.user.email;
}

async function recentCompanyEmailHistory(db: Db, companyId: string): Promise<HistoryRow[]> {
  const { data, error } = await db.from("email_outbox" as never)
    .select("id,template,to_addresses,subject,status,error,created_at,provider_message_id" as never)
    .eq("company_id" as never, companyId as never)
    .eq("entity_type" as never, "company" as never)
    .order("created_at" as never, { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as HistoryRow[];
}

async function recordCompanyEmail(db: Db, info: {
  companyId: string; template: "notification_test" | "notification_digest";
  recipient: string; subject: string; status: "sent" | "failed";
  providerMessageId: string | null; error: string | null;
}) {
  const { error } = await db.rpc("record_email_outbox" as never, {
    payload: {
      company_id: info.companyId,
      entity_type: "company",
      entity_id: info.companyId,
      template: info.template,
      to: [info.recipient],
      subject: info.subject,
      provider: "resend",
      provider_message_id: info.providerMessageId,
      status: info.status,
      error: info.error,
    },
  } as never);
  // Do not silently claim an audited delivery when no audit row exists.
  if (error) throw new Error("Email provider responded, but delivery history could not be recorded: " + error.message);
}

async function claimSend(db: Db, companyId: string, kind: "test_email" | "digest_manual") {
  const { data, error } = await db.rpc("claim_communication_send" as never, {
    _company_id: companyId, _kind: kind,
  } as never);
  if (error) throw new Error(error.message);
  if (!data) throw new Error(kind === "test_email"
    ? "A test email was already attempted within the last five minutes."
    : "A digest was already attempted within this hour.");
}

/** Truthful provider status. Does not expose keys or claim that an untested domain is verified. */
export const getCommunicationsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const [company, destination] = await Promise.all([
      companyInfo(context.supabase, data.companyId),
      currentRecipient(context.supabase).catch(() => null),
    ]);
    const cfg = readEmailConfig();
    const { data: perm } = await context.supabase.rpc("has_company_permission" as never, {
      _company_id: data.companyId, _permission: "company.settings.edit",
    } as never);
    const canEdit = Boolean(perm);
    let history: HistoryRow[] = [];
    if (canEdit) history = await recentCompanyEmailHistory(context.supabase, data.companyId);
    return {
      configured: cfg.configured,
      provider: "resend" as const,
      verifiedSender: cfg.configured ? cfg.from : null,
      missingConfiguration: cfg.configured ? [] : cfg.missing,
      demoBlocked: company.is_demo,
      recipient: destination,
      canEdit,
      userId: context.userId,
      timezone: company.timezone || "UTC",
      history,
      // Readiness is NOT delivery verification. A successful real test is required.
      recentSuccessfulTest: history.find((r) => r.template === "notification_test" && r.status === "sent")?.created_at ?? null,
    };
  });

export const sendCommunicationsTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    await assertCompanyPermission(db, data.companyId, "company.settings.edit");
    const company = await companyInfo(db, data.companyId);
    // Safe in Demo Company: test messages go ONLY to the current verified account email.
    // Demo invoices/customer digests remain blocked.
    const cfg = readEmailConfig();
    if (!cfg.configured) throw new Error("Email provider is not configured: " + cfg.missing.join(", "));
    const destination = await currentRecipient(db);
    const saved = await loadCommunicationConfig(db, data.companyId);
    const sender = configuredSender(cfg.from, saved);
    await claimSend(db, data.companyId, "test_email");
    const subject = `LinkBooks email configuration test — ${company.name}`;
    const text = `This is a test of LinkBooks email delivery for ${company.name}. No financial records have been changed.`;
    const html = `<p>${escapeHtml(text)}</p>`;
    const result = await sendViaResend({ ...cfg, from: sender.from }, {
      to: [destination], subject, text, html, replyTo: sender.replyTo,
    });
    await recordCompanyEmail(db, {
      companyId: data.companyId, template: "notification_test",
      recipient: destination, subject, status: result.ok ? "sent" : "failed",
      providerMessageId: result.ok ? result.messageId : null,
      error: result.ok ? null : result.error,
    });
    if (!result.ok) throw new Error("Provider rejected test email: " + result.error);
    return { accepted: true, providerMessageId: result.messageId, recipient: destination };
  });

export const sendCommunicationsDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    await assertCompanyPermission(db, data.companyId, "company.settings.edit");
    const company = await companyInfo(db, data.companyId);
    if (company.is_demo) throw new Error("The demo company cannot send messages to real recipients.");
    const cfg = readEmailConfig();
    if (!cfg.configured) throw new Error("Email provider is not configured: " + cfg.missing.join(", "));
    const saved = await loadCommunicationConfig(db, data.companyId);
    if (inQuietHours(saved, company.timezone || "UTC")) {
      throw new Error("Digest delivery is paused by this organisation's quiet hours.");
    }
    const destination = await currentRecipient(db);
    // Query with the authenticated user's Supabase connection, preserving RLS and category preferences.
    const { data: rows, error } = await db.from("action_notifications" as never)
      .select("title,body,priority,target_path" as never)
      .eq("company_id" as never, data.companyId as never)
      .is("archived_at" as never, null)
      .is("resolved_at" as never, null)
      .order("created_at" as never, { ascending: false }).limit(25);
    if (error) throw new Error(error.message);
    const alerts = (rows ?? []) as AlertRow[];
    if (alerts.length === 0) throw new Error("There are no outstanding actionable notifications to send.");
    await claimSend(db, data.companyId, "digest_manual");
    const sender = configuredSender(cfg.from, saved);
    const subject = `LinkBooks action summary — ${company.name} (${alerts.length} items)`;
    const list = alerts.map((item, i) => `${i + 1}. [${item.priority.toUpperCase()}] ${item.title}\n${item.body}`);
    const text = `Outstanding LinkBooks actions for ${company.name}:\n\n${list.join("\n\n")}\n\nSign in to LinkBooks to review or act. Financial actions are never performed by this email.`;
    const html = `<h2>LinkBooks action summary — ${escapeHtml(company.name)}</h2><ol>${
      alerts.map((a) => `<li><strong>${escapeHtml(a.title)}</strong> (${escapeHtml(a.priority)})<p>${escapeHtml(a.body)}</p></li>`).join("")
    }</ol><p>Sign in to LinkBooks to review or act. This email never approves or posts financial documents.</p>`;
    const result = await sendViaResend({ ...cfg, from: sender.from }, {
      to: [destination], subject, html, text, replyTo: sender.replyTo,
    });
    await recordCompanyEmail(db, {
      companyId: data.companyId, template: "notification_digest",
      recipient: destination, subject, status: result.ok ? "sent" : "failed",
      providerMessageId: result.ok ? result.messageId : null,
      error: result.ok ? null : result.error,
    });
    if (!result.ok) throw new Error("Provider rejected digest: " + result.error);
    return { accepted: true, providerMessageId: result.messageId, recipient: destination, count: alerts.length };
  });
