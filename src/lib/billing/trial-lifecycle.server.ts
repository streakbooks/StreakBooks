/**
 * Durable trial reminder delivery. Claimed jobs come from SQL; email uses Resend
 * via the shared provider helper; in-app uses action_notifications.
 */
import { sendViaResend, readEmailConfig } from "@/lib/documents/email-provider.server";
import {
  formatTrialExpiryCopy,
  remainingTrialDays,
  type TrialReminderKind,
} from "@/lib/billing/trial-lifecycle";

type Admin = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (table: never) => unknown;
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

async function rpc<T>(client: Admin, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

type ClaimedReminder = {
  id: string;
  company_id: string;
  kind: TrialReminderKind;
  trial_ends_at: string;
  due_at: string;
  idempotency_key: string;
  attempts: number;
  email_enabled?: boolean;
  inapp_enabled?: boolean;
};

export async function ensureAndProcessTrialReminders(limit = 20): Promise<{
  ensured: number;
  processed: number;
  failed: number;
}> {
  const client = await admin();
  let ensured = 0;
  try {
    ensured = Number(
      await rpc<number>(client, "billing_ensure_trial_reminders", { _limit: limit }),
    );
  } catch (error) {
    // Migration may not be applied yet in some environments.
    console.error("Trial reminder ensure skipped", error instanceof Error ? error.message : error);
    return { ensured: 0, processed: 0, failed: 0 };
  }

  const claimed =
    (await rpc<ClaimedReminder[]>(client, "billing_claim_due_trial_reminders", {
      _limit: limit,
    })) ?? [];
  let processed = 0;
  let failed = 0;
  for (const job of claimed) {
    try {
      await deliverTrialReminder(client, job);
      await rpc(client, "billing_finish_trial_reminder", {
        _id: job.id,
        _ok: true,
        _error: null,
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "delivery failed";
      await rpc(client, "billing_finish_trial_reminder", {
        _id: job.id,
        _ok: false,
        _error: message,
      });
      console.error(
        "Trial reminder delivery failed",
        JSON.stringify({ id: job.id, companyId: job.company_id, kind: job.kind, message }),
      );
    }
  }
  return { ensured, processed, failed };
}

async function deliverTrialReminder(client: Admin, job: ClaimedReminder): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sub, error: subError } = await supabaseAdmin
    .from("company_subscriptions" as never)
    .select("status, provider, plan_code, trial_ends_at" as never)
    .eq("company_id" as never, job.company_id as never)
    .maybeSingle();
  if (subError) throw new Error(subError.message);
  const subscription = sub as {
    status: string;
    provider: string;
    plan_code: string;
    trial_ends_at: string | null;
  } | null;

  // Skip stale jobs after paid conversion or expiry handling already moved status.
  if (!subscription) throw new Error("Subscription missing");
  if (subscription.provider !== "none" || subscription.status !== "trialing") {
    if (job.kind !== "expired") {
      // Treat as success no-op so we do not retry forever.
      return;
    }
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies" as never)
    .select("name, timezone, created_by" as never)
    .eq("id" as never, job.company_id as never)
    .single();
  if (companyError) throw new Error(companyError.message);
  const org = company as { name: string; timezone: string | null; created_by: string | null };

  const endsAt = new Date(job.trial_ends_at);
  const remaining = remainingTrialDays(endsAt);
  const copy = formatTrialExpiryCopy({
    companyName: org.name,
    planCode: subscription.plan_code,
    remainingDays: remaining,
    endsAt,
    timeZone: org.timezone || "UTC",
  });

  const titles: Record<TrialReminderKind, string> = {
    welcome: "Welcome to your StreakBooks trial",
    d7: "Your trial ends in 7 days",
    d3: "Your trial ends in 3 days",
    d1: "Your trial ends tomorrow",
    expired: "Your StreakBooks trial has ended",
  };

  const emailOn = job.email_enabled !== false;
  const inappOn = job.inapp_enabled !== false;

  if (inappOn && org.created_by) {
    const { error: notifyError } = await supabaseAdmin.from("action_notifications" as never).upsert(
      {
        company_id: job.company_id,
        recipient_user_id: org.created_by,
        event_key: job.idempotency_key.slice(0, 240),
        category: "system",
        priority: job.kind === "expired" || job.kind === "d1" ? "high" : "medium",
        title: titles[job.kind],
        body: copy.body,
        target_path: "/settings?section=subscription",
        action_kind: "open",
      } as never,
      { onConflict: "company_id,recipient_user_id,event_key" } as never,
    );
    if (notifyError) throw new Error(notifyError.message);
  }

  if (emailOn) {
    const cfg = readEmailConfig();
    if (!cfg.configured) {
      // Recorded as success for channel skip — in-app may still have delivered.
      return;
    }
    if (!org.created_by) return;
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      org.created_by,
    );
    if (userError) throw new Error(userError.message);
    const to = userData.user?.email;
    if (!to) return;

    const subject =
      job.kind === "welcome"
        ? "Welcome to your StreakBooks trial"
        : job.kind === "expired"
          ? "Your StreakBooks trial has ended"
          : copy.subject;

    const result = await sendViaResend(cfg, {
      to: [to],
      subject,
      html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(copy.body)}</pre>`,
      text: copy.body,
      idempotencyKey: job.idempotency_key.slice(0, 200),
    });
    if (!result.ok) throw new Error(result.error || "Email provider failed");

    await supabaseAdmin.from("email_outbox" as never).insert({
      company_id: job.company_id,
      entity_type: "trial_reminder",
      entity_id: job.company_id,
      template: `trial_${job.kind}`,
      to_addresses: [to],
      subject,
      provider: "resend",
      provider_message_id: result.messageId,
      status: "sent",
      error: null,
      sent_by: null,
    } as never);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
