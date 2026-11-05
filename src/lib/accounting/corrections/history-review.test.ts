import { describe, expect, it } from "vitest";
import type { CorrectionBatch } from "./contracts";
import {
  assertCorrectionUndoSnapshot,
  correctionEvidenceIssue,
  correctionHistoryCounts,
  correctionHistoryCsv,
  correctionUndoDateIssue,
  filterCorrectionHistory,
} from "./history-review";

const batch: CorrectionBatch = {
  id: "batch-1",
  company_id: "company-1",
  request_key: "request-1",
  reason: "=EVIL() reclassification",
  date_mode: "adjustment",
  adjustment_date: "2026-10-31",
  plan: {
    company_id: "company-1",
    currency: "USD",
    rows: [
      {
        id: "line-1",
        journal_id: "source-1",
        journal_number: "43",
        journal_date: "2026-10-30",
        source_type: "manual",
        source_reference: "INV-5",
        contact_name: null,
        source_account_id: "expense",
        source_account_code: "600",
        source_account_name: "Expense",
        description: null,
        memo: null,
        debit_minor: "10000",
        credit_minor: "0",
        posting_date: "2026-10-31",
        fingerprint: "fingerprint-1",
      },
    ],
    gross_minor: "10000",
    line_count: 1,
    journal_count: 1,
    date_mode: "adjustment",
    adjustment_date: "2026-10-31",
    reason: "=EVIL() reclassification",
    target: { id: "asset", code: "200", name: "Prepayments", updated_at: "2026-10-01" },
  },
  journal_ids: ["correction-journal-1"],
  status: "applied",
  created_by: "user-1",
  created_at: "2026-11-01T10:00:00Z",
  undo_date: null,
  undo_reason: null,
  undone_by: null,
  undone_at: null,
  undo_journal_ids: null,
};

describe("correction history review", () => {
  it("summarises and filters the loaded history without claiming a full ledger search", () => {
    const undone: CorrectionBatch = {
      ...batch,
      id: "batch-2",
      status: "undone",
      undo_journal_ids: ["reversal-1"],
    };
    expect(correctionHistoryCounts([batch, undone])).toEqual({
      total: 2,
      applied: 1,
      undone: 1,
      needsReview: 0,
    });
    expect(filterCorrectionHistory([batch, undone], "applied", "")).toEqual([batch]);
    expect(filterCorrectionHistory([batch, undone], "all", "INV-5")).toHaveLength(2);
    expect(filterCorrectionHistory([batch], "all", "43")).toEqual([batch]);
  });

  it("flags missing historical evidence and exports CSV cells without formulas", () => {
    const incomplete: CorrectionBatch = {
      ...batch,
      id: "batch-2",
      status: "undone",
      undo_journal_ids: [],
    };
    expect(correctionEvidenceIssue(incomplete)).toBe("Undo journal links are missing");
    expect(filterCorrectionHistory([batch, incomplete], "needs_review", "")).toEqual([incomplete]);
    const csv = correctionHistoryCsv([batch]);
    expect(csv).toContain("'=EVIL() reclassification");
    expect(csv).toContain("correction-journal-1");
    expect(csv).not.toContain("INV-5");
  });

  it("detects a stale status, altered journal identifiers or changed posting amounts", () => {
    expect(() => assertCorrectionUndoSnapshot(batch, batch)).not.toThrow();
    expect(() => assertCorrectionUndoSnapshot(batch, null)).toThrow("changed");
    expect(() => assertCorrectionUndoSnapshot(batch, { ...batch, status: "undone" })).toThrow(
      "already undone",
    );
    expect(() =>
      assertCorrectionUndoSnapshot(batch, { ...batch, journal_ids: ["different"] }),
    ).toThrow("evidence changed");
    expect(() =>
      assertCorrectionUndoSnapshot(batch, {
        ...batch,
        plan: {
          ...batch.plan,
          rows: [{ ...batch.plan.rows[0]!, debit_minor: "10001" }],
        },
      }),
    ).toThrow("evidence changed");
  });

  it("guards reason, dates and unsupported undo states", () => {
    expect(correctionUndoDateIssue(batch, "2026-11-05", "Fix classification")).toBeNull();
    expect(correctionUndoDateIssue(batch, "2026-10-30", "Fix classification")).toMatch(/before/);
    expect(correctionUndoDateIssue(batch, "2026-11-31", "Fix classification")).toMatch(/real/);
    expect(correctionUndoDateIssue(batch, "2026-11-05", "x")).toMatch(/reason/);
    expect(correctionUndoDateIssue({ ...batch, status: "undone" }, "2026-11-05", "Reason")).toMatch(
      /applied/,
    );
  });
});
