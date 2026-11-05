import { describe, expect, it } from "vitest";
import {
  auditRealisedFxJournals,
  type FxRealisedAuditJournal,
  type FxRealisedAuditLine,
  type FxRealisedAuditRow,
  type FxRealisedAuditTag,
} from "./fx-ledger-audit";

const record: FxRealisedAuditRow = {
  id: "fx1",
  kind: "sales",
  allocation_id: "allocation1",
  currency_code: "EUR",
  gain_loss_base_minor: "335",
  journal_id: "journal1",
  reversal_journal_id: null,
  reversed_at: null,
};
const journal: FxRealisedAuditJournal = {
  id: "journal1",
  status: "posted",
  source_type: "fx_realised",
  source_id: "allocation1",
  idempotency_key: "fx_realised:sales:allocation1:post",
  reversed_by_journal_id: null,
};
const lines: FxRealisedAuditLine[] = [
  { journal_id: "journal1", debit_minor: "335", credit_minor: "0" },
  { journal_id: "journal1", debit_minor: "0", credit_minor: "335" },
];
const tag: FxRealisedAuditTag = {
  journal_id: "journal1",
  kind: "realised",
  currency_code: "EUR",
};
const audit = (
  rows: FxRealisedAuditRow[] = [record],
  journals: FxRealisedAuditJournal[] = [journal],
  ledgerLines: FxRealisedAuditLine[] = lines,
  tags: FxRealisedAuditTag[] = [tag],
) => auditRealisedFxJournals(rows, journals, ledgerLines, tags);

describe("realised FX journal audit", () => {
  it("confirms exact posted journal, source, idempotency and currency tag", () => {
    const result = audit();
    expect(result.rowsChecked).toBe(1);
    expect(result.exceptions).toBe(0);
    expect(result.rows[0]).toMatchObject({
      status: "matched",
      gainLossMinor: "335",
    });
  });

  it("detects journal source, tag and amounts which do not match the allocation", () => {
    const result = audit(
      [record],
      [{ ...journal, source_id: "foreign" }],
      [{ ...lines[0]!, debit_minor: "334" }, lines[1]!],
      [{ ...tag, currency_code: "USD" }],
    );
    expect(result.rows[0]!.status).toBe("mismatch");
    expect(result.rows[0]!.issues).toHaveLength(3);
  });

  it("distinguishes balanced reversed postings and inconsistent reversal markers", () => {
    const original = {
      ...journal,
      reversed_by_journal_id: "reverse1",
    };
    const reversed = {
      ...record,
      reversed_at: "2026-11-05T12:00:00Z",
      reversal_journal_id: "reverse1",
    };
    expect(audit([reversed], [original]).rows[0]!.status).toBe("reversed");
    const inconsistent = audit([record], [original]);
    expect(inconsistent.rows[0]!.status).toBe("mismatch");
  });

  it("flags missing journals, duplicate links, and unsafe numeric conversion", () => {
    const absent = audit([record], [], [], []);
    expect(absent.rows[0]!.status).toBe("mismatch");
    const repeated = audit([record, { ...record, id: "fx2" }]);
    expect(repeated.rows[1]!.issues).toContain(
      "Journal is linked to multiple FX posting records.",
    );
    const unsafe = audit([
      { ...record, gain_loss_base_minor: Number.MAX_SAFE_INTEGER + 1 },
    ]);
    expect(unsafe.rows[0]!.gainLossMinor).toBeNull();
    expect(unsafe.rows[0]!.status).toBe("mismatch");
  });

  it("does not pretend the loaded recent page is the complete FX history", () => {
    const result = auditRealisedFxJournals([record], [journal], lines, [tag], 1, true);
    expect(result.hasMore).toBe(true);
    expect(result.limit).toBe(1);
  });
});
