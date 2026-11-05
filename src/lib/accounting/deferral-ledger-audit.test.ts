import { describe, expect, it } from "vitest";
import {
  auditDeferralRecognitionJournals,
  type DeferralAuditEntry,
  type DeferralAuditJournal,
  type DeferralAuditLine,
  type DeferralAuditSource,
} from "./deferral-ledger-audit";

const schedule: DeferralAuditSource = {
  id: "schedule",
  name: "Annual prepaid license",
  total_minor: "2001",
  periods: 2,
  debit_account_id: "expense",
  credit_account_id: "prepayment",
};

const entries: DeferralAuditEntry[] = [
  { id: "e1", period_no: 1, amount_minor: "1000", journal_id: "j1" },
  { id: "e2", period_no: 2, amount_minor: "1001", journal_id: "j2" },
];

const journals: DeferralAuditJournal[] = [
  { id: "j1", status: "posted", idempotency_key: "deferral:e1", reversed_by_journal_id: null },
  { id: "j2", status: "posted", idempotency_key: "deferral:e2", reversed_by_journal_id: null },
];

const lines: DeferralAuditLine[] = [
  { journal_id: "j1", account_id: "expense", debit_minor: "1000", credit_minor: "0" },
  { journal_id: "j1", account_id: "prepayment", debit_minor: "0", credit_minor: "1000" },
  { journal_id: "j2", account_id: "expense", debit_minor: "1001", credit_minor: "0" },
  { journal_id: "j2", account_id: "prepayment", debit_minor: "0", credit_minor: "1001" },
];

describe("deferral recognition linked-ledger audit", () => {
  it("matches both journal account sides and exact integer allocations", () => {
    const result = auditDeferralRecognitionJournals(schedule, entries, journals, lines);
    expect(result.differenceMinor).toBe("0");
    expect(result.allocatedMinor).toBe("2001");
    expect(result.exceptionCount).toBe(0);
    expect(result.entries.map((entry) => entry.status)).toEqual(["matched", "matched"]);
  });

  it("separates reversed recognitions from live posted recognitions", () => {
    const result = auditDeferralRecognitionJournals(
      schedule,
      entries,
      [{ ...journals[0]!, reversed_by_journal_id: "reversal" }, journals[1]!],
      lines,
    );
    expect(result.entries[0]!.status).toBe("reversed");
    expect(result.exceptionCount).toBe(1);
  });

  it("detects a linked foreign journal and wrong posting accounts", () => {
    const result = auditDeferralRecognitionJournals(
      schedule,
      entries,
      [{ ...journals[0]!, idempotency_key: "elsewhere" }, journals[1]!],
      [{ ...lines[0]!, account_id: "wrong" }, ...lines.slice(1)],
    );
    expect(result.entries[0]!.status).toBe("mismatch");
    expect(result.entries[0]!.issues).toHaveLength(2);
  });

  it("detects missing journals, duplicate links, and incomplete period sums", () => {
    const result = auditDeferralRecognitionJournals(
      schedule,
      [entries[0]!, { ...entries[1]!, journal_id: "j1" }],
      [journals[0]!],
      lines,
    );
    expect(result.entries[1]!.status).toBe("mismatch");
    expect(result.entries[1]!.issues).toContain(
      "The same journal is linked to more than one recognition period.",
    );
    const absent = auditDeferralRecognitionJournals(schedule, entries, [], []);
    expect(absent.entries[0]!.status).toBe("mismatch");
    const incomplete = auditDeferralRecognitionJournals(
      schedule,
      entries.slice(0, 1),
      journals,
      lines,
    );
    expect(incomplete.scheduleIssues).toHaveLength(2);
  });

  it("refuses unsafe floating-point minor units instead of inventing a match", () => {
    const invalid = auditDeferralRecognitionJournals(
      schedule,
      [{ ...entries[0]!, amount_minor: Number.MAX_SAFE_INTEGER + 1 }, entries[1]!],
      journals,
      lines,
    );
    expect(invalid.allocatedMinor).toBeNull();
    expect(invalid.entries[0]!.status).toBe("mismatch");
  });

  it("allows unposted future entries without claiming a posted journal exists", () => {
    const result = auditDeferralRecognitionJournals(
      schedule,
      [{ ...entries[0]!, journal_id: null }, entries[1]!],
      journals,
      lines,
    );
    expect(result.entries[0]!.status).toBe("unposted");
    expect(result.exceptionCount).toBe(0);
  });
});
