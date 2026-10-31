/** Personal phrase spotting: MFCC templates + constrained dynamic time warping, not ASR.
 * No pretrained weights, network service, text decoder, or audio persistence.
 */
export const WAKE_MODEL_VERSION = 1;
export type AcousticTemplate = { frames: number[][]; seconds: number };
export type WakeProfile = {
  version: 1;
  phrase: string;
  templates: AcousticTemplate[];
  threshold: number;
};
const RATE = 16000,
  FFT = 512,
  HOP = 160,
  WINDOW = 400,
  BANDS = 26,
  COEFFICIENTS = 13;
const hamming = Array.from(
  { length: WINDOW },
  (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WINDOW - 1)),
);
const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number) => 700 * (10 ** (mel / 2595) - 1);
const edges = Array.from({ length: BANDS + 2 }, (_, i) =>
  Math.floor(
    ((FFT + 1) * melToHz(hzToMel(80) + ((hzToMel(7600) - hzToMel(80)) * i) / (BANDS + 1))) / RATE,
  ),
);
function powerSpectrum(frame: Float64Array) {
  const real = frame.slice(),
    imaginary = new Float64Array(FFT);
  for (let i = 1, j = 0; i < FFT; i++) {
    let bit = FFT >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j]!, real[i]!];
  }
  for (let length = 2; length <= FFT; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    for (let offset = 0; offset < FFT; offset += length)
      for (let j = 0; j < length / 2; j++) {
        const a = offset + j,
          b = a + length / 2,
          c = Math.cos(angle * j),
          d = Math.sin(angle * j);
        const re = real[b]! * c - imaginary[b]! * d,
          im = real[b]! * d + imaginary[b]! * c;
        real[b] = real[a]! - re;
        imaginary[b] = imaginary[a]! - im;
        real[a] = real[a]! + re;
        imaginary[a] = imaginary[a]! + im;
      }
  }
  return real.slice(0, FFT / 2 + 1).map((v, i) => (v * v + imaginary[i]! ** 2) / FFT);
}
export function acousticTemplate(samples: Float32Array, sampleRate: number): AcousticTemplate {
  const count = Math.floor((samples.length * RATE) / sampleRate);
  const pcm = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = (i * sampleRate) / RATE,
      lo = Math.floor(p),
      a = samples[lo] ?? 0;
    pcm[i] = a + ((samples[lo + 1] ?? a) - a) * (p - lo);
  }
  const frames: number[][] = [];
  for (let offset = 0; offset + WINDOW <= pcm.length; offset += HOP) {
    const frame = new Float64Array(FFT);
    for (let j = 0; j < WINDOW; j++)
      frame[j] = ((pcm[offset + j] ?? 0) - 0.97 * (pcm[offset + j - 1] ?? 0)) * hamming[j]!;
    const power = powerSpectrum(frame),
      mel: number[] = [];
    for (let band = 0; band < BANDS; band++) {
      let energy = 0;
      const left = edges[band]!,
        middle = edges[band + 1]!,
        right = edges[band + 2]!;
      for (let k = left; k < right; k++)
        energy +=
          (power[k] ?? 0) *
          (k < middle ? (k - left) / (middle - left) : (right - k) / (right - middle));
      mel.push(Math.log(Math.max(energy, 1e-12)));
    }
    // Exclude overall energy (c0). Preserve spectral identity; remove channel mean only.
    frames.push(
      Array.from(
        { length: COEFFICIENTS },
        (_, k) =>
          mel.reduce(
            (sum, v, n) => sum + v * Math.cos((Math.PI * (k + 1) * (n + 0.5)) / BANDS),
            0,
          ) / BANDS,
      ),
    );
  }
  if (frames.length)
    for (let k = 0; k < COEFFICIENTS; k++) {
      const mean = frames.reduce((s, f) => s + f[k]!, 0) / frames.length;
      for (const frame of frames) frame[k] = frame[k]! - mean;
    }
  return { frames, seconds: count / RATE };
}
export function acousticDistance(a: AcousticTemplate, b: AcousticTemplate): number {
  const x = a.frames,
    y = b.frames;
  if (!x.length || !y.length || a.seconds / b.seconds < 0.55 || a.seconds / b.seconds > 1.8)
    return Infinity;
  const width = y.length + 1;
  const costs = new Float64Array((x.length + 1) * width).fill(Infinity);
  costs[0] = 0;
  const local = new Float32Array(costs.length);
  const band = Math.max(
    Math.abs(x.length - y.length) + 2,
    Math.ceil(Math.max(x.length, y.length) * 0.3),
  );
  for (let i = 1; i <= x.length; i++)
    for (let j = Math.max(1, i - band); j <= Math.min(y.length, i + band); j++) {
      let distance = 0;
      for (let k = 0; k < COEFFICIENTS; k++) distance += (x[i - 1]![k]! - y[j - 1]![k]!) ** 2;
      const at = i * width + j;
      local[at] = Math.sqrt(distance / COEFFICIENTS);
      costs[at] = local[at]! + Math.min(costs[at - width]!, costs[at - 1]!, costs[at - width - 1]!);
    }
  // A short different phoneme must not disappear in the average of an otherwise similar phrase.
  const path: number[] = [];
  let i = x.length,
    j = y.length;
  while (i > 0 && j > 0) {
    const at = i * width + j;
    path.push(local[at]!);
    const diagonal = costs[at - width - 1]!,
      up = costs[at - width]!,
      left = costs[at - 1]!;
    if (diagonal <= up && diagonal <= left) {
      i--;
      j--;
    } else if (up <= left) i--;
    else j--;
  }
  if (!path.length) return Infinity;
  const mean = path.reduce((sum, v) => sum + v, 0) / path.length;
  const sorted = path.sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(path.length / 4)));
  return 0.5 * mean + (0.5 * sorted.reduce((sum, v) => sum + v, 0)) / sorted.length;
}
export function buildWakeProfile(phrase: string, templates: AcousticTemplate[]): WakeProfile {
  if (
    !validWakePhrase(phrase) ||
    templates.length !== 3 ||
    templates.some((t) => t.seconds < 0.45 || t.seconds > 3.5 || t.frames.length < 30)
  )
    throw new Error("Record three clear phrases, each between half a second and three seconds.");
  const distances = templates.flatMap((a, i) =>
    templates.slice(i + 1).map((b) => acousticDistance(a, b)),
  );
  const worst = Math.max(...distances);
  if (!Number.isFinite(worst) || worst > 0.65)
    throw new Error(
      "Those recordings differ too much. Use the same phrase, voice and microphone in a quiet room.",
    );
  return {
    version: 1,
    phrase: phrase.trim(),
    templates,
    threshold: Math.min(0.35, Math.max(0.11, worst * 1.15 + 0.025)),
  };
}
export function detectsWake(template: AcousticTemplate, profile: WakeProfile): boolean {
  if (template.seconds < 0.45 || template.seconds > 3.5) return false;
  const distances = profile.templates
    .map((t) => acousticDistance(template, t))
    .sort((a, b) => a - b);
  return distances[0]! <= profile.threshold && distances[1]! <= profile.threshold;
}
export function validWakePhrase(phrase: unknown): phrase is string {
  return (
    typeof phrase === "string" &&
    /^[\p{L}\p{N}][\p{L}\p{N} '-]{4,59}$/u.test(phrase.trim()) &&
    phrase.trim().split(/\s+/).length >= 2
  );
}
export function validWakeProfile(value: unknown): value is WakeProfile {
  if (!value || typeof value !== "object") return false;
  const p = value as WakeProfile;
  return (
    p.version === 1 &&
    validWakePhrase(p.phrase) &&
    Number.isFinite(p.threshold) &&
    p.threshold >= 0.11 &&
    p.threshold <= 0.35 &&
    Array.isArray(p.templates) &&
    p.templates.length === 3 &&
    p.templates.every(
      (t) =>
        !!t &&
        typeof t === "object" &&
        Number.isFinite(t.seconds) &&
        t.seconds >= 0.45 &&
        t.seconds <= 3.5 &&
        Array.isArray(t.frames) &&
        t.frames.length >= 30 &&
        t.frames.length <= 350 &&
        t.frames.every(
          (f) =>
            Array.isArray(f) &&
            f.length === COEFFICIENTS &&
            f.every((v) => Number.isFinite(v) && Math.abs(v) < 100),
        ),
    )
  );
}
/** Streaming VAD with bounded memory; silence separates phrases. Raw PCM lives only here. */
export class PhraseSegmenter {
  private buffer: number[] = [];
  private speech = false;
  private quiet = 0;
  private voiced = 0;
  constructor(
    private sampleRate: number,
    private onPhrase: (pcm: Float32Array) => void,
  ) {}
  push(chunk: Float32Array) {
    const energy = Math.sqrt(chunk.reduce((s, v) => s + v * v, 0) / chunk.length);
    const voiced = energy > 0.009;
    if (!this.speech) {
      this.buffer.push(...chunk);
      this.buffer = this.buffer.slice(-Math.ceil(this.sampleRate * 0.18));
      this.voiced = voiced ? this.voiced + chunk.length : 0;
      if (this.voiced >= this.sampleRate * 0.04) {
        this.speech = true;
        this.quiet = 0;
      }
      return;
    }
    this.buffer.push(...chunk);
    this.quiet = voiced ? 0 : this.quiet + chunk.length;
    if (this.quiet >= this.sampleRate * 0.3 || this.buffer.length >= this.sampleRate * 3.8) {
      const pcm = Float32Array.from(
        this.buffer.slice(
          0,
          Math.max(0, this.buffer.length - this.quiet + Math.floor(this.sampleRate * 0.08)),
        ),
      );
      this.buffer = [];
      this.speech = false;
      this.quiet = this.voiced = 0;
      if (pcm.length >= this.sampleRate * 0.45) this.onPhrase(pcm);
    }
  }
}
