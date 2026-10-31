import { useState } from "react";
import { VoiceControl } from "./VoiceControl";
import { useVoiceSession } from "./voice-context";

export function VoiceAssistant() {
  const session = useVoiceSession();
  const [expanded, setExpanded] = useState(false);
  if (!session) return null;
  return <VoiceControl session={session} expanded={expanded} onExpandedChange={setExpanded} />;
}
