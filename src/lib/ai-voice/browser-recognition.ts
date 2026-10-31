type RecognitionResult = { isFinal: boolean; 0?: { transcript: string } };
export type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
export type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};
export type RecognitionConstructor = new () => BrowserRecognition;
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

export function browserRecognition(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const browser = window as SpeechWindow;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

export function recognitionError(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone permission denied. Allow microphone access in your browser’s site settings, then click Start listening again.";
    case "audio-capture":
      return "No microphone is available. Connect or enable a microphone and try again.";
    case "network":
      return "Speech recognition could not connect. Your browser may require internet access. Check your connection and try again.";
    case "no-speech":
      return "No speech detected. Click Start listening to try again.";
    case "language-not-supported":
      return "English speech recognition is unavailable in this browser. Use the keyboard or mouse controls.";
    case "aborted":
      return "Listening stopped.";
    default:
      return "Speech recognition could not start or was interrupted. Check your microphone and browser settings, then try again.";
  }
}

/** One click, one final result. Cancel also discards any queued browser callbacks. */
export function startSpeechCommand(
  Constructor: RecognitionConstructor,
  callbacks: {
    onListening(): void;
    onTranscript(transcript: string): void;
    onMessage(message: string): void;
  },
): () => void {
  let active = true;
  let recognition: BrowserRecognition | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    active = false;
    clearTimeout(timeout);
    if (!recognition) return;
    recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      /* Already stopped by the browser. */
    }
    recognition = undefined;
  };
  const finish = (message: string) => {
    if (!active) return;
    cancel();
    callbacks.onMessage(message);
  };
  try {
    recognition = new Constructor();
    recognition.lang = "en-GB";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (active) callbacks.onListening();
    };
    recognition.onresult = (event) => {
      if (!active) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.isFinal) continue;
        const transcript = result[0]?.transcript ?? "";
        cancel(); // Release microphone before matching or navigating.
        callbacks.onTranscript(transcript);
        return;
      }
    };
    recognition.onerror = (event) => finish(recognitionError(event.error));
    recognition.onend = () => finish("No command heard. Click Start listening to try again.");
    timeout = setTimeout(
      () => finish("Listening timed out. Click Start listening to try again."),
      15_000,
    );
    recognition.start();
  } catch (cause) {
    finish(recognitionError(cause instanceof Error ? cause.name : "unknown"));
  }
  return cancel;
}
