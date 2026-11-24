import type { AcousticTemplate, WakeProfile } from "./wake-acoustics";
export function wakeCaptureSupported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    Boolean(
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      window.AudioContext &&
      window.AudioWorkletNode &&
      window.Worker,
    )
  );
}
/** Always called from an explicit enrollment/arm gesture. Returns a complete microphone release. */
export async function captureWakeAudio(
  profile: WakeProfile | null,
  signal: AbortSignal,
  onTemplate: (t: AcousticTemplate) => void,
  onWake: () => void,
  onError: (e: unknown) => void,
): Promise<() => Promise<void>> {
  if (!wakeCaptureSupported())
    throw new Error(
      "Wake detection needs HTTPS, microphone access, Web Audio, AudioWorklet and Web Workers. Use manual activation in this browser.",
    );
  let stream: MediaStream | undefined,
    context: AudioContext | undefined,
    worker: Worker | undefined,
    node: AudioWorkletNode | undefined;
  let closing: Promise<void> | undefined;
  const stop = () => {
    node?.disconnect();
    worker?.terminate();
    stream?.getTracks().forEach((t) => t.stop());
    if (context && context.state !== "closed" && !closing) closing = context.close();
  };
  let stage = "microphone access";
  signal.addEventListener("abort", stop, { once: true });
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    if (signal.aborted) {
      stop();
      throw new DOMException("Cancelled", "AbortError");
    }
    stage = "audio processing setup";
    // Use the device/browser rate. The acoustic worker resamples to 16 kHz itself;
    // forcing a context rate can reject otherwise supported microphone devices.
    context = new AudioContext();
    stage = "audio processor loading";
    await context.audioWorklet.addModule(new URL("./wake-capture.worklet.js", import.meta.url));
    if (signal.aborted) {
      stop();
      throw new DOMException("Cancelled", "AbortError");
    }
    worker = new Worker(new URL("./wake.worker.ts", import.meta.url), { type: "module" });
    worker.onerror = (e) => {
      stop();
      onError(e);
    };
    worker.onmessage = (e) => {
      if (signal.aborted) return;
      if (e.data.type === "wake") onWake();
      else if (e.data.type === "template") onTemplate(e.data.template as AcousticTemplate);
    };
    worker.postMessage({ type: "init", rate: context.sampleRate, profile });
    stage = "audio processor setup";
    node = new AudioWorkletNode(context, "streakbooks-wake-capture");
    node.port.onmessage = (e) => worker?.postMessage({ type: "pcm", pcm: e.data as Float32Array });
    stage = "microphone connection";
    context.createMediaStreamSource(stream).connect(node);
    // Connect silent output so worklet processing stays live. No microphone playback.
    const mute = context.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(context.destination);
    stream.getAudioTracks().forEach((t) =>
      t.addEventListener(
        "ended",
        () => {
          if (!signal.aborted) {
            stop();
            onError(new Error("Microphone access ended. Arm wake detection again when ready."));
          }
        },
        { once: true },
      ),
    );
    stage = "audio processing start";
    await context.resume();
    return async () => {
      signal.removeEventListener("abort", stop);
      stop();
      await closing;
    };
  } catch (error) {
    signal.removeEventListener("abort", stop);
    stop();
    if (
      error instanceof Error &&
      ["AbortError", "NotAllowedError", "SecurityError", "NotFoundError"].includes(error.name)
    )
      throw error;
    throw new Error(
      `Wake ${stage} failed: ${error instanceof Error ? error.message : "unsupported audio operation"}. Use manual activation or another supported browser.`,
      { cause: error },
    );
  }
}
