import { describe, expect, it } from "vitest";
import { taxGlReviewSnapshot, taxJournalEvidence, taxGlJournalDigest } from "./tax-gl-evidence";
import type { PostedLine } from "@/lib/accounting/reporting";

const base = {
  periodStart: "2026-01-01",
  periodEnd: "2026-03-31",
  basis: "accrual",
  outputAccountId: "out",
  inputAccountId: "in",
  returnOutputMinor: "2000",
  returnInputMinor: "1000",
  glOutputMinor: "2000",
  glInputMinor: "1000",
  journalLines: 2,
  documentOutputMinor: "2000",
  documentInputMinor: "1000",
  reversalOutputMinor: "0",
  reversalInputMinor: "0",
  journalDigest: "digest-1",
};
describe("tax GL review evidence", () => {
  it("preserves exact movement signs and navigable journal IDs", () => {
    const lines = [
      {
        line_id: "l1",
        journal_id: "j1",
        journal_number: 1,
        journal_date: "2026-02-02",
        account_id: "out",
        account_code: "2100",
        account_name: "Output",
        source_type: "sales_invoice",
        debit_minor: 0n,
        credit_minor: 2000n,
        line_no: 1,
      },
      {
        line_id: "l2",
        journal_id: "j2",
        journal_number: 2,
        journal_date: "2026-03-02",
        account_id: "in",
        account_code: "1200",
        account_name: "Input",
        source_type: "purchase_bill",
        debit_minor: 1000n,
        credit_minor: 0n,
        line_no: 1,
      },
    ] as unknown as PostedLine[];
    const res = taxJournalEvidence(lines, "out", "in", 1);
    expect(res.total).toBe(2);
    expect(res.truncated).toBe(true);
    expect(res.rows[0]).toMatchObject({
      journalId: "j2",
      accountSide: "input",
      movementMinor: "1000",
    });
    expect(lines[0]?.journal_id).toBe("j1");
    const digest = taxGlJournalDigest(lines);
    expect(digest).toBe(taxGlJournalDigest([...lines].reverse()));
    expect(digest).not.toBe(
      taxGlJournalDigest([{ ...lines[0]!, credit_minor: 2100n }, lines[1]!] as PostedLine[]),
    );
  });
  it("tracks changes to posting component even when net GL amount stays fixed", () => {
    expect(taxGlReviewSnapshot(base)).not.toBe(
      taxGlReviewSnapshot({
        ...base,
        documentOutputMinor: "1900",
        reversalOutputMinor: "100",
      }),
    );
    expect(taxGlReviewSnapshot(base)).not.toBe(
      taxGlReviewSnapshot({ ...base, journalDigest: "digest-2" }),
    );
    expect(taxGlReviewSnapshot(base)).toBe(taxGlReviewSnapshot({ ...base }));
  });
});
