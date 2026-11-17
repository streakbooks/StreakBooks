import { describe, expect, it } from "vitest";
import { canStartMessagingMedia, messagingVoiceVideoDisclosure } from "./voice-video";

describe("messaging voice/video", () => {
  it("fails closed when disabled or unconfigured", () => {
    expect(
      canStartMessagingMedia({
        allowVoiceVideo: false,
        capability: "voice_call",
        providerConfigured: true,
      }).ok,
    ).toBe(false);
    expect(
      canStartMessagingMedia({
        allowVoiceVideo: true,
        capability: "video_call",
        providerConfigured: false,
      }).reason.toLowerCase(),
    ).toContain("provider");
  });

  it("discloses non-accounting autonomy", () => {
    expect(messagingVoiceVideoDisclosure().toLowerCase()).toContain("never approve");
  });
});
