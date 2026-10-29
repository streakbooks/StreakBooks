import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { getVoiceServerConfig, voicePublicConfig } from "@/lib/ai-voice/server-config";

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
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
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
      .select("cost_minor" as never)
      .eq("company_id" as never, companyId as never)
      .gte("created_at" as never, today as never)
      .limit(1000);
    if (dailyError) throw new Error("Unable to verify the daily voice budget.");
    const dailyCost = ((dailyRaw ?? []) as Array<{ cost_minor: number }>).reduce((sum, row) => sum + Number(row.cost_minor), 0);
    if (dailyCost >= settings.max_daily_cost_minor) throw new Error("Daily voice cost budget reached.");

    const secretResponse = await fetch(`${config.VOICE_REALTIME_BASE_URL.replace(/\/$/, "")}/realtime/client_secrets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: config.VOICE_REALTIME_MODEL,
          audio: {
            output: { voice: config.VOICE_REALTIME_VOICE },
            input: { turn_detection: { type: "server_vad", interrupt_response: true } },
          },
          instructions: "You are LinkBooks voice navigation assistant. Never claim to have read financial records or completed transactions. No accounting tools are available in this session. Explain that accounting actions require the LinkBooks UI.",
          tools: [],
        },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!secretResponse.ok) throw new Error(`Realtime session creation failed (${secretResponse.status}).`);
    const payload = z.object({
      value: z.string().min(1),
      expires_at: z.number().optional(),
    }).passthrough().parse(await secretResponse.json());

    const expiresAt = new Date(now.getTime() + Math.min(settings.max_session_seconds, config.VOICE_MAX_SESSION_SECONDS) * 1000).toISOString();
    const { data: session, error: insertError } = await supabase
      .from("ai_voice_sessions" as never)
      .insert({
        company_id: companyId,
        user_id: userId,
        model_id: config.VOICE_REALTIME_MODEL,
        locale: data.locale,
        state: "connecting",
        consent_version: data.consentVersion,
        expires_at: expiresAt,
      } as never)
      .select("id" as never)
      .single();
    if (insertError || !session) throw new Error("Could not register the voice session.");
    return {
      sessionId: (session as { id: string }).id,
      clientSecret: payload.value,
      clientSecretExpiresAt: payload.expires_at ?? null,
      expiresAt,
      ...voicePublicConfig(config),
    };
  });
