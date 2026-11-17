/**
 * Messaging retention purge worker.
 * Default mode is dry-run. Destructive execute requires cron auth +
 * MESSAGING_RETENTION_PURGE_EXECUTE=1. Skips demo companies and legal-hold policies.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  messagesPastRetention,
  resolveMessagingRetentionPurgeMode,
} from "@/lib/messaging/retention";

export type RetentionPurgeSummary = {
  mode: "dry_run" | "execute";
  companiesInspected: number;
  candidates: number;
  redacted: number;
  skipped: number;
  failed: number;
};

type SettingsRow = { company_id: string; retention_days: number | null };
type CompanyRow = { id: string; is_demo: boolean };
type MessageRow = {
  id: string;
  company_id: string;
  conversation_id: string;
  created_at: string;
  is_redacted: boolean;
};

export async function runMessagingRetentionPurge(input?: {
  execute?: boolean;
  now?: Date;
  limitPerCompany?: number;
}): Promise<RetentionPurgeSummary> {
  const mode = resolveMessagingRetentionPurgeMode({
    execute: input?.execute,
  });
  const now = input?.now ?? new Date();
  const limitPerCompany = input?.limitPerCompany ?? 200;
  const db = supabaseAdmin;
  const summary: RetentionPurgeSummary = {
    mode,
    companiesInspected: 0,
    candidates: 0,
    redacted: 0,
    skipped: 0,
    failed: 0,
  };

  const { data: settingsRows, error: settingsError } = await db
    .from("messaging_settings" as never)
    .select("company_id, retention_days" as never)
    .not("retention_days" as never, "is" as never, null as never);
  if (settingsError) throw new Error(settingsError.message);

  for (const settings of (settingsRows ?? []) as SettingsRow[]) {
    summary.companiesInspected += 1;
    if (settings.retention_days == null) {
      summary.skipped += 1;
      continue;
    }

    const { data: company, error: companyError } = await db
      .from("companies" as never)
      .select("id, is_demo" as never)
      .eq("id" as never, settings.company_id as never)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    const companyInfo = company as CompanyRow | null;
    if (!companyInfo || companyInfo.is_demo) {
      summary.skipped += 1;
      continue;
    }

    const { data: holds } = await db
      .from("messaging_retention_policies" as never)
      .select("legal_hold" as never)
      .eq("company_id" as never, settings.company_id as never)
      .eq("legal_hold" as never, true as never)
      .limit(1);
    if ((holds ?? []).length) {
      summary.skipped += 1;
      continue;
    }

    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - settings.retention_days);

    const { data: messages, error: messagesError } = await db
      .from("messaging_messages" as never)
      .select("id, company_id, conversation_id, created_at, is_redacted" as never)
      .eq("company_id" as never, settings.company_id as never)
      .eq("is_redacted" as never, false as never)
      .lt("created_at" as never, cutoff.toISOString() as never)
      .order("created_at" as never, { ascending: true })
      .limit(limitPerCompany);
    if (messagesError) throw new Error(messagesError.message);

    for (const message of (messages ?? []) as MessageRow[]) {
      if (
        !messagesPastRetention({
          createdAt: message.created_at,
          retentionDays: settings.retention_days,
          now,
        })
      ) {
        summary.skipped += 1;
        continue;
      }
      summary.candidates += 1;
      if (mode !== "execute") continue;

      const { error: updateError } = await db
        .from("messaging_messages" as never)
        .update({
          is_redacted: true,
          body: "[Message removed by retention policy]",
          edited_at: now.toISOString(),
        } as never)
        .eq("id" as never, message.id as never)
        .eq("company_id" as never, settings.company_id as never);
      if (updateError) {
        summary.failed += 1;
        continue;
      }
      summary.redacted += 1;
    }
  }

  return summary;
}
