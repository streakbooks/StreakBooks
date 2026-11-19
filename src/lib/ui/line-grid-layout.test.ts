import { describe, expect, it } from "vitest";
import { lineGridColumnStyle, lineGridTableMinWidth } from "@/lib/ui/line-grid-layout";

describe("line-grid-layout", () => {
  it("keeps fixed columns bounded and leaves fluid columns expandable", () => {
    expect(lineGridColumnStyle({ widthPx: 100, minWidthPx: 80 })).toEqual({
      width: 100,
      minWidth: 80,
    });
    expect(lineGridColumnStyle({ widthPx: 280, minWidthPx: 220, fluid: true })).toEqual({
      width: "auto",
      minWidth: 220,
    });
  });

  it("sums preferred widths for horizontal scroll floors", () => {
    expect(
      lineGridTableMinWidth([
        { widthPx: 48 },
        { widthPx: 280, minWidthPx: 220, fluid: true },
        { widthPx: 100 },
      ]),
    ).toBe(48 + 220 + 100);
  });
});
