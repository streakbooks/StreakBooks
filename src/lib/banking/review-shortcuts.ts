/** Pure keyboard decisions used by Banking. Never overrides browser modified-key shortcuts. */
export type ReviewShortcut = "search" | "previous" | "next" | null;

export function bankingReviewShortcut({
  key,
  modified = false,
  editing = false,
  previewOpen = false,
}: {
  key: string;
  modified?: boolean;
  editing?: boolean;
  previewOpen?: boolean;
}): ReviewShortcut {
  if (modified || editing) return null;
  if (previewOpen) {
    if (key === "ArrowLeft") return "previous";
    if (key === "ArrowRight") return "next";
    return null;
  }
  if (key === "/") return "search";
  return null;
}
