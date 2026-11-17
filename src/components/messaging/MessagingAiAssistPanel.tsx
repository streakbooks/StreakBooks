import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  messagingAiDisclosure,
  runMessagingAiAssist,
  type MessagingAiCapability,
} from "@/lib/messaging/ai-assist";
import { useCanDo } from "@/hooks/use-can";
import { notify } from "@/lib/notify";

const CAPABILITIES: { id: MessagingAiCapability; label: string }[] = [
  { id: "summarize_conversation", label: "Summarise conversation" },
  { id: "suggest_reply", label: "Suggest reply" },
  { id: "extract_action_items", label: "Extract action items" },
  { id: "improve_writing", label: "Improve writing" },
];

/** Fail-closed AI assist surface. Never posts, pays, or sends externally. */
export function MessagingAiAssistPanel({
  companyId,
  conversationId,
  authorisedExcerpts,
  aiEnabled,
}: {
  companyId: string | null;
  conversationId: string | null;
  authorisedExcerpts: string[];
  aiEnabled: boolean;
}) {
  const canUseAi = useCanDo("ai.use");
  const [capability, setCapability] = useState<MessagingAiCapability>("summarize_conversation");
  const [result, setResult] = useState<string | null>(null);

  if (!companyId || !conversationId) return null;

  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
      <div>
        <h3 className="text-sm font-semibold">AI assist (optional)</h3>
        <p className="text-xs text-muted-foreground">{messagingAiDisclosure()}</p>
      </div>
      {!aiEnabled || !canUseAi ? (
        <p className="text-xs text-muted-foreground">
          Unavailable until messaging AI is enabled for the organisation and you have ai.use.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Capability</Label>
            <RecordLookupSelect
              value={capability}
              onValueChange={(value) => setCapability(value as MessagingAiCapability)}
            >
              <SelectTrigger aria-label="AI capability">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPABILITIES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </RecordLookupSelect>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const outcome = runMessagingAiAssist({
                companyId,
                conversationId,
                capability,
                authorisedContext: authorisedExcerpts.slice(-20),
              });
              setResult(outcome.reason);
              notify.info("AI assist", outcome.reason);
            }}
          >
            Run assist
          </Button>
          {result ? <p className="text-xs text-muted-foreground">{result}</p> : null}
        </>
      )}
    </div>
  );
}
