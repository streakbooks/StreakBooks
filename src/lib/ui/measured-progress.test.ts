import { describe, expect, it } from "vitest";
import {
  clampMeasuredProgress,
  measuredProgressLabel,
  measuredProgressPercent,
} from "@/lib/ui/measured-progress";

describe("measured-progress", () => {
  it("clamps completed into the total and rejects non-finite values", () => {
    expect(clampMeasuredProgress({ completed: 12, total: 10 })).toEqual({
      completed: 10,
      total: 10,
    });
    expect(clampMeasuredProgress({ completed: -1, total: 4 })).toEqual({
      completed: 0,
      total: 4,
    });
    expect(clampMeasuredProgress({ completed: 2, total: 0 })).toEqual({
      completed: 0,
      total: 0,
    });
  });

  it("computes honest percentages without inventing progress", () => {
    expect(measuredProgressPercent({ completed: 1, total: 4 })).toBe(25);
    expect(measuredProgressPercent({ completed: 0, total: 0 })).toBe(0);
    expect(measuredProgressPercent({ completed: 3, total: 3 })).toBe(100);
  });

  it("labels progress with real counts", () => {
    expect(measuredProgressLabel({ completed: 2, total: 5 }, { unit: "steps" })).toBe(
      "2 of 5 steps complete",
    );
    expect(measuredProgressLabel({ completed: 0, total: 0 })).toBe("No items to measure");
  });
});
