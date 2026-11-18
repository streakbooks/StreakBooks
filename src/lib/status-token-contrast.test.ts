import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function relativeLuminance({ L, C, h }: { L: number; C: number; h: number }): number {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}

function oklchValues(token: string): Array<{ L: number; C: number; h: number }> {
  const pattern = new RegExp(token + ":\\s*oklch\\(([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\)", "g");
  return Array.from(css.matchAll(pattern), (match) => ({
    L: Number(match[1]),
    C: Number(match[2]),
    h: Number(match[3]),
  }));
}

describe("Original LinkBooks cross-theme completion states", () => {
  it("keeps paid teal separate from approval green and brand colour", () => {
    expect(css).toContain("--color-complete-soft: var(--complete-soft)");
    expect(css).toContain("--color-complete-ink: var(--complete-ink)");
    expect(css).toContain("--complete-soft:");
    expect(css).toContain("--success-soft:");
  });

  it("provides readable teal completion badges in light and dark modes", () => {
    const backgrounds = oklchValues("--complete-soft");
    const foregrounds = oklchValues("--complete-ink");
    expect(backgrounds).toHaveLength(2);
    expect(foregrounds).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      const background = relativeLuminance(backgrounds[i]!);
      const foreground = relativeLuminance(foregrounds[i]!);
      const ratio =
        (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never overrides the completion semantics in preset themes", () => {
    expect(css.match(/--complete-soft:\s*oklch/g)).toHaveLength(2);
    expect(css).toContain(':root[data-linkbooks-palette="rose"]');
    expect(css).toContain(':root[data-linkbooks-palette="graphite"]');
  });
});
