/**
 * Protected hourly digest worker. Invoked only by /api/communications/digest-cron
 * with the rotating LOVABLE_CRON_SECRET. Uses service credentials only server-side.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readEmailConfig, sendViaResend } from "@/lib/documents/email-provider.server";
import { configuredSender } from "@/lib/notifications/communication-settings.server";
import { notificationsConfigSchema } from "@/lib/settings/registry";
import { scheduleIsDue, htmlDigest } from "@/lib/notifications/digest-schedule";
import { escapeHtml } from "@/lib/documents/email-templates";

type ScheduleRow = {
  company_id: string; user_id: string; frequency: "off" | "daily" | "weekly";
  weekday: number; hour_local: number;
};
type CompanyRow = { name: string; timezone: string | null; is_demo: boolean };
type DigestItem = { title: string; body: string; priority: string };

export async function runScheduledDigests(now = new Date()): Promise<{
  inspected: number; accepted: number; failed: number; skipped: number;
}> {
  const provider = readEmailConfig();
  if (!provider.configured) throw new Error("Resend provider not configured");
  const db = supabaseAdmin;
  // Limited batch; future runs pick up remaining subscriptions. Avoid logging personal data.
  const { data: preferences, error: preferencesError } = await db
    .from("communication_digest_preferences" as never)
    .select("company_id,user_id,frequency,weekday,hour_local" as never)
    .neq("frequency" as never, "off" as never)
    .limit(250);
  if (preferencesError) throw new Error(preferencesError.message);
  const summary = { inspected: 0, accepted: 0, failed: 0, skipped: 0 };
  for (const pref of (preferences ?? []) as ScheduleRow[]) {
    summary.inspected++;
    try {
      const { data: company, error: companyError } = await db
        .from("companies" as never).select("name,timezone,is_demo" as never)
        .eq("id" as never, pref.company_id as never).single();
      if (companyError || !company) throw new Error("Company lookup failed");
      const companyInfo = company as CompanyRow;
      if (companyInfo.is_demo) { summary.skipped++; continue; }
      const { data: config, error: configError } = await db
        .from("organisation_config" as never).select("document" as never)
        .eq("company_id" as never, pref.company_id as never)
        .eq("category" as never, "notifications" as never).maybeSingle();
      if (configError) throw new Error("Organisation settings lookup failed");
      const parsed = notificationsConfigSchema.safeParse((config as { document?: unknown } | null)?.document ?? {});
      if (!parsed.success) { summary.skipped++; continue; }
      const timezone = companyInfo.timezone || "UTC";
      if (!scheduleIsDue(pref, timezone, parsed.data, now)) { summary.skipped++; continue; }

      const { data: items, error: itemsError } = await db.rpc("get_scheduled_digest_items" as never, {
        _company: pref.company_id, _user: pref.user_id,
      } as never);
      if (itemsError) throw new Error(itemsError.message);
      const alerts = (items ?? []) as DigestItem[];
      if (!alerts.length) { summary.skipped++; continue; }
      const { data: recipient, error: recipientError } = await db.auth.admin.getUserById(pref.user_id);
      if (recipientError || !recipient.user?.email || !recipient.user.email_confirmed_at) {
        summary.skipped++; continue;
      }
      // Claim one delivery per user, company, local date. Concurrency-safe unique PK.
      // The UTC timestamp encodes local date in the day of the epoch, avoiding DST duplicates.
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(now);
      const claimDate = /^\d{4}-\d{2}-\d{2}$/.test(localDate)
        ? localDate : now.toISOString().slice(0, 10);
      const { error: claimError } = await db
        .from("communication_send_claims" as never)
        .insert({
          company_id: pref.company_id, user_id: pref.user_id,
          kind: "digest_scheduled", window_start: `${claimDate}T00:00:00.000Z`,
        } as never);
      if (claimError) {
        if (claimError.code === "23505") { summary.skipped++; continue; }
        throw new Error("Could not claim scheduled delivery");
      }

      const sender = configuredSender(provider.from, parsed.data);
      const subject = `LinkBooks action summary — ${companyInfo.name} (${alerts.length} items)`;
      const text = `Outstanding LinkBooks actions for ${companyInfo.name}:\n\n${alerts.map((a,i) =>
        `${i+1}. [${a.priority.toUpperCase()}] ${a.title}\n${a.body}`).join("\n\n")}\n\nSign in to LinkBooks to review. No accounting actions are performed by this email.`;
      const response = await sendViaResend({ ...provider, from: sender.from }, {
        to: [recipient.user.email], subject, text,
        html: htmlDigest(companyInfo.name, alerts, escapeHtml),
        ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
      });
      const { error: historyError } = await db
        .from("communication_scheduled_deliveries" as never)
        .insert({
          company_id: pref.company_id, user_id: pref.user_id,
          recipient: recipient.user.email, frequency: pref.frequency,
          scheduled_at: now.toISOString(), alert_count: alerts.length,
          provider: "resend", provider_message_id: response.ok ? response.messageId : null,
          state: response.ok ? "accepted" : "failed",
          error: response.ok ? null : response.error,
        } as never);
      if (historyError) throw new Error("Could not persist scheduled delivery audit");
      if (response.ok) summary.accepted++; else summary.failed++;
    } catch (error) {
      summary.failed++;
      console.error("Scheduled communications delivery failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  return summary;
}
