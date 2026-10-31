import { useWakeController } from "./wake-context";
import { useState } from "react";
import { VoiceControl } from "./VoiceControl";
import { useVoiceSession } from "./voice-context";

export function VoiceAssistant() {
  const session = useVoiceSession();
  const wake = useWakeController();
  const [expanded, setExpanded] = useState(false);
  if (!session || !wake) return null;
  return (
    <VoiceControl
      wake={wake}
      session={session}
      expanded={expanded}
      onExpandedChange={setExpanded}
    />
  );
}
