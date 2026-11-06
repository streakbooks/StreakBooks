import { describe, expect, it } from "vitest";
import {
  countAiWorkpaperEvidence,
  linkAiReviewsToWorkpaper,
  type AiWorkpaperReviewSource,
  type AiWorkpaperJournalSource,
} from "./workpaper-handoff";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

function review(journal_id = A, fields: Partial<AiWorkpaperReviewSource> = {}): AiWorkpaperReviewSource {
  return {
    id: journal_id,
    journal_id,
    status: "reviewed",
    assigned_to: B,
    reviewed_by: B,
    reviewed_at: "2026-11-03T12:00:00Z",
    updated_at: "2026-11-04T12:00:00Z",
    ...fields,
  };
}
function journal(id = A, fields: Partial<AiWorkpaperJournalSource> = {}): AiWorkpaperJournalSource {
  return {
    id,
    journal_number: 123,
    journal_date: "2026-11-01",
    status: "posted",
    source_type: "manual",
    ...fields,
  };
}

describe("AI-to-accountant workpaper evidence handoff", () => {
  it("links a signed-off AI review to the real journal and correct account", () => {
    const out = linkAiReviewsToWorkpaper([review()], [journal()], [A], "2026-11-06");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      journalId: A, reviewId: A, journalNumber: 123,
      signal: "reviewed_evidence", reviewStatus: "reviewed",
    });
    expect(out[0]?.explanation).toMatch(/not a balance reconciliation/);
  });

  it("never attributes a journal review to an unrelated chart-of-accounts account", () => {
    expect(linkAiReviewsToWorkpaper([review()], [journal()], [B], "2026-11-06")).toEqual([]);
  });

  it("does not include journals beyond the workpaper as-of date", () => {
    expect(linkAiReviewsToWorkpaper([review()], [journal()], [A], "2026-10-31")).toEqual([]);
  });

  it("does not treat open, assigned or reopened review cases as signed off", () => {
    const statuses = ["open", "assigned", "reopened"] as const;
    for (const status of statuses) {
      const out = linkAiReviewsToWorkpaper([review(A, { status, reviewed_by: null, reviewed_at: null })], [journal()], [A], "2026-11-06");
      expect(out[0]?.signal).toBe("needs_follow_up");
    }
  });

  it("rejects an inconsistent sign-off lacking a reviewer or review date", () => {
    for (const fields of [{ reviewed_by: null }, { reviewed_at: null }]) {
      const out = linkAiReviewsToWorkpaper([review(A, fields)], [journal()], [A], "2026-11-06");
      expect(out[0]?.signal).toBe("needs_follow_up");
    }
  });

  it("flags a reversed journal even if its earlier AI review was signed off", () => {
    const out = linkAiReviewsToWorkpaper([review()], [journal(A, { status: "reversed" })], [A], "2026-11-06");
    expect(out[0]?.signal).toBe("journal_not_posted");
    expect(out[0]?.explanation).toMatch(/no longer posted/i);
  });

  it("does not fabricate evidence for a missing or cross-tenant journal header", () => {
    expect(linkAiReviewsToWorkpaper([review()], [], [A], "2026-11-06")).toEqual([]);
  });

  it("groups review statuses without modifying an accountant workpaper or recording approval", () => {
    const out = linkAiReviewsToWorkpaper(
      [review(A), review(B, { status: "open", reviewed_by: null, reviewed_at: null }), review(C)],
      [journal(A), journal(B), journal(C, { status: "reversed" })],
      [A,B,C],
      "2026-11-06",
    );
    expect(countAiWorkpaperEvidence(out)).toEqual({ reviewed: 1, followUp: 1, notPosted: 1 });
    expect(JSON.stringify(out)).not.toMatch(/supportingBalanceMinor|prepared_by|workpaper_id/);
  });

  it("does not double-count repeated journal-line references for an account", () => {
    expect(linkAiReviewsToWorkpaper([review()], [journal()], [A,A,A], "2026-11-06")).toHaveLength(1);
  });
});
