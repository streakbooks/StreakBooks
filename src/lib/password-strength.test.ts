import { describe, expect, it } from "vitest";
import { scorePassword } from "@/lib/password-strength";

describe("scorePassword", () => {
  it("is empty for no input", () => {
    expect(scorePassword("")).toMatchObject({ score: 0, label: "", acceptable: false });
  });

  it("flags passwords below the server minimum as weak", () => {
    const r = scorePassword("abcdefgh");
    expect(r.acceptable).toBe(false);
    expect(r.score).toBe(1);
    expect(r.rules.find((x) => x.id === "number")?.met).toBe(false);
  });

  it("penalises common words, sequences and personal details", () => {
    expect(scorePassword("Password123!").score).toBeLessThanOrEqual(2);
    expect(scorePassword("12345678abc").score).toBe(1);
    expect(
      scorePassword("AlexMorgan2026!", ["Alex Morgan", "alex@acme.com"]).score,
    ).toBeLessThanOrEqual(2);
  });

  it("rewards long mixed passphrases", () => {
    const r = scorePassword("Tidal-Harbour-Ledger-47");
    expect(r.acceptable).toBe(true);
    expect(r.score).toBe(4);
    expect(r.label).toBe("Strong");
  });
});
