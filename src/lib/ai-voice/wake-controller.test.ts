import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WakeController } from "./wake-controller";
import { AssistantController } from "./assistant-controller";
import { buildWakeProfile } from "./wake-acoustics";
import { captureWakeAudio } from "./wake-capture";
import { permissionsForRole } from "@/lib/permissions";
import type { BrowserRecognition } from "./browser-recognition";
vi.mock("./wake-capture", () => ({ wakeCaptureSupported: () => true, captureWakeAudio: vi.fn() }));
class Recognition implements BrowserRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: BrowserRecognition["onstart"] = null;
  onresult: BrowserRecognition["onresult"] = null;
  onerror: BrowserRecognition["onerror"] = null;
  onend: BrowserRecognition["onend"] = null;
  static starts = 0;
  start() {
    Recognition.starts++;
    this.onstart?.();
  }
  abort() {}
}
const template = {
  seconds: 1,
  frames: Array.from({ length: 98 }, (_, i) =>
    Array.from({ length: 13 }, (_, k) => Math.sin(i + k)),
  ),
};
const profile = buildWakeProfile("Hey LinkBooks", [template, template, template]);
let storage: Map<string, string>, release: ReturnType<typeof vi.fn>;
function setup() {
  storage.set(
    "linkbooks.personal-wake.v1:user:company",
    JSON.stringify({ phrase: profile.phrase, enabled: true, profile }),
  );
  const assistant = new AssistantController({
    recognition: () => Recognition,
    navigate: async () => {},
    back: () => {},
  });
  assistant.setScope("user:company", "company", permissionsForRole("owner"), true);
  const wake = new WakeController(assistant);
  wake.connect();
  wake.setScope("user:company", true);
  return {
    assistant,
    wake,
    dispose: () => {
      wake.dispose();
      assistant.dispose();
    },
  };
}
describe("wake/command microphone lifecycle (capture mocked; real DSP has separate waveform/browser tests)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storage = new Map();
    Recognition.starts = 0;
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.mocked(captureWakeAudio).mockReset();
    release = vi.fn(async () => {});
    vi.mocked(captureWakeAudio).mockResolvedValue(release);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("loads enabled preferences without starting a microphone; disable and deletion are immediate", async () => {
    const s = setup();
    expect(s.wake.getSnapshot()).toMatchObject({ enabled: true, enrolled: true, armed: false });
    expect(captureWakeAudio).not.toHaveBeenCalled();
    await s.wake.arm();
    expect(captureWakeAudio).toHaveBeenCalledOnce();
    s.wake.configure("Hey LinkBooks", false);
    expect(s.wake.getSnapshot().armed).toBe(false);
    expect(release).toHaveBeenCalledOnce();
    s.wake.forget();
    expect(storage.has("linkbooks.personal-wake.v1:user:company")).toBe(false);
    s.dispose();
  });
  it("releases wake capture before command recognition, then returns to wake after Stop listening", async () => {
    const s = setup();
    await s.wake.arm();
    const capture = vi.mocked(captureWakeAudio).mock.calls[0]!;
    capture[3]();
    await vi.advanceTimersByTimeAsync(1);
    expect(capture[1].aborted).toBe(true);
    expect(release).toHaveBeenCalledOnce();
    expect(Recognition.starts).toBe(1);
    await s.assistant.submit("stop listening");
    await vi.advanceTimersByTimeAsync(1);
    expect(s.wake.getSnapshot().status).toBe("watching");
    expect(captureWakeAudio).toHaveBeenCalledTimes(2);
    s.wake.stopAll();
    expect(s.wake.getSnapshot().armed).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(captureWakeAudio).toHaveBeenCalledTimes(2);
    s.dispose();
  });
  it("pauses hidden pages and disarms on organisation, feature or cross-tab settings changes", async () => {
    const s = setup();
    await s.wake.arm();
    s.wake.environment(false);
    expect(s.wake.getSnapshot().status).toBe("suspended");
    s.wake.environment(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(captureWakeAudio).toHaveBeenCalledTimes(2);
    s.wake.storageChanged("linkbooks.personal-wake.v1:user:company");
    expect(s.wake.getSnapshot().armed).toBe(false);
    expect(s.wake.getSnapshot().enrolled).toBe(true);
    await s.wake.arm();
    s.wake.setScope("other:company", true);
    expect(s.wake.getSnapshot()).toMatchObject({ armed: false, enrolled: false, enabled: false });
    s.dispose();
  });
  it("cancels pending capture and ignores old detection callbacks", async () => {
    let resolve!: (release: () => Promise<void>) => void;
    vi.mocked(captureWakeAudio).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const s = setup(),
      arming = s.wake.arm();
    await vi.advanceTimersByTimeAsync(1);
    const old = vi.mocked(captureWakeAudio).mock.calls[0]!;
    s.wake.stopAll();
    resolve(release);
    await arming;
    old[3]();
    await vi.advanceTimersByTimeAsync(1);
    expect(release).toHaveBeenCalledOnce();
    expect(Recognition.starts).toBe(0);
    expect(s.wake.getSnapshot().status).toBe("off");
    s.dispose();
  });
  it("reports denial without retrying and invalidates enrollment when the phrase changes", async () => {
    vi.mocked(captureWakeAudio).mockRejectedValueOnce(
      new DOMException("denied", "NotAllowedError"),
    );
    const s = setup();
    await s.wake.arm();
    expect(s.wake.getSnapshot()).toMatchObject({ armed: false, status: "error" });
    expect(s.wake.getSnapshot().message).toContain("permission denied");
    await vi.advanceTimersByTimeAsync(60000);
    expect(captureWakeAudio).toHaveBeenCalledOnce();
    s.wake.configure("Hello LinkBooks", true);
    expect(s.wake.getSnapshot().enrolled).toBe(false);
    s.dispose();
  });
});
