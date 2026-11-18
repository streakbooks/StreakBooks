import type { AiJournalReviewCase, AiJournalReviewEvent } from "@/lib/ai/review-queue.functions";

export type AiJournalReviewAuditExport = {
  review: AiJournalReviewCase;
  events: AiJournalReviewEvent[];
};

/** Explicit schema and deterministic chronology for a complete case audit export. */
export const AI_REVIEW_AUDIT_CSV_COLUMNS = [
  "case_id",
  "company_id",
  "journal_id",
  "case_status",
  "case_version",
  "case_created_by",
  "case_assigned_to",
  "case_reviewed_by",
  "case_reviewed_at",
  "event_id",
  "event_created_at",
  "event_actor",
  "event_action",
  "event_previous_status",
  "event_new_status",
  "event_assigned_to",
  "event_note",
] as const;

/** Defuse spreadsheet formula injection in attacker-controlled notes and names. */
export function auditCsvField(raw: unknown): string {
  const value = raw === null || raw === undefined ? "" : String(raw);
  const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function buildAiReviewAuditCsv(exportData: AiJournalReviewAuditExport): string {
  const { review, events } = exportData;
  const rows = events.length > 0 ? events : [null];
  const header = AI_REVIEW_AUDIT_CSV_COLUMNS.map(auditCsvField).join(",");
  const lines = rows.map((event) => {
    const cells: unknown[] = [
      review.id,
      review.company_id,
      review.journal_id,
      review.status,
      review.version,
      review.created_by,
      review.assigned_to,
      review.reviewed_by,
      review.reviewed_at,
      event?.id,
      event?.created_at,
      event?.actor_id,
      event?.action,
      event?.previous_status,
      event?.new_status,
      event?.assigned_to,
      event?.note,
    ];
    return cells.map(auditCsvField).join(",");
  });
  return [header, ...lines].join("\r\n") + "\r\n";
}
