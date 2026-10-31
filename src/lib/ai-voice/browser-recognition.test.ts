import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startSpeechCommand,
  type BrowserRecognition,
  type RecognitionEvent,
} from "./browser-recognition";

class FakeRecognition implements BrowserRecognition {
  static latest: FakeRecognition;
  lang = "";
  continuous = true;
  interimResults = true;
  maxAlternatives = 0;
  onstart: BrowserRecognition["onstart"] = null;
  onresult: BrowserRecognition["onresult"] = null;
  onerror: BrowserRecognition["onerror"] = null;
  onend: BrowserRecognition["onend"] = null;
  start = vi.fn(() => this.onstart?.());
  abort = vi.fn();
  constructor() {
    FakeRecognition.latest = this;
  }
}
const final = (text = "open invoices"): RecognitionEvent => ({
  resultIndex: 0,
  results: [{ isFinal: true, 0: { transcript: text } }],
});

describe("one-command browser speech sessions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function begin() {
    const callbacks = { onListening: vi.fn(), onTranscript: vi.fn(), onMessage: vi.fn() };
    const cancel = startSpeechCommand(FakeRecognition, callbacks);
    return { ...callbacks, cancel, speech: FakeRecognition.latest };
  }

  it("starts only on request and configures a single English final result", () => {
    const session = begin();
    expect(session.speech).toMatchObject({
      lang: "en-GB",
      continuous: false,
      interimResults: false,
      maxAlternatives: 1,
    });
    expect(session.speech.start).toHaveBeenCalledOnce();
    expect(session.onListening).toHaveBeenCalledOnce();
  });

  it("releases the microphone before delivery and ignores duplicate finals", () => {
    const session = begin();
    const queuedResult = session.speech.onresult!;
    session.onTranscript.mockImplementation(() =>
      expect(session.speech.abort).toHaveBeenCalledOnce(),
    );
    queuedResult(final());
    queuedResult(final("open bills"));
    expect(session.onTranscript).toHaveBeenCalledExactlyOnceWith("open invoices");
    expect(session.speech.onresult).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores interim results and delivers only the first final in a batch", () => {
    const session = begin();
    session.speech.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: "open bills" } }],
    });
    expect(session.onTranscript).not.toHaveBeenCalled();
    session.speech.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: "open invoices" } },
        { isFinal: true, 0: { transcript: "open bills" } },
      ],
    });
    expect(session.onTranscript).toHaveBeenCalledExactlyOnceWith("open invoices");
  });

  it("discards queued callbacks after Stop, dismissal, or a context change", () => {
    const session = begin();
    const queuedResult = session.speech.onresult!;
    const queuedError = session.speech.onerror!;
    const queuedEnd = session.speech.onend!;
    session.cancel();
    session.cancel();
    queuedResult(final());
    queuedError({ error: "network" });
    queuedEnd();
    vi.runAllTimers();
    expect(session.speech.abort).toHaveBeenCalledOnce();
    expect(session.onTranscript).not.toHaveBeenCalled();
    expect(session.onMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["not-allowed", "permission denied"],
    ["service-not-allowed", "permission denied"],
    ["audio-capture", "No microphone"],
    ["network", "internet access"],
    ["no-speech", "No speech detected"],
    ["language-not-supported", "English speech recognition"],
  ])("explains %s and stops", (error, message) => {
    const session = begin();
    session.speech.onerror?.({ error });
    expect(session.onMessage).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(session.speech.abort).toHaveBeenCalledOnce();
    expect(session.onTranscript).not.toHaveBeenCalled();
  });

  it("ends cleanly without speech and permits a fresh session", () => {
    const first = begin();
    first.speech.onend?.();
    expect(first.onMessage).toHaveBeenCalledWith(expect.stringContaining("No command heard"));
    const second = begin();
    second.speech.onresult?.(final());
    expect(second.onTranscript).toHaveBeenCalledOnce();
  });

  it("times out instead of leaving the microphone active", () => {
    const session = begin();
    vi.advanceTimersByTime(15_000);
    expect(session.speech.abort).toHaveBeenCalledOnce();
    expect(session.onMessage).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  });

  it("handles synchronous permission rejection", () => {
    class DeniedRecognition extends FakeRecognition {
      override start = vi.fn(() => {
        throw new DOMException("Denied", "NotAllowedError");
      });
    }
    const onMessage = vi.fn();
    startSpeechCommand(DeniedRecognition, {
      onListening: vi.fn(),
      onTranscript: vi.fn(),
      onMessage,
    });
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining("permission denied"));
    expect(FakeRecognition.latest.abort).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
