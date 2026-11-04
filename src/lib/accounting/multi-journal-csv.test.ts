import { describe, expect, it } from "vitest";
import {
  journalBatchIdempotencyKey,
  MULTI_JOURNAL_CSV_HEADERS,
  previewMultiJournalCsv,
} from "./multi-journal-csv";
import type { JournalImportAccount } from "./journal-csv-import";

const accounts: JournalImportAccount[] = [
  { id: "expense", code: "500", is_active: true, is_postable: true, is_control: false },
  { id: "accrual", code: "210", is_active: true, is_postable: true, is_control: false },
  { id: "control", code: "200", is_active: true, is_postable: true, is_control: true },
];

const lines = [
  "journal_key,journal_date,memo,account_code,description,debit,credit",
  'oct,2026-10-31,"October accrual",500,Expense,100.00,',
  'nov,2026-11-30,"November accrual",500,Expense,50.00,',
  'oct,2026-10-31,"October accrual",210,Accrual,,100.00',
  'nov,2026-11-30,"November accrual",210,Accrual,,50.00',
];

const data = lines.join("\r\n");

describe("controlled multi-manual-journal staging", () => {
  it("exposes the expected 7-column file contract", () => {
    expect(MULTI_JOURNAL_CSV_HEADERS).toEqual([
      "journal_key",
      "journal_date",
      "memo",
      "account_code",
      "description",
      "debit",
      "credit",
    ]);
  });

  it("groups interleaved accounts into balanced independent previews without posting", () => {
    const result = previewMultiJournalCsv(data, accounts, "GBP");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      key: "oct",
      date: "2026-10-31",
      memo: "October accrual",
      totalMinor: "10000",
      totalDisplay: "100.00",
    });
    expect(result[0]?.lines).toHaveLength(2);
    expect(result[1]?.lines[0]).toMatchObject({ accountId: "expense", debit: "50.00" });
  });

  it("rejects invalid dates and inconsistent metadata within one journal key", () => {
    expect(
      () => previewMultiJournalCsv(data.replace("2026-11-30", "2026-11-31"), accounts, "GBP"),
    ).toThrow("real YYYY-MM-DD");
    expect(
      () => previewMultiJournalCsv(data.replace("November accrual", "Different memo"), accounts, "GBP"),
    ).toThrow("inconsistent date or memo");
  });

  it("rejects duplicate journals even when they use different keys", () => {
    const csv = [
      lines[0],
      "first,2026-10-31,Same entry,500,Debit,10,",
      "first,2026-10-31,Same entry,210,Credit,,10",
      "second,2026-10-31,Same entry,500,Debit,10,",
      "second,2026-10-31,Same entry,210,Credit,,10",
    ].join("\n");
    expect(() => previewMultiJournalCsv(csv, accounts, "GBP")).toThrow("identical date");
  });

  it("reuses source journal control-account, precision and balance safeguards", () => {
    expect(
      () => previewMultiJournalCsv(data.replace("500,Expense", "200,Expense"), accounts, "GBP"),
    ).toThrow("not allowed");
    expect(() => previewMultiJournalCsv(data.replace("100.00", "101.00"), accounts, "GBP")).toThrow(
      "must balance",
    );
    expect(() => previewMultiJournalCsv(data.replace("50.00", "50.001"), accounts, "GBP")).toThrow(
      "decimal precision",
    );
  });

  it("rejects too many journals, bad columns and invalid keys", () => {
    const many = [
      lines[0],
      ...Array.from({ length: 26 }, (_, index) => [
        "id" + index + ",2026-11-30,Memo " + index + ",500,Debit,1,",
        "id" + index + ",2026-11-30,Memo " + index + ",210,Credit,,1",
      ]).flat(),
    ].join("\n");
    expect(() => previewMultiJournalCsv(many, accounts, "GBP")).toThrow("25 journals");
    expect(
      () => previewMultiJournalCsv(data.replace("journal_key", "unknown"), accounts, "GBP"),
    ).toThrow("Required columns");
    expect(
      () => previewMultiJournalCsv(data.replace("oct,2026", "bad key,2026"), accounts, "GBP"),
    ).toThrow("journal_key");
  });

  it("rejects a group with fewer than 2 lines", () => {
    const csv = lines.slice(0, 3).join("\n");
    expect(() => previewMultiJournalCsv(csv, accounts, "GBP")).toThrow("2 to 200");
  });

  it("builds stable per-document identities and refuses invalid hashes", () => {
    const hash = "a".repeat(64);
    expect(journalBatchIdempotencyKey(hash, 0)).toBe("manual-csv-batch-" + hash + "-0");
    expect(journalBatchIdempotencyKey(hash, 24)).not.toBe(journalBatchIdempotencyKey(hash, 0));
    expect(() => journalBatchIdempotencyKey("not-a-hash", 0)).toThrow("identity");
    expect(() => journalBatchIdempotencyKey(hash, 25)).toThrow("identity");
  });
});
