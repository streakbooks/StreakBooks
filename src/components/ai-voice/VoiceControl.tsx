import { useEffect, useId, useState } from "react";
import { ChevronDown, Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { browserRecognition } from "@/lib/ai-voice/browser-recognition";
import type { AssistantController, AssistantPhase } from "@/lib/ai-voice/assistant-controller";
import { useVoiceSnapshot } from "./voice-context";

const LABELS: Record<AssistantPhase, string> = {
  inactive: "Off",
  initializing: "Connecting",
  listening: "Listening",
  speech_detected: "Hearing you",
  transcribing: "Transcribing",
  understanding: "Understanding",
  executing: "Working",
  awaiting_clarification: "Which one?",
  awaiting_confirmation: "Review draft",
  recovering: "Reconnecting",
  error: "Needs attention",
};
export function VoiceControl({
  session,
  expanded,
  onExpandedChange,
}: {
  session: AssistantController;
  expanded: boolean;
  onExpandedChange(value: boolean): void;
}) {
  const state = useVoiceSnapshot(session);
  const [text, setText] = useState("");
  const panelId = useId();
  useEffect(() => {
    if (state.confirmation || state.choices.length || state.phase === "error")
      onExpandedChange(true);
  }, [state.confirmation, state.choices.length, state.phase, onExpandedChange]);
  const available = Boolean(browserRecognition());
  const secure = typeof window !== "undefined" && window.isSecureContext;
  if (!state.available) return null;
  return (
    <div className="voice-signal print:hidden" data-phase={state.phase}>
      <div className="voice-signal-pill">
        <button
          type="button"
          className="voice-signal-trigger"
          aria-label="Open voice assistant"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => onExpandedChange(!expanded)}
        >
          <span className="voice-signal-core" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="voice-signal-name">
            <strong>Signal</strong>
            <span>{LABELS[state.phase]}</span>
          </span>
          <ChevronDown aria-hidden className="size-3" />
        </button>
        {state.active ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Stop assistant"
            onClick={() => session.stop()}
          >
            <Square className="size-3" aria-hidden />
          </Button>
        ) : null}
      </div>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {state.message}{" "}
        {state.active ? `Assistant active. ${LABELS[state.phase]}.` : "Microphone off."}
      </span>
      {expanded ? (
        <section
          id={panelId}
          aria-label="LinkBooks Signal"
          className="voice-signal-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onExpandedChange(false);
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">LinkBooks Signal</h2>
              <p className="text-xs text-muted-foreground">
                {state.active ? "Active until you stop" : "Your voice, your workspace"}
                {state.form ? ` · ${state.form.replace("_", " ")}` : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Minimise assistant"
              onClick={() => onExpandedChange(false)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          <p className="text-sm font-medium" data-testid="assistant-message">
            {state.message}
          </p>
          {state.heard ? (
            <p className="break-words text-xs text-muted-foreground">Heard: “{state.heard}”</p>
          ) : null}
          {!available ? (
            <p role="alert" className="text-sm">
              Speech recognition is not supported in this browser. Use text commands or keyboard and
              mouse controls.
            </p>
          ) : !secure ? (
            <p role="alert" className="text-sm">
              Microphone access requires HTTPS or localhost. Text commands remain available.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!state.active ? (
              <Button
                type="button"
                size="sm"
                disabled={!available || !secure}
                onClick={() => session.start()}
              >
                <Mic className="size-4" aria-hidden /> Start assistant
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => session.stop()}>
                <Square className="size-4" aria-hidden /> Stop assistant
              </Button>
            )}
            <span className="self-center text-xs text-muted-foreground">
              {state.active ? LABELS[state.phase] : "Microphone off"}
            </span>
          </div>
          {state.choices.length ? (
            <ol className="space-y-1 text-sm" aria-label="Matching records">
              {state.choices.map((choice, i) => (
                <li key={choice.id}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto w-full justify-start whitespace-normal text-left"
                    onClick={() => void session.chooseOption(choice.id)}
                  >
                    {i + 1}. {choice.name}
                  </Button>
                </li>
              ))}
            </ol>
          ) : null}
          {state.confirmation ? (
            <div
              className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3"
              aria-label="Draft save confirmation"
            >
              <h3 className="text-sm font-semibold">Review before saving</h3>
              <ul className="space-y-1 text-xs">
                {state.confirmation.details.map((detail, i) => (
                  <li className="break-words" key={i}>
                    {detail}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  void session
                    .confirmSave()
                    .catch(() =>
                      session.stop("The form changed. Review it before asking to save again."),
                    )
                }
              >
                Confirm save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void session.submit("cancel")}
              >
                Cancel save
              </Button>
            </div>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const command = text;
              setText("");
              void session.submit(command);
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm"
              aria-label="Type an assistant command"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={1000}
              placeholder="Select customer ABC"
            />
            <Button type="submit" size="sm" disabled={!text.trim() || state.phase === "executing"}>
              Run
            </Button>
          </form>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Commands and privacy</summary>
            <div className="mt-2 space-y-2">
              <p>
                Try “create invoice”, “select customer ABC”, “set invoice date to October 31, 2026”,
                “add consulting for 1500”, “use account Consulting income”, “set due date to
                November 15, 2026”, then “save invoice”. Draft saves require the on-screen
                confirmation.
              </p>
              <p>
                Posting, payments, sending and deletion use the normal manual controls. Matching
                uses predefined English rules, without an LLM or paid AI API.
              </p>
            </div>
          </details>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Browser speech recognition may require internet access and send audio to your browser’s
            speech provider. Signal stays active across pages; hidden tabs pause it. No raw audio or
            conversation history is stored. Ctrl+Shift+Space starts or stops it.
          </p>
        </section>
      ) : null}
    </div>
  );
}
