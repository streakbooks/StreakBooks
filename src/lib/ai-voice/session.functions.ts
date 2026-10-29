import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { getVoiceServerConfig } from "@/lib/ai-voice/server-config";

const StartRequest = z.object({
  consentVersion: z.string().min(1).max(80),
  locale: z.string().min(2).max(30),
}).strict();

type VoiceSettings = {
  enabled: boolean;
  consent_policy_version: string;
  max_sessions_per_hour: number;
  max_daily_cost_minor: number;
  max_session_seconds: number;
};

/** Issues a short-lived OpenAI Realtime credential, never the standard API key. */
export const startVoiceSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => StartRequest.parse(value))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("last_company_id")
      .eq("id", userId)
      .single();
    if (profileError || !profile?.last_company_id) throw new Error("Select an organisation before starting voice.");
    const companyId = profile.last_company_id;
    await assertCompanyMember(supabase, companyId);
    await assertCompanyPermission(supabase, companyId, "ai.use");

    const config = getVoiceServerConfig();
    const { data: settingsRaw, error: settingsError } = await supabase
      .from("ai_voice_settings" as never)
      .select("enabled,consent_policy_version,max_sessions_per_hour,max_daily_cost_minor,max_session_seconds" as never)
      .eq("company_id" as never, companyId as never)
      .maybeSingle();
    if (settingsError) throw new Error("Voice service is unavailable: organisation settings could not be loaded.");
    const settings = settingsRaw as VoiceSettings | null;
    if (!settings?.enabled) throw new Error("Voice is disabled for this organisation.");
    if (data.consentVersion !== settings.consent_policy_version) throw new Error("Review and accept the current voice consent notice.");
    if (settings.max_daily_cost_minor === 0) throw new Error("Voice daily cost budget is zero.");

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
    const today = now.toISOString().slice(0, 10);
    const { count, error: quotaError } = await supabase
      .from("ai_voice_sessions" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("company_id" as never, companyId as never)
      .gte("started_at" as never, hourAgo as never);
    if (quotaError) throw new Error("Unable to verify the voice quota.");
    if ((count ?? 0) >= Math.min(settings.max_sessions_per_hour, config.VOICE_MAX_SESSIONS_PER_HOUR)) {
      throw new Error("Organisation voice session quota reached.");
    }
    const { data: dailyRaw, error: dailyError } = await supabase
      .from("ai_voice_usage" as never)
      .select("estimated_cost_minor" as never)
      .eq("company_id" as never, companyId as never)
      .gte("measured_at" as never, today as never)
      .limit(1000);
    if (dailyError) throw new Error("Unable to verify the daily voice budget.");
    const dailyCost = ((dailyRaw ?? []) as Array<{ estimated_cost_minor: number }>).reduce((sum, row) => sum + Number(row.estimated_cost_minor), 0);
    if (dailyCost >= settings.max_daily_cost_minor) throw new Error("Daily voice cost budget reached.");

    // Fail closed until the database-backed, atomic session registrar is deployed.
    // The current voice tables intentionally grant authenticated users SELECT only.
    // Never mint a billable provider credential before a durable session and quota
    // reservation exist; otherwise rate limits and audit evidence can be bypassed.
    throw new Error("Voice sessions are unavailable until the secure session registrar is deployed.");

  });
