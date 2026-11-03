import { describe, expect, it } from "vitest";
import { bankingReviewShortcut } from "./review-shortcuts";

describe("bank transaction keyboard shortcuts", () => {
  it("focuses search with / only when the preview is closed", () => {
    expect(bankingReviewShortcut({ key: "/" })).toBe("search");
    expect(bankingReviewShortcut({ key: "/", previewOpen: true })).toBeNull();
  });

  it("moves between records only while a preview is open", () => {
    expect(bankingReviewShortcut({ key: "ArrowLeft", previewOpen: true })).toBe("previous");
    expect(bankingReviewShortcut({ key: "ArrowRight", previewOpen: true })).toBe("next");
    expect(bankingReviewShortcut({ key: "ArrowLeft" })).toBeNull();
    expect(bankingReviewShortcut({ key: "ArrowRight" })).toBeNull();
  });

  it("does not intercept typing, editable content, or modified browser shortcuts", () => {
    for (const key of ["/", "ArrowLeft", "ArrowRight"]) {
      expect(bankingReviewShortcut({ key, editing: true })).toBeNull();
      expect(bankingReviewShortcut({ key, modified: true })).toBeNull();
      expect(bankingReviewShortcut({ key, editing: true, previewOpen: true })).toBeNull();
      expect(bankingReviewShortcut({ key, modified: true, previewOpen: true })).toBeNull();
    }
  });

  it("ignores unrelated keys", () => {
    expect(bankingReviewShortcut({ key: "Enter" })).toBeNull();
    expect(bankingReviewShortcut({ key: "Escape", previewOpen: true })).toBeNull();
  });
});
