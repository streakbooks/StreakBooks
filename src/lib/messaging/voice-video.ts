/**
 * Optional voice/video (Phase 7). Fail-closed until a provider is configured
 * and messaging_settings.allow_voice_video is enabled.
 */

export type MessagingMediaCapability = "voice_call" | "video_call" | "screen_share";

export function messagingVoiceVideoDisclosure(): string {
  return "Voice and video are optional. Calls never approve payments, post journals or change accounting records.";
}

export function canStartMessagingMedia(input: {
  allowVoiceVideo: boolean;
  capability: MessagingMediaCapability;
  providerConfigured: boolean;
}): { ok: false; reason: string } {
  if (!input.allowVoiceVideo) {
    return { ok: false, reason: "Voice/video is disabled for this organisation." };
  }
  if (!input.providerConfigured) {
    return {
      ok: false,
      reason: "No voice/video provider is configured. Calls stay unavailable.",
    };
  }
  void input.capability;
  return {
    ok: false,
    reason: "Voice/video provider handshake is not connected in this build.",
  };
}
