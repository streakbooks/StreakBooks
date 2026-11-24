import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  acousticTemplate,
  buildWakeProfile,
  detectsWake,
  PhraseSegmenter,
  validWakeProfile,
  type AcousticTemplate,
} from "./wake-acoustics";
function fixture(name: string): AcousticTemplate {
  const wav = readFileSync(`e2e/voice/audio/${name}.wav`);
  let offset = 12,
    data = Buffer.alloc(0),
    rate = 0;
  while (offset + 8 <= wav.length) {
    const size = wav.readUInt32LE(offset + 4),
      kind = wav.toString("ascii", offset, offset + 4);
    if (kind === "fmt ") rate = wav.readUInt32LE(offset + 12);
    if (kind === "data") data = wav.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  const samples = new Float32Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  const phrases: Float32Array[] = [];
  const vad = new PhraseSegmenter(rate, (p) => phrases.push(p));
  for (let i = 0; i < samples.length; i += 320) vad.push(samples.slice(i, i + 320));
  expect(phrases).toHaveLength(1);
  return acousticTemplate(phrases[0]!, rate);
}
describe("on-device personal wake phrase acoustic matcher", () => {
  const templates = [1, 2, 3].map((n) => fixture(`hey-streakbooks-enroll-${n}`));
  const profile = buildWakeProfile("Hey StreakBooks", templates);
  it("enrolls three consistent acoustic templates and accepts a held-out slower utterance", () => {
    expect(validWakeProfile(profile)).toBe(true);
    expect(detectsWake(fixture("hey-streakbooks-heldout"), profile)).toBe(true);
  });
  for (const phrase of [
    "hello-streakbooks",
    "hey-luna",
    "hey-link-cooks",
    "open-invoices",
    "unrelated",
    "hey-lincoln",
  ])
    it(`rejects ${phrase}`, () => {
      const sample = fixture(`${phrase}-heldout`);
      expect(detectsWake(sample, profile)).toBe(false);
    });
  for (const [name, phrase] of [
    ["hello-streakbooks", "Hello StreakBooks"],
    ["hey-luna", "Hey Luna"],
  ])
    it(`enrolls and detects custom phrase ${phrase}`, () => {
      const custom = buildWakeProfile(
        phrase!,
        [1, 2, 3].map((n) => fixture(`${name}-enroll-${n}`)),
      );
      expect(detectsWake(fixture(`${name}-heldout`), custom)).toBe(true);
      expect(detectsWake(fixture("open-invoices-heldout"), custom)).toBe(false);
    });
  it("rejects silence, malformed profiles and inconsistent enrollment", () => {
    expect(detectsWake(acousticTemplate(new Float32Array(16000), 16000), profile)).toBe(false);
    expect(validWakeProfile({ ...profile, threshold: 5 })).toBe(false);
    expect(() => buildWakeProfile("hey", templates)).toThrow();
    expect(() =>
      buildWakeProfile("Hey StreakBooks", [
        templates[0]!,
        fixture("hey-luna-heldout"),
        fixture("unrelated-heldout"),
      ]),
    ).toThrow();
  });
});
