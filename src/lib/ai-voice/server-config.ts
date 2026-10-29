import { z } from "zod";

/** Server-only Realtime configuration. Do not import into browser components. */
const Env = z.object({
  OPENAI_API_KEY: z.string().min(1),
  VOICE_REALTIME_MODEL: z.string().min(1),
  VOICE_REALTIME_VOICE: z.string().min(1),
  VOICE_REALTIME_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  VOICE_MAX_SESSION_SECONDS: z.coerce.number().int().min(60).max(7200).default(1800),
  VOICE_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(1800).default(120),
  VOICE_MAX_SESSIONS_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(20),
  VOICE_CONSENT_VERSION: z.string().min(1).default("voice-v1"),
});

export type VoiceServerConfig = z.infer<typeof Env>;

export function getVoiceServerConfig(env: Record<string, string | undefined> = process.env): VoiceServerConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error("Voice service is not configured: " + missing);
  }
  const url = new URL(parsed.data.VOICE_REALTIME_BASE_URL);
  if (url.protocol !== "https:" || url.hostname !== "api.openai.com" || url.port || url.username || url.password || url.search || url.hash || (url.pathname !== "/v1" && url.pathname !== "/v1/")) {
    throw new Error("Voice provider URL must be https://api.openai.com/v1");
  }
  return parsed.data;
}

/** Browser-safe fields only; never return the API key or raw provider configuration. */
export function voicePublicConfig(config: VoiceServerConfig) {
  return {
    model: config.VOICE_REALTIME_MODEL,
    voice: config.VOICE_REALTIME_VOICE,
    maxSessionSeconds: config.VOICE_MAX_SESSION_SECONDS,
    idleTimeoutSeconds: config.VOICE_IDLE_TIMEOUT_SECONDS,
    consentVersion: config.VOICE_CONSENT_VERSION,
  };
}
