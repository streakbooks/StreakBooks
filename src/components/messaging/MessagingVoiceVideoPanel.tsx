import { Button } from "@/components/ui/button";
import { canStartMessagingMedia, messagingVoiceVideoDisclosure } from "@/lib/messaging/voice-video";
import { notify } from "@/lib/notify";

export function MessagingVoiceVideoPanel({ allowVoiceVideo }: { allowVoiceVideo: boolean }) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-muted/20 p-3">
      <h3 className="text-sm font-semibold">Voice / video</h3>
      <p className="text-xs text-muted-foreground">{messagingVoiceVideoDisclosure()}</p>
      <div className="flex flex-wrap gap-2">
        {(["voice_call", "video_call"] as const).map((capability) => (
          <Button
            key={capability}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const result = canStartMessagingMedia({
                allowVoiceVideo,
                capability,
                providerConfigured: false,
              });
              notify.info(capability === "voice_call" ? "Voice call" : "Video call", result.reason);
            }}
          >
            {capability === "voice_call" ? "Start voice" : "Start video"}
          </Button>
        ))}
      </div>
    </div>
  );
}
