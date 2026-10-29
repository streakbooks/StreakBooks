import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { startVoiceSession } from "@/lib/ai-voice/session.functions";
import { runAiAssistant } from "@/lib/ai/ai.functions";
import { roleHasPermission } from "@/lib/permissions";

type Status = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
type Caption = { who: "You" | "Assistant"; text: string };

export function VoiceAssistant() {
  const { company } = useActiveCompany();
  const start = useServerFn(startVoiceSession);
  const ask = useServerFn(runAiAssistant);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [message, setMessage] = useState("");
  const [muted, setMuted] = useState(false);
  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const canUse = Boolean(company && roleHasPermission(company.role, "ai.use"));

  const stop = useCallback(() => {
    channel.current?.close();
    peer.current?.close();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (audio.current) { audio.current.pause(); audio.current.srcObject = null; }
    channel.current = null; peer.current = null; stream.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => { stop(); setCaptions([]); setConsent(false); }, [company?.id, stop]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  async function connect() {
    if (!consent || !canUse) return;
    stop();
    setError("");
    setStatus("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        throw new Error("This browser does not support live voice. Use text chat instead.");
      }
      const local = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = local;
      const session = await start({ data: { consentVersion: "voice-v1", locale: company?.locale ?? "en-GB" } });
      const connection = new RTCPeerConnection();
      peer.current = connection;
      local.getAudioTracks().forEach((track) => connection.addTrack(track, local));
      const output = new Audio();
      output.autoplay = true;
      audio.current = output;
      connection.ontrack = (event) => { output.srcObject = event.streams[0] ?? null; };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed" || connection.connectionState === "disconnected") {
          setStatus("error"); setError("Voice connection lost. Stop and reconnect.");
        }
      };
      const events = connection.createDataChannel("oai-events");
      channel.current = events;
      events.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (data.type === "input_audio_buffer.speech_started") setStatus("listening");
          if (data.type === "response.created") setStatus("thinking");
          if (data.type === "response.audio.delta" || data.type === "response.output_audio.delta") setStatus("speaking");
          if (data.type === "response.done") setStatus("listening");
          if (data.type === "conversation.item.input_audio_transcription.completed" && typeof data.transcript === "string") {
            setCaptions((rows) => [...rows, { who: "You", text: data.transcript as string }]);
          }
          if (data.type === "response.audio_transcript.done" && typeof data.transcript === "string") {
            setCaptions((rows) => [...rows, { who: "Assistant", text: data.transcript as string }]);
          }
        } catch { setError("Could not interpret a voice event."); }
      };
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.clientSecret}`, "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!answer.ok) throw new Error(`Voice connection rejected (${answer.status}).`);
      await connection.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      setStatus("listening");
    } catch (cause) {
      stop();
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not start voice.");
    }
  }

  async function sendText() {
    if (!company || !message.trim()) return;
    const text = message.trim();
    setMessage("");
    setCaptions((rows) => [...rows, { who: "You", text }]);
    setStatus("thinking");
    try {
      const result = await ask({ data: { companyId: company.id, intent: "ask", message: text } });
      setCaptions((rows) => [...rows, { who: "Assistant", text: result.replyMarkdown }]);
      setStatus(peer.current ? "listening" : "idle");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "The assistant could not answer.");
    }
  }

  if (!canUse) return null;
  return (
    <div className="print:hidden">
      <button type="button" aria-label="Open voice assistant" aria-expanded={open} onClick={() => setOpen((value) => !value)}
        className="rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring">Voice assistant</button>
      {open && <section aria-label="Voice assistant" className="fixed bottom-4 right-4 z-50 flex h-[min(75vh,580px)] w-[min(94vw,410px)] flex-col rounded-xl border bg-background p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">LinkBooks assistant</h2>
          <button type="button" onClick={() => { stop(); setOpen(false); }} aria-label="Close assistant">Close</button>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">Status: {status}. Voice does not have accounting action tools yet.</p>
        {!consent && <label className="my-2 flex gap-2 text-xs"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree to send live audio to the AI provider. Audio is not stored by this panel.</label>}
        <div className="my-2 flex flex-wrap gap-2">
          <button type="button" className="rounded border px-3 py-1" disabled={!consent || status === "connecting"} onClick={connect}>Start voice</button>
          <button type="button" className="rounded border px-3 py-1" onClick={stop}>Stop</button>
          <button type="button" className="rounded border px-3 py-1" disabled={!stream.current} onClick={() => {
            const next = !muted;
            stream.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
            setMuted(next);
          }}>{muted ? "Unmute" : "Mute"}</button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div role="log" aria-label="Live captions" aria-live="polite" className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded border p-3 text-sm">
          {captions.map((caption, index) => <p key={index}><strong>{caption.who}:</strong> {caption.text}</p>)}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void sendText(); }}>
          <input aria-label="Text message" className="min-w-0 flex-1 rounded border bg-background px-2 py-2 text-sm" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about your accounts..." />
          <button type="submit" className="rounded border px-3 py-2" disabled={!message.trim()}>Send</button>
        </form>
      </section>}
    </div>
  );
}
