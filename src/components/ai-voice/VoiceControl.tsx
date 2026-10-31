import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { browserRecognition, startSpeechCommand } from "@/lib/ai-voice/browser-recognition";
import {
  canNavigateByVoice,
  parseDeterministicCommand,
  type VoiceDestination,
} from "@/lib/ai-voice/deterministic-engine";
import type { Permission } from "@/lib/permissions";

type Props = {
  permissions: readonly Permission[];
  onNavigate(destination: VoiceDestination): Promise<void>;
};

/** Mounted for one company, permission set and location by VoiceAssistant. */
export function VoiceControl({ permissions, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"off" | "starting" | "listening">("off");
  const [message, setMessage] = useState("Click Start listening, then say one command in English.");
  const [heard, setHeard] = useState("");
  const cancel = useRef<(() => void) | null>(null);
  const available = Boolean(browserRecognition());
  const active = phase !== "off";

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) {
        cancel.current?.();
        setPhase("off");
        setMessage("Listening stopped while the page was hidden.");
      }
    };
    const stopOnPageHide = () => {
      cancel.current?.();
      setPhase("off");
      setMessage("Listening stopped.");
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    window.addEventListener("pagehide", stopOnPageHide);
    return () => {
      cancel.current?.();
      document.removeEventListener("visibilitychange", stopWhenHidden);
      window.removeEventListener("pagehide", stopOnPageHide);
    };
  }, []);

  function stop() {
    cancel.current?.();
    cancel.current = null;
    setPhase("off");
    setMessage("Listening stopped.");
  }

  function start() {
    if (active) return;
    const Constructor = browserRecognition();
    if (!Constructor || !window.isSecureContext) return;
    cancel.current?.();
    setHeard("");
    setPhase("starting");
    setMessage("Waiting for microphone access…");
    cancel.current = startSpeechCommand(Constructor, {
      onListening: () => {
        setPhase("listening");
        setMessage("Listening… Say one command, or press Stop.");
      },
      onMessage: (text) => {
        setPhase("off");
        setMessage(text);
      },
      onTranscript: (transcript) => {
        setPhase("off");
        setHeard(transcript);
        const result = parseDeterministicCommand(transcript);
        if (result.kind === "unsupported") {
          setMessage(result.message);
          return;
        }
        if (!canNavigateByVoice(result.command, permissions)) {
          setMessage("You do not have permission to open this page or form in this organisation.");
          return;
        }
        setMessage(`Opening ${result.command.label}…`);
        void onNavigate(result.command.destination).catch(() => {
          setMessage("Could not open that page. Try again or use the navigation menu.");
        });
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stop();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open voice commands"
          title="Voice commands"
          className="shrink-0 print:hidden"
        >
          <Mic className="size-4" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Voice commands</DialogTitle>
          <DialogDescription>
            Open pages or blank forms with your voice. Commands never save, post, delete, approve or
            initiate payments.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Browser speech recognition may require internet access and may send audio to your
          browser’s speech provider. No AI provider or API key setup is needed.
        </p>
        <p className="text-sm">
          Say “open dashboard”, “open invoices”, “open bills”, “open banking”, “open contacts” or
          “create invoice”. You can also open sales, purchases, reports, fixed assets, or say
          “create bill”.
        </p>
        {!available ? (
          <p role="alert">
            Speech recognition is not supported in this browser. Try a supported browser such as
            Chrome, or use the keyboard and mouse controls.
          </p>
        ) : !window.isSecureContext ? (
          <p role="alert">
            Microphone access requires HTTPS or localhost. Use a secure connection, or the keyboard
            and mouse controls.
          </p>
        ) : null}
        <p role="status" aria-live="polite" aria-atomic="true" className="text-sm font-medium">
          {phase === "listening"
            ? "Microphone active: "
            : phase === "starting"
              ? "Microphone starting. "
              : "Microphone off. "}
          {message}
        </p>
        {heard ? (
          <p className="break-words text-sm text-muted-foreground">Heard: “{heard}”</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={start}
            disabled={active || !available || !window.isSecureContext}
          >
            <Mic className="size-4" aria-hidden /> Start listening
          </Button>
          <Button type="button" variant="outline" onClick={stop} disabled={!active}>
            <Square className="size-4" aria-hidden /> Stop
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Listening stops after one command or 15 seconds. You can always use the usual keyboard and
          mouse controls.
        </p>
      </DialogContent>
    </Dialog>
  );
}
