import type { AssistantController } from "./assistant-controller";
import {
  buildWakeProfile,
  validWakePhrase,
  validWakeProfile,
  type AcousticTemplate,
  type WakeProfile,
} from "./wake-acoustics";
import { captureWakeAudio, wakeCaptureSupported } from "./wake-capture";
export type WakeSnapshot = {
  available: boolean;
  phrase: string;
  enabled: boolean;
  armed: boolean;
  enrolled: boolean;
  recordings: number;
  status: "off" | "arming" | "watching" | "enrolling" | "suspended" | "command" | "error";
  message: string;
};
export class WakeController {
  private snapshot: WakeSnapshot = {
    available: false,
    phrase: "Hey StreakBooks",
    enabled: false,
    armed: false,
    enrolled: false,
    recordings: 0,
    status: "off",
    message: "Manual activation. Wake microphone is off.",
  };
  private listeners = new Set<() => void>();
  private profile: WakeProfile | null = null;
  private scope = "";
  private available = false;
  private foreground = true;
  private generation = 0;
  private abort: AbortController | null = null;
  private release: (() => Promise<void>) | null = null;
  private lastActive = false;
  private enrollmentTimeout: ReturnType<typeof setTimeout> | undefined;
  private recordings: AcousticTemplate[] = [];
  private unsubscribe: (() => void) | null = null;
  constructor(private assistant: AssistantController) {}
  connect() {
    if (this.unsubscribe) return;
    const assistant = this.assistant;
    assistant.setStartGate(async () => {
      await this.halt();
      this.set({
        status: "command",
        message: "Command recognition active. Wake detection paused.",
      });
    });
    this.unsubscribe = assistant.subscribe(() => {
      const state = assistant.getSnapshot(),
        was = this.lastActive;
      this.lastActive = state.active;
      if (was && !state.active) {
        if (state.phase === "error" || !state.available) {
          this.disableForSession(
            "Voice recognition stopped. Arm wake detection explicitly to retry.",
          );
          return;
        }
        if (this.snapshot.armed && this.snapshot.enabled && this.foreground) void this.watch();
        else if (this.snapshot.status === "command")
          this.set({ status: "off", message: "Manual activation. Wake microphone is off." });
      }
      if (state.phase === "error" && this.snapshot.armed)
        this.disableForSession(
          "Voice recognition needs attention. Wake detection is off; arm it explicitly to retry.",
        );
    });
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(patch: Partial<WakeSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((f) => f());
  }
  private storageKey() {
    return `streakbooks.personal-wake.v1:${this.scope}`;
  }
  private persist() {
    try {
      localStorage.setItem(
        this.storageKey(),
        JSON.stringify({
          enabled: this.snapshot.enabled,
          phrase: this.snapshot.phrase,
          profile: this.profile,
        }),
      );
    } catch {
      this.set({
        message:
          "Browser storage is unavailable or full. Your settings work for this session only.",
      });
    }
  }
  setScope(scope: string, available: boolean, force = false) {
    if (!force && scope === this.scope && available === this.available) return;
    this.disableForSession("Wake microphone is off. Arm it explicitly when ready.");
    this.scope = scope;
    this.available = available;
    this.profile = null;
    this.recordings = [];
    let phrase = "Hey StreakBooks",
      enabled = false;
    if (available)
      try {
        const raw = localStorage.getItem(this.storageKey());
        if (raw && raw.length < 500_000) {
          const stored = JSON.parse(raw);
          if (validWakePhrase(stored.phrase)) phrase = stored.phrase;
          if (validWakeProfile(stored.profile) && stored.profile.phrase === phrase)
            this.profile = stored.profile;
          enabled = stored.enabled === true;
        }
      } catch {
        /* Do not trust malformed local storage. */
      }
    this.set({
      available,
      phrase,
      enabled,
      enrolled: !!this.profile,
      recordings: 0,
      status: "off",
      armed: false,
    });
  }
  storageChanged(key: string | null) {
    if (key === null || key === this.storageKey()) this.setScope(this.scope, this.available, true);
  }
  configure(phrase: string, enabled: boolean) {
    if (!this.available) return;
    if (!validWakePhrase(phrase)) {
      this.set({
        message:
          "Choose a phrase of 2 or more words, 5–60 characters, for example Hey StreakBooks.",
      });
      return;
    }
    this.disableForSession("Settings saved. Enroll your phrase, then arm detection explicitly.");
    if (phrase.trim() !== this.snapshot.phrase) this.profile = null;
    this.set({ phrase: phrase.trim(), enabled, enrolled: !!this.profile, recordings: 0 });
    this.persist();
  }
  async halt() {
    clearTimeout(this.enrollmentTimeout);
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    const release = this.release;
    this.release = null;
    await release?.();
  }
  private disableForSession(message: string) {
    // Disarm first so stopping command recognition cannot re-arm the microphone.
    this.recordings = [];
    this.set({ armed: false, status: "off", recordings: 0, message });
    void this.halt();
  }
  disarm() {
    this.disableForSession(
      "Wake detection stopped. Microphone released. Manual activation is available.",
    );
  }
  stopAll() {
    this.disarm();
    this.assistant.stop();
  }
  forget() {
    this.stopAll();
    this.profile = null;
    this.recordings = [];
    this.set({
      enabled: false,
      enrolled: false,
      recordings: 0,
      message: "Personal wake profile deleted from this browser.",
    });
    try {
      localStorage.removeItem(this.storageKey());
    } catch {
      /* No retained recording elsewhere. */
    }
  }
  private fail(error: unknown) {
    const name = error instanceof Error ? error.name : "";
    const message = ["NotAllowedError", "SecurityError"].includes(name)
      ? "Microphone permission denied. Allow microphone access in browser settings, then explicitly arm detection again."
      : name === "NotFoundError"
        ? "No microphone is available. Connect one or use manual activation."
        : error instanceof Error
          ? error.message
          : "Wake detection stopped. Check microphone access and use manual activation.";
    this.disableForSession(message);
    this.set({ status: "error" });
  }
  async enroll() {
    if (!this.available) return;
    this.disarm();
    this.assistant.stop();
    await this.halt();
    if (!wakeCaptureSupported()) {
      this.fail(new Error("Wake detection is unsupported in this browser. Use manual activation."));
      return;
    }
    this.recordings = [];
    const generation = this.generation,
      abort = new AbortController();
    this.abort = abort;
    this.enrollmentTimeout = setTimeout(() => {
      if (generation === this.generation)
        this.fail(
          new Error("Enrollment timed out. Microphone released. Try again in a quiet room."),
        );
    }, 30000);
    this.set({
      status: "enrolling",
      recordings: 0,
      message: `Say “${this.snapshot.phrase}” three times. Pause at least one second between repetitions. Use your normal voice.`,
    });
    try {
      const release = await captureWakeAudio(
        null,
        abort.signal,
        (template) => {
          if (generation !== this.generation) return;
          this.recordings.push(template);
          this.set({ recordings: this.recordings.length });
          if (this.recordings.length === 3) {
            try {
              this.profile = buildWakeProfile(this.snapshot.phrase, this.recordings);
              this.persist();
              void this.halt();
              this.recordings = [];
              this.set({
                status: "off",
                enrolled: true,
                message:
                  "Phrase enrolled on this browser only. Enable and arm detection to try it. No raw recordings were saved.",
              });
            } catch (error) {
              this.recordings = [];
              this.fail(error);
            }
          }
        },
        () => {},
        (error) => this.fail(error),
      );
      if (generation !== this.generation) await release();
      else this.release = release;
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }
  async arm() {
    if (!this.assistant.recognitionSupported()) {
      this.fail(
        new Error(
          "Browser command speech recognition is unavailable. Use text commands or normal controls.",
        ),
      );
      return;
    }
    if (!this.available || !this.snapshot.enabled || !this.profile) return;
    this.assistant.stop();
    this.set({ armed: true });
    await this.watch();
  }
  private async watch() {
    await this.halt();
    if (
      !this.available ||
      !this.foreground ||
      !this.snapshot.armed ||
      !this.snapshot.enabled ||
      !this.profile ||
      this.assistant.getSnapshot().active
    )
      return;
    const generation = this.generation,
      abort = new AbortController();
    this.abort = abort;
    this.set({ status: "arming", message: "Requesting the microphone for local wake detection…" });
    try {
      const release = await captureWakeAudio(
        this.profile,
        abort.signal,
        () => {},
        () => {
          if (generation !== this.generation) return;
          // The assistant's activation gate releases local capture before command ASR starts.
          this.assistant.start();
        },
        (error) => this.fail(error),
      );
      if (generation !== this.generation) await release();
      else {
        this.release = release;
        this.set({
          status: "watching",
          message: `Wake microphone on — say “${this.snapshot.phrase}”, then pause for Signal to activate.`,
        });
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }
  environment(foreground: boolean) {
    if (this.foreground === foreground) return;
    this.foreground = foreground;
    if (!foreground) {
      void this.halt();
      if (this.snapshot.armed)
        this.set({
          status: "suspended",
          message: "Wake detection paused while this page is hidden.",
        });
      else if (this.snapshot.status === "enrolling")
        this.set({
          status: "off",
          message: "Enrollment cancelled while the page was hidden. Try again.",
        });
    } else if (this.snapshot.armed && !this.assistant.getSnapshot().active) void this.watch();
  }
  permissionDenied() {
    this.disableForSession(
      "Microphone permission denied. Enable it in browser settings, then arm explicitly.",
    );
    this.set({ status: "error" });
  }
  dispose() {
    this.disarm();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.assistant.setStartGate(null);
  }
}
