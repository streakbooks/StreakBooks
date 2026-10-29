import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { executeDeterministicVoiceCommand } from "@/lib/ai-voice/deterministic.functions";
import { useActiveCompany } from "@/hooks/use-active-company";
import { roleHasPermission } from "@/lib/permissions";
import { supportedNavigationCommands } from "@/lib/ai-voice/deterministic-engine";
import { advanceDraft, beginDraft, type DraftState } from "@/lib/ai-voice/draft-workflow";

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
  const executeOnServer = useServerFn(executeDeterministicVoiceCommand);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const draftRef = useRef<DraftState | null>(null);
  const [error, setError] = useState("");
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("en-GB");
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
    setSpeechLanguage(navigator.language || "en-GB");
    return () => stop();
  }, [stop]);
  useEffect(() => { stop(); setHistory([]); setEnabled(false); draftRef.current = null; setDraft(null); }, [company?.id, stop]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v") {
        event.preventDefault(); setOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const execute = useCallback(async (input: string) => {
    const transcript = input.trim();
    if (!transcript) return;
    setText(""); setInterim("");
    if (draftRef.current) {
      const result = advanceDraft(draftRef.current, transcript);
      draftRef.current = result.state.status === "cancelled" ? null : result.state;
      setDraft(draftRef.current);
      setHistory((rows) => [...rows.slice(-48), { source: "User", text: transcript }, { source: "LinkBooks", text: result.response }]);
      return;
    }
    if (/^(start|create|prepare) (a |an )?(sales invoice|supplier bill) (preview|draft)$/i.test(transcript)) {
      const result = beginDraft(/supplier bill/i.test(transcript) ? "supplier_bill" : "sales_invoice");
      draftRef.current = result.state;
      setDraft(result.state);
      setHistory((rows) => [...rows.slice(-48), { source: "User", text: transcript }, { source: "LinkBooks", text: result.response }]);
      return;
    }
    try {
      const result = await executeOnServer({ data: { transcript } });
      setHistory((rows) => [...rows.slice(-48), { source: "User", text: transcript }, { source: "LinkBooks", text: result.message }]);
      if (result.status === "ok" && result.destination) {
        await navigate({ to: result.destination as never });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Command could not be authorised.";
      setHistory((rows) => [...rows.slice(-48), { source: "User", text: transcript }, { source: "LinkBooks", text: message }]);
      setError(message);
    }
  }, [executeOnServer, navigate]);

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
      instance.lang = speechLanguage;
      instance.continuous = false;
      instance.interimResults = true;
      instance.onresult = (event) => {
        let partial = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result) continue;
          if (result.isFinal) void executeRef.current(result[0].transcript);
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
      <p className="mt-1 text-xs text-muted-foreground">No generative AI required. Navigation, read-only reviews, and unsaved draft previews.</p>
      <label className="my-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => {
        setEnabled(event.target.checked);
        if (!event.target.checked) stop();
      }} /> Enable voice controls for this session</label>
      <p role="status" className="text-xs">{listening ? "Microphone active — listening" : "Microphone off"} · {speechAvailable ? "Browser speech recognition available" : "Speech unavailable; text commands supported"}</p>
      <p className="text-xs text-muted-foreground">Browser speech recognition may use a cloud service. Do not dictate private financial data unless you trust your browser's provider.</p>
      <label className="my-2 block text-xs">Recognition language <select aria-label="Recognition language" className="rounded border bg-background p-1" value={speechLanguage} onChange={(event) => setSpeechLanguage(event.target.value)}><option value="en-GB">English (UK)</option><option value="en-US">English (US)</option><option value="en-IN">English (India)</option><option value="hi-IN">Hindi (India) — English command phrases only</option></select></label>
      <div className="my-2 flex gap-2">
        <button type="button" disabled={!enabled || listening || !speechAvailable} onClick={start} className="rounded border px-3 py-2 text-sm">Speak</button>
        <button type="button" disabled={!listening} onClick={stop} className="rounded border px-3 py-2 text-sm">Stop</button>
      </div>
      {draft && <p role="status" className="text-xs">Draft preview: {draft.status}. Say cancel to discard. Nothing is saved.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {interim && <p aria-live="polite" className="text-sm italic">Recognizing: {interim}</p>}
      <div role="log" aria-label="Command transcript" aria-live="polite" className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded border p-3 text-sm">
        {history.length === 0 && <p className="text-muted-foreground">Try “Open sales”, “Show reports”, or “Go to banking”.</p>}
        {history.map((entry, index) => <p key={index}><strong>{entry.source}:</strong> {entry.text}</p>)}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void execute(text); }}>
        <input aria-label="Type a voice command" className="min-w-0 flex-1 rounded border bg-background px-2 py-2 text-sm" value={text} onChange={(event) => setText(event.target.value)} placeholder="Open sales" />
        <button type="submit" disabled={!text.trim()} className="rounded border px-3 py-2 text-sm">Run</button>
      </form>
      <p className="mt-2 text-xs">Try “Start sales invoice draft” or “Start supplier bill draft” for an unsaved preview.</p>
      <details className="mt-2 text-xs"><summary className="cursor-pointer">Supported commands</summary>
        <div className="max-h-24 overflow-y-auto">{supportedNavigationCommands.map((command) => <p key={command.label}>{command.label}: {command.phrases.slice(0, 2).join(", ")}</p>)}</div>
      </details>
    </section>}
  </div>;
}
