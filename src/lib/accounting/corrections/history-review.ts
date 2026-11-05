import { toCsv } from "@/lib/sales/csv";
import type { CorrectionBatch } from "./contracts";

export type CorrectionHistoryFilter = "all" | "applied" | "undone" | "needs_review";

export type CorrectionUndoSnapshot = Pick<
  CorrectionBatch,
  "id" | "company_id" | "request_key" | "status" | "created_at" | "journal_ids" | "plan"
>;

/** Checks only the evidence returned in the loaded history page, not the entire ledger. */
export function correctionEvidenceIssue(batch: CorrectionBatch): string | null {
  if (!batch.journal_ids.length) return "Correction journal links are missing";
  if (!batch.plan.rows.length) return "The correction plan has no source lines";
  if (batch.status === "undone" && !batch.undo_journal_ids?.length) {
    return "Undo journal links are missing";
  }
  return null;
}

export function correctionHistoryCounts(rows: readonly CorrectionBatch[]) {
  return {
    total: rows.length,
    applied: rows.filter((row) => row.status === "applied").length,
    undone: rows.filter((row) => row.status === "undone").length,
    needsReview: rows.filter((row) => correctionEvidenceIssue(row) !== null).length,
  };
}

export function filterCorrectionHistory(
  rows: readonly CorrectionBatch[],
  filter: CorrectionHistoryFilter,
  query: string,
): CorrectionBatch[] {
  const term = query.trim().toLocaleLowerCase();
  return rows.filter((batch) => {
    if (filter === "needs_review") {
      if (!correctionEvidenceIssue(batch)) return false;
    } else if (filter !== "all" && batch.status !== filter) {
      return false;
    }
    if (!term) return true;
    return [
      batch.id,
      batch.request_key,
      batch.reason,
      batch.created_by,
      batch.plan.target.code,
      batch.plan.target.name,
      ...batch.plan.rows.map((row) => row.journal_number),
      ...batch.plan.rows.map((row) => row.source_reference),
    ].some((value) => String(value ?? "").toLocaleLowerCase().includes(term));
  });
}

/** A page-scoped, formula-safe audit index; existing detail exports carry line-level amounts. */
export function correctionHistoryCsv(rows: readonly CorrectionBatch[]): string {
  return toCsv(
    [
      "Batch ID",
      "Status",
      "Created at",
      "Created by",
      "Reason",
      "Posting policy",
      "Adjustment date",
      "Target account",
      "Source lines",
      "Correction journal IDs",
      "Undo journal IDs",
      "Undo date",
      "Undo reason",
      "Undone by",
      "Undone at",
      "Evidence review",
    ],
    rows.map((batch) => [
      batch.id,
      batch.status,
      batch.created_at,
      batch.created_by,
      batch.reason,
      batch.date_mode,
      batch.adjustment_date,
      `${batch.plan.target.code} ${batch.plan.target.name}`,
      batch.plan.rows.length,
      batch.journal_ids.join("; "),
      batch.undo_journal_ids?.join("; ") ?? "",
      batch.undo_date,
      batch.undo_reason,
      batch.undone_by,
      batch.undone_at,
      correctionEvidenceIssue(batch) ?? "No missing links detected in the loaded record",
    ]),
  );
}

/** Requires a newly read snapshot to match the batch the operator reviewed. */
export function assertCorrectionUndoSnapshot(
  reviewed: CorrectionBatch,
  latest: CorrectionUndoSnapshot | null,
): void {
  if (
    !latest ||
    reviewed.status !== "applied" ||
    latest.status !== "applied" ||
    latest.id !== reviewed.id ||
    latest.company_id !== reviewed.company_id
  ) {
    throw new Error("Correction batch changed or was already undone. Refresh history and review.");
  }
  const signature = (batch: CorrectionUndoSnapshot) =>
    JSON.stringify([
      batch.request_key,
      batch.created_at,
      batch.journal_ids,
      batch.plan.target.id,
      batch.plan.rows.map((row) => [
        row.id,
        row.journal_id,
        row.posting_date,
        row.debit_minor,
        row.credit_minor,
        row.fingerprint,
      ]),
    ]);
  if (signature(reviewed) !== signature(latest)) {
    throw new Error("Correction batch evidence changed. Refresh history before undoing.");
  }
}

/** Client-side guard; server-side correction RPC still enforces all posting locks and permissions. */
export function correctionUndoDateIssue(
  batch: CorrectionBatch,
  date: string,
  reason: string,
): string | null {
  if (batch.status !== "applied") return "Only applied batches can be undone.";
  if (correctionEvidenceIssue(batch)) return "Review missing correction evidence before undo.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Choose a valid undo date.";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return "Choose a real calendar date.";
  }
  if (batch.plan.rows.some((row) => row.posting_date > date)) {
    return "Undo cannot be dated before the original correction postings.";
  }
  if (reason.trim().length < 5 || reason.trim().length > 1000) {
    return "Enter an undo reason between 5 and 1000 characters.";
  }
  return null;
}
