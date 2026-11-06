/**
 * Accountant handoff for previously reviewed AI journal evidence.
 * A journal review is evidence context only; it never changes workpaper state.
 */
export type AiWorkpaperReviewSource = {
  id: string;
  journal_id: string;
  status: "open" | "assigned" | "reviewed" | "reopened";
  assigned_to: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

export type AiWorkpaperJournalSource = {
  id: string;
  journal_number: number;
  journal_date: string;
  status: string;
  source_type: string;
};

export type AiWorkpaperEvidenceLink = {
  reviewId: string;
  journalId: string;
  journalNumber: number;
  journalDate: string;
  journalStatus: string;
  sourceType: string;
  reviewStatus: AiWorkpaperReviewSource["status"];
  reviewedAt: string | null;
  reviewerId: string | null;
  signal: "reviewed_evidence" | "needs_follow_up" | "journal_not_posted";
  explanation: string;
};

export function linkAiReviewsToWorkpaper(
  reviews: AiWorkpaperReviewSource[],
  journals: AiWorkpaperJournalSource[],
  journalIdsOnAccount: readonly string[],
  asOf: string,
): AiWorkpaperEvidenceLink[] {
  const accountJournalIds = new Set(journalIdsOnAccount);
  const headerById = new Map(journals.map((journal) => [journal.id, journal]));
  return reviews.flatMap((review) => {
    const journal = headerById.get(review.journal_id);
    if (!journal || !accountJournalIds.has(review.journal_id) || journal.journal_date > asOf)
      return [];
    const posted = journal.status === "posted";
    const signedOff =
      review.status === "reviewed" && Boolean(review.reviewed_at && review.reviewed_by);
    const signal: AiWorkpaperEvidenceLink["signal"] = !posted
      ? "journal_not_posted"
      : signedOff
        ? "reviewed_evidence"
        : "needs_follow_up";
    return [{
      reviewId: review.id,
      journalId: journal.id,
      journalNumber: journal.journal_number,
      journalDate: journal.journal_date,
      journalStatus: journal.status,
      sourceType: journal.source_type,
      reviewStatus: review.status,
      reviewedAt: review.reviewed_at,
      reviewerId: review.reviewed_by,
      signal,
      explanation: !posted
        ? "This journal is no longer posted; its previous AI review cannot be relied on as current posted evidence."
        : signedOff
          ? "An independent AI evidence review was recorded. It is not a balance reconciliation or workpaper sign-off."
          : "An AI journal evidence case exists, but independent review is not currently signed off.",
    }];
  });
}

export function countAiWorkpaperEvidence(
  entries: AiWorkpaperEvidenceLink[],
): { reviewed: number; followUp: number; notPosted: number } {
  return {
    reviewed: entries.filter((entry) => entry.signal === "reviewed_evidence").length,
    followUp: entries.filter((entry) => entry.signal === "needs_follow_up").length,
    notPosted: entries.filter((entry) => entry.signal === "journal_not_posted").length,
  };
}
