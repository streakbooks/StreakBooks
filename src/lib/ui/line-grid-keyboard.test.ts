import { describe, expect, it } from "vitest";
import { clampGridFocus, interpretLineGridKey } from "@/lib/ui/line-grid-keyboard";

describe("line-grid-keyboard", () => {
  it("moves across columns with Tab and wraps to the next row", () => {
    expect(interpretLineGridKey("Tab")).toEqual({ type: "move", rowDelta: 0, colDelta: 1 });
    expect(interpretLineGridKey("Tab", { shiftKey: true })).toEqual({
      type: "move",
      rowDelta: 0,
      colDelta: -1,
    });
    expect(interpretLineGridKey("Tab", { atLastCol: true })).toEqual({
      type: "move",
      rowDelta: 1,
      colDelta: 0,
    });
  });

  it("adds a row on Enter from the last row when enabled", () => {
    expect(interpretLineGridKey("Enter", { atLastRow: true })).toEqual({ type: "add-row" });
    expect(interpretLineGridKey("Enter", { atLastRow: false })).toEqual({
      type: "move",
      rowDelta: 1,
      colDelta: 0,
    });
    expect(interpretLineGridKey("Enter", { atLastRow: true, allowAddRowOnEnter: false })).toEqual({
      type: "move",
      rowDelta: 1,
      colDelta: 0,
    });
  });

  it("clamps focus within the grid and wraps columns", () => {
    expect(clampGridFocus(0, -1, 3, 4)).toEqual({ row: 0, col: 3 });
    expect(clampGridFocus(1, 4, 3, 4)).toEqual({ row: 2, col: 0 });
    expect(clampGridFocus(9, 1, 3, 4)).toEqual({ row: 2, col: 1 });
  });
});
