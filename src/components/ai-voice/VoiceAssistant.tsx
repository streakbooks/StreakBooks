import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useActiveCompany } from "@/hooks/use-active-company";
import { roleHasPermission } from "@/lib/permissions";
import { parseDeterministicCommand, supportedNavigationCommands } from "@/lib/ai-voice/deterministic-engine";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type BrowserRecognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognitionConstructor = new () => BrowserRecognition;
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
type Entry = { source: "User" | "LinkBooks"; text: string };

export function VoiceAssistant() {
  const { company } = useActiveCompany();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const recognition = useRef<BrowserRecognition | null>(null);
  const allowed = Boolean(company && roleHasPermission(company.role, "ai.use"));

  const stop = useCallback(() => {
    const instance = recognition.current;
    recognition.current = null;
    if (instance) { instance.onresult = null; instance.onerror = null; instance.onend = null; instance.abort(); }
    setListening(false); setInterim("");
  }, []);

  useEffect(() => {
    setSpeechAvailable(Boolean((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition));
    return () => stop();
  }, [stop]);
  useEffect(() => { stop(); setHistory([]); setEnabled(false); }, [company?.id, stop]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v") {
        event.preventDefault(); setOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const execute = useCallback((input: string) => {
    const transcript = input.trim();
    if (!transcript) return;
    const result = parseDeterministicCommand(transcript);
    let response: string;
    if (result.kind === "matched") {
      // Navigation is the only enabled operation. No financial mutations occur.
      if (!allowed || result.command.requiredPermission !== "company.view") {
        response = "You do not have permission to navigate using voice.";
      } else {
        response = "Opening " + result.command.label + ".";
        void navigate({ to: result.command.destination as never });
      }
    } else if (result.kind === "ambiguous") {
      response = "Please clarify: " + result.candidates.join(" or ") + ".";
    } else response = result.message;
    setHistory((rows) => [...rows.slice(-48), { source: "User", text: transcript }, { source: "LinkBooks", text: response }]);
    setText(""); setInterim("");
  }, [allowed, navigate]);

  const executeRef = useRef(execute);
  useEffect(() => { executeRef.current = execute; }, [execute]);

  function start() {
    if (!enabled || !allowed) return;
    stop(); setError("");
    const Constructor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) { setError("Speech recognition is unavailable in this browser. Use the text field."); return; }
    try {
      const instance = new Constructor();
      recognition.current = instance;
      instance.lang = navigator.language || "en-GB";
      instance.continuous = false;
      instance.interimResults = true;
      instance.onresult = (event) => {
        let partial = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result) continue;
          if (result.isFinal) executeRef.current(result[0].transcript);
          else partial += result[0].transcript;
        }
        setInterim(partial);
      };
      instance.onerror = (event) => { setError("Speech recognition error: " + event.error); setListening(false); };
      instance.onend = () => { setListening(false); setInterim(""); recognition.current = null; };
      instance.start(); setListening(true);
    } catch (cause) {
      stop();
      setError(cause instanceof Error ? cause.message : "Unable to start speech recognition.");
    }
  }

  if (!allowed) return null;
  return <div className="print:hidden">
    <button type="button" aria-label="Open voice control" aria-expanded={open} onClick={() => setOpen((value) => !value)}
      className="rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring">Voice control</button>
    {open && <section aria-label="Voice control" className="fixed bottom-4 right-4 z-50 flex h-[min(75vh,570px)] w-[min(94vw,420px)] flex-col rounded-xl border bg-background p-4 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">LinkBooks Voice Control</h2>
        <button type="button" className="rounded border px-2 py-1 text-sm" onClick={() => { stop(); setOpen(false); }}>Close</button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">No generative AI required. Navigation commands only during initial rollout.</p>
      <label className="my-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => {
        setEnabled(event.target.checked);
        if (!event.target.checked) stop();
      }} /> Enable voice controls for this session</label>
      <p role="status" className="text-xs">{listening ? "Microphone active — listening" : "Microphone off"} · {speechAvailable ? "Browser speech recognition available" : "Speech unavailable; text commands supported"}</p>
      <p className="text-xs text-muted-foreground">Browser speech recognition may use a cloud service. Do not dictate private financial data unless you trust your browser's provider.</p>
      <div className="my-2 flex gap-2">
        <button type="button" disabled={!enabled || listening || !speechAvailable} onClick={start} className="rounded border px-3 py-2 text-sm">Speak</button>
        <button type="button" disabled={!listening} onClick={stop} className="rounded border px-3 py-2 text-sm">Stop</button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {interim && <p aria-live="polite" className="text-sm italic">Recognizing: {interim}</p>}
      <div role="log" aria-label="Command transcript" aria-live="polite" className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded border p-3 text-sm">
        {history.length === 0 && <p className="text-muted-foreground">Try “Open sales”, “Show reports”, or “Go to banking”.</p>}
        {history.map((entry, index) => <p key={index}><strong>{entry.source}:</strong> {entry.text}</p>)}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); execute(text); }}>
        <input aria-label="Type a voice command" className="min-w-0 flex-1 rounded border bg-background px-2 py-2 text-sm" value={text} onChange={(event) => setText(event.target.value)} placeholder="Open sales" />
        <button type="submit" disabled={!text.trim()} className="rounded border px-3 py-2 text-sm">Run</button>
      </form>
      <details className="mt-2 text-xs"><summary className="cursor-pointer">Supported commands</summary>
        <div className="max-h-24 overflow-y-auto">{supportedNavigationCommands.map((command) => <p key={command.label}>{command.label}: {command.phrases.slice(0, 2).join(", ")}</p>)}</div>
      </details>
    </section>}
  </div>;
}
