import { describe, expect, it } from "vitest";
import {
  buildAiReviewAuditCsv,
  auditCsvField,
  AI_REVIEW_AUDIT_CSV_COLUMNS,
} from "./review-audit-csv";
import type { AiJournalReviewAuditExport } from "./review-audit-csv";

const company = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const journal = "33333333-3333-4333-8333-333333333333";

function fixture(): AiJournalReviewAuditExport {
  return {
    review: {
      id, company_id: company, journal_id: journal,
      created_by: company, assigned_to: id, reviewed_by: id, reviewed_at: "2026-11-06T10:00:00Z",
      status: "reviewed", version: 3,
      created_at: "2026-11-05T10:00:00Z", updated_at: "2026-11-06T10:00:00Z",
      is_assigned_to_me: true, is_my_case: false,
    },
    events: [
      {
        id: company, actor_id: id, action: "comment", note: "Reviewed supplier invoices",
        previous_status: "assigned", new_status: "assigned", assigned_to: id, created_at: "2026-11-06T09:00:00Z",
      },
      {
        id, actor_id: id, action: "sign_off", note: "All evidence inspected",
        previous_status: "assigned", new_status: "reviewed", assigned_to: id, created_at: "2026-11-06T10:00:00Z",
      },
    ],
  };
}

describe("AI review case audit CSV security and completeness", () => {
  it("always includes explicit column names and all received chronological events", () => {
    const csv = buildAiReviewAuditCsv(fixture());
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3);
    for (const key of AI_REVIEW_AUDIT_CSV_COLUMNS)
      expect(csv.split("\r\n")[0]).toContain('"' + key + '"');
    expect(csv.indexOf("Reviewed supplier invoices")).toBeLessThan(csv.indexOf("All evidence inspected"));
  });

  it("encodes commas and quoted comments as one CSV field", () => {
    expect(auditCsvField('Asked "team", confirmed')).toBe('"Asked ""team"", confirmed"');
  });

  it("prefixes dangerous spreadsheet formulas, including leading whitespace", () => {
    for (const value of ["=HYPERLINK(\"test\")", "+3", "-2", "@cmd", "  =SUM(A1:A2)", "\t+SUM(A1:A2)"]) {
      expect(auditCsvField(value)).toBe('"' + "'" + value.replaceAll('"', '""') + '"');
    }
  });

  it("preserves benign signed-off reviewer notes without arbitrary transformation", () => {
    expect(auditCsvField("Reviewed 11 documents")).toBe('"Reviewed 11 documents"');
    expect(auditCsvField(null)).toBe('""');
    expect(auditCsvField("")).toBe('""');
  });

  it("keeps embedded CRLF inside a properly quoted CSV field", () => {
    expect(auditCsvField("First line\r\nSecond line")).toBe('"First line\r\nSecond line"');
  });

  it("exports one metadata row even when an imported case has no history yet", () => {
    const fixtureData = fixture();
    fixtureData.events = [];
    const csv = buildAiReviewAuditCsv(fixtureData);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
    expect(csv).toContain(id);
  });

  it("does not add financial posting or approval columns", () => {
    expect(AI_REVIEW_AUDIT_CSV_COLUMNS.join(",")).not.toMatch(/post_journal|authorise_payment|workpaper_approve/);
  });
});
