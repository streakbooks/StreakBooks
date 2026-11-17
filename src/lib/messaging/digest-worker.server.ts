/**
 * Messaging digest worker. Invoked from /api/communications/digest-cron
 * after communication digests. Skips demo companies and sensitive previews.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readEmailConfig, sendViaResend } from "@/lib/documents/email-provider.server";
import { configuredSender } from "@/lib/notifications/communication-settings.server";
import { notificationsConfigSchema } from "@/lib/settings/registry";
import { buildMessagingDigestPreview } from "@/lib/messaging/digests";

type PrefRow = {
  company_id: string;
  user_id: string;
  email_enabled: boolean;
  digest_frequency: "off" | "daily" | "weekly";
};

type CompanyRow = { name: string; timezone: string | null; is_demo: boolean };

export async function runMessagingDigests(now = new Date()): Promise<{
  inspected: number;
  accepted: number;
  failed: number;
  skipped: number;
}> {
  const provider = readEmailConfig();
  if (!provider.configured) {
    return { inspected: 0, accepted: 0, failed: 0, skipped: 0 };
  }
  const db = supabaseAdmin;
  const summary = { inspected: 0, accepted: 0, failed: 0, skipped: 0 };
  const pageSize = 250;

  for (let offset = 0; ; offset += pageSize) {
    const { data: preferences, error: preferencesError } = await db
      .from("messaging_notification_preferences" as never)
      .select("company_id,user_id,email_enabled,digest_frequency" as never)
      .eq("email_enabled" as never, true as never)
      .neq("digest_frequency" as never, "off" as never)
      .order("company_id" as never, { ascending: true })
      .order("user_id" as never, { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (preferencesError) throw new Error(preferencesError.message);
    const page = (preferences ?? []) as PrefRow[];
    if (!page.length) break;

    for (const pref of page) {
      summary.inspected += 1;
      try {
        if (pref.digest_frequency !== "daily" && pref.digest_frequency !== "weekly") {
          summary.skipped += 1;
          continue;
        }
        if (pref.digest_frequency === "weekly" && now.getUTCDay() !== 1) {
          summary.skipped += 1;
          continue;
        }

        const { data: company, error: companyError } = await db
          .from("companies" as never)
          .select("name,timezone,is_demo" as never)
          .eq("id" as never, pref.company_id as never)
          .single();
        if (companyError || !company) throw new Error("Company lookup failed");
        const companyInfo = company as CompanyRow;
        if (companyInfo.is_demo) {
          summary.skipped += 1;
          continue;
        }

        const { data: config } = await db
          .from("organisation_config" as never)
          .select("document" as never)
          .eq("company_id" as never, pref.company_id as never)
          .eq("category" as never, "notifications" as never)
          .maybeSingle();
        const parsed = notificationsConfigSchema.safeParse(
          (config as { document?: unknown } | null)?.document ?? {},
        );
        if (!parsed.success) {
          summary.skipped += 1;
          continue;
        }

        const { data: memberships } = await db
          .from("messaging_conversation_members" as never)
          .select("conversation_id, last_read_seq, status" as never)
          .eq("company_id" as never, pref.company_id as never)
          .eq("user_id" as never, pref.user_id as never)
          .eq("status" as never, "active" as never);
        const memRows = (memberships ?? []) as Array<{
          conversation_id: string;
          last_read_seq: number;
        }>;
        const ids = memRows.map((row) => row.conversation_id);
        if (!ids.length) {
          summary.skipped += 1;
          continue;
        }

        const { data: conversations } = await db
          .from("messaging_conversations" as never)
          .select("id,title,visibility,last_message_preview,last_message_at" as never)
          .eq("company_id" as never, pref.company_id as never)
          .in("id" as never, ids as never);
        const memById = new Map(memRows.map((row) => [row.conversation_id, row]));
        const { data: seqRows } = await db
          .from("messaging_messages" as never)
          .select("conversation_id, seq" as never)
          .in("conversation_id" as never, ids as never)
          .order("seq" as never, { ascending: false });
        const maxSeq = new Map<string, number>();
        for (const row of (seqRows ?? []) as Array<{ conversation_id: string; seq: number }>) {
          if (!maxSeq.has(row.conversation_id)) maxSeq.set(row.conversation_id, Number(row.seq));
        }

        const preview = buildMessagingDigestPreview({
          companyName: companyInfo.name,
          frequency: pref.digest_frequency,
          candidates: ((conversations ?? []) as Array<Record<string, unknown>>).map((row) => {
            const id = String(row["id"]);
            const mem = memById.get(id);
            const max = maxSeq.get(id) ?? 0;
            return {
              conversationId: id,
              title: (row["title"] as string | null) ?? null,
              preview: (row["last_message_preview"] as string | null) ?? null,
              unreadCount: Math.max(0, max - Number(mem?.last_read_seq ?? 0)),
              visibility: String(row["visibility"] ?? "internal"),
              lastMessageAt: (row["last_message_at"] as string | null) ?? null,
            };
          }),
        });
        if (!preview.items.length) {
          summary.skipped += 1;
          continue;
        }

        const { data: recipient, error: recipientError } = await db.auth.admin.getUserById(
          pref.user_id,
        );
        if (recipientError || !recipient.user?.email || !recipient.user.email_confirmed_at) {
          summary.skipped += 1;
          continue;
        }

        const timezone = companyInfo.timezone || "UTC";
        const localDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now);
        const claimDate = /^\d{4}-\d{2}-\d{2}$/.test(localDate)
          ? localDate
          : now.toISOString().slice(0, 10);
        const { error: claimError } = await db.from("communication_send_claims" as never).insert({
          company_id: pref.company_id,
          user_id: pref.user_id,
          kind: "messaging_digest",
          window_start: `${claimDate}T00:00:00.000Z`,
        } as never);
        if (claimError) {
          if (claimError.code === "23505") {
            summary.skipped += 1;
            continue;
          }
          throw new Error("Could not claim messaging digest delivery");
        }

        const sender = configuredSender(provider.from, parsed.data);
        const text = [
          preview.subject,
          "",
          ...preview.items.map(
            (item, index) => `${index + 1}. ${item.title} — ${item.summary}`,
          ),
          "",
          preview.omittedSensitive
            ? `${preview.omittedSensitive} sensitive or private conversation(s) were omitted.`
            : "",
          "Sign in to LinkBooks Messages to review. This email never posts, pays or approves.",
        ]
          .filter(Boolean)
          .join("\n");

        const response = await sendViaResend(
          { ...provider, from: sender.from },
          {
            to: [recipient.user.email],
            subject: preview.subject,
            html: text.replace(/\n/g, "<br>"),
            text,
            ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
          },
        );
        if (response.ok) summary.accepted += 1;
        else summary.failed += 1;
      } catch (error) {
        summary.failed += 1;
        console.error("Messaging digest delivery failed", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    if (page.length < pageSize) break;
  }

  return summary;
}
