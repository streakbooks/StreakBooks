import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdvisorServiceCode } from "@/lib/advisors/catalogue";
import type { AdvisorChatMessage, AdvisorChatState } from "@/lib/advisors/chat-engine";
import { sendAdvisorChatMessage, startAdvisorChat } from "@/lib/advisors/chat.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { cn } from "@/lib/utils";

type Props = {
  serviceCode: AdvisorServiceCode;
  /** Parent pages must only mount this after service selection. */
  enabled: boolean;
};

export function AdvisorChatPanel({ serviceCode, enabled }: Props) {
  const consentId = useId();
  const start = useServerFn(startAdvisorChat);
  const send = useServerFn(sendAdvisorChatMessage);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<AdvisorChatState | null>(null);
  const [messages, setMessages] = useState<AdvisorChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disclosure, setDisclosure] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open, minimized]);

  if (!enabled) return null;

  async function beginChat() {
    if (!consent) {
      setError("Please confirm consent before starting the Advisors chat.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await start({ data: { serviceCode, consent: true as const } });
      setToken(result.token);
      setState(result.state);
      setMessages(result.messages);
      setDisclosure(result.aiDisclosure);
      setOpen(true);
      setMinimized(false);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    if (!state || !draft.trim()) return;
    setBusy(true);
    setError(null);
    const text = draft.trim();
    setDraft("");
    try {
      const result = await send({
        data: {
          token: token || `local-${serviceCode}`,
          serviceCode,
          text,
          state,
        },
      });
      setState(result.state);
      setMessages((current) => [...current, ...result.messages]);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="fixed right-4 bottom-4 z-40 w-[min(100%-2rem,22rem)] space-y-3 rounded-2xl border border-border bg-card p-4 shadow-raised">
        <div className="flex items-start gap-3">
          <MessageCircle className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">LinkBooks Advisors AI</p>
            <p className="text-sm text-muted-foreground">
              Optional qualification chat for your selected service. It never opens before you
              choose a service.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id={consentId}
            checked={consent}
            onCheckedChange={(value) => setConsent(value === true)}
          />
          <Label htmlFor={consentId} className="text-sm leading-snug font-normal">
            I agree that LinkBooks may collect and retain this chat to qualify my enquiry and follow
            up about Advisors services.
          </Label>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void beginChat()}>
            Start AI chat
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href="#plans">View plans instead</a>
          </Button>
        </div>
      </div>
    );
  }

  if (minimized) {
    return (
      <div className="fixed right-4 bottom-4 z-40">
        <Button type="button" onClick={() => setMinimized(false)} className="shadow-raised">
          <MessageCircle className="size-4" aria-hidden="true" />
          Reopen Advisors AI
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-label="LinkBooks Advisors AI chat"
      className="fixed right-4 bottom-4 z-40 flex h-[min(70vh,34rem)] w-[min(100%-2rem,24rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-raised"
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div>
          <p className="text-sm font-semibold">Advisors AI</p>
          <p className="text-xs text-muted-foreground">Selected: {serviceCode}</p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Minimize chat"
            onClick={() => setMinimized(true)}
          >
            <Minus className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      {disclosure ? (
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">{disclosure}</p>
      ) : null}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
              message.role === "visitor"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            )}
          >
            {message.content}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error ? (
        <p className="px-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onSend();
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask, answer, or type skip"
          aria-label="Chat message"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !draft.trim()}>
          Send
        </Button>
      </form>
      <div className="flex flex-wrap gap-2 border-t px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setDraft("skip");
          }}
        >
          Skip questions
        </Button>
        <Button type="button" size="sm" variant="outline" asChild>
          <a href="#plans">View plans</a>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setDraft("human advisor")}
        >
          Human advisor
        </Button>
        <Button type="button" size="sm" variant="outline" asChild>
          <a href={`/advisors/book?service=${serviceCode}`}>Book consultation</a>
        </Button>
      </div>
    </section>
  );
}
