import { describe, expect, it } from "vitest";
import { hasConcurrentTaxReviewChange } from "./tax-gl-review-state";

describe("Tax GL review concurrent editing", () => {
  it("detects an edit made by another reviewer", () => {
    expect(hasConcurrentTaxReviewChange(true, 2, 3)).toBe(true);
    expect(hasConcurrentTaxReviewChange(true, null, 1)).toBe(true);
  });
  it("allows untouched or current-version drafts", () => {
    expect(hasConcurrentTaxReviewChange(false, 2, 3)).toBe(false);
    expect(hasConcurrentTaxReviewChange(true, 4, 4)).toBe(false);
    expect(hasConcurrentTaxReviewChange(true, null, null)).toBe(false);
  });
});
