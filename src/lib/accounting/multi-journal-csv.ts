import { parseCsvCells, importJournalLinesCsv, type JournalImportAccount } from "@/lib/accounting/journal-csv-import";
import { toMinorUnits, fromMinorUnits } from "@/lib/accounting/money";

export const MULTI_JOURNAL_CSV_HEADERS = [
  "journal_key",
  "journal_date",
  "memo",
  "account_code",
  "description",
  "debit",
  "credit",
] as const;

export type PreviewedManualJournal = {
  key: string;
  date: string;
  memo: string;
  lines: ReturnType<typeof importJournalLinesCsv>;
  totalMinor: string;
  totalDisplay: string;
};

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Parse multiple **unposted** manual journals. Reuses the existing single-journal
 * validator and its account/control/precision protections for each group.
 */
export function previewMultiJournalCsv(
  text: string,
  accounts: JournalImportAccount[],
  currency: string,
): PreviewedManualJournal[] {
  const rows = parseCsvCells(text);
  if (!rows.length) throw new Error("The import file is empty.");
  const headers = rows[0]!.map((value) => value.trim().toLowerCase().replace(/\s+/g, "_"));
  if (
    headers.length !== MULTI_JOURNAL_CSV_HEADERS.length ||
    !MULTI_JOURNAL_CSV_HEADERS.every((expected, index) => headers[index] === expected)
  ) {
    throw new Error("Required columns: " + MULTI_JOURNAL_CSV_HEADERS.join(", "));
  }
  const dataRows = rows.slice(1);
  if (dataRows.length < 2 || dataRows.length > 200) {
    throw new Error("Import between 2 and 200 journal lines.");
  }
  const groups = new Map<string, { date: string; memo: string; lines: string[][] }>();
  for (const [index, row] of dataRows.entries()) {
    if (row.length !== 7) throw new Error("Row " + (index + 2) + " must contain 7 columns.");
    const [rawKey = "", rawDate = "", rawMemo = "", account = "", description = "", debit = "", credit = ""] = row;
    const key = rawKey.trim();
    const date = rawDate.trim();
    const memo = rawMemo.trim();
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(key)) {
      throw new Error("Row " + (index + 2) + ": journal_key must have 1–60 letters, numbers, underscores or hyphens.");
    }
    if (!validDay(date)) throw new Error("Row " + (index + 2) + ": journal_date must be a real YYYY-MM-DD date.");
    if (memo.length < 3 || memo.length > 500) {
      throw new Error("Row " + (index + 2) + ": memo must have 3–500 characters.");
    }
    const group = groups.get(key);
    if (group && (group.date !== date || group.memo !== memo)) {
      throw new Error("Row " + (index + 2) + ": journal_key " + key + " has inconsistent date or memo.");
    }
    if (!group) {
      if (groups.size >= 25) throw new Error("Import at most 25 journals in one file.");
      groups.set(key, { date, memo, lines: [] });
    }
    groups.get(key)!.lines.push([account, description, debit, credit]);
  }

  const quote = (value: string): string => '"' + value.replace(/"/g, '""') + '"';
  const seen = new Set<string>();
  return Array.from(groups, ([key, group]) => {
    const singleCsv = [
      "account_code,description,debit,credit",
      ...group.lines.map((line) => line.map(quote).join(",")),
    ].join("\r\n");
    const lines = importJournalLinesCsv(singleCsv, accounts, currency);
    const totalMinor = lines.reduce((total, line) => total + toMinorUnits(line.debit, currency), 0n);
    const fingerprint = JSON.stringify([
      group.date,
      group.memo,
      [...lines]
        .map((line) => [line.accountId, toMinorUnits(line.debit, currency).toString(), toMinorUnits(line.credit, currency).toString()])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]);
    if (seen.has(fingerprint)) {
      throw new Error("Two journal groups contain identical date, narration and accounting lines. Remove the duplicate or change the import file after review.");
    }
    seen.add(fingerprint);
    return {
      key,
      date: group.date,
      memo: group.memo,
      lines,
      totalMinor: totalMinor.toString(),
      totalDisplay: fromMinorUnits(totalMinor, currency),
    };
  });
}

/** Stable idempotency across retries and reuploads of the same company + file. */
export async function journalBatchFingerprint(companyId: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(companyId + "\n" + text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function journalBatchIdempotencyKey(fingerprint: string, index: number): string {
  if (!/^[0-9a-f]{64}$/.test(fingerprint) || !Number.isInteger(index) || index < 0 || index >= 25) {
    throw new Error("Invalid journal import identity.");
  }
  return "manual-csv-batch-" + fingerprint + "-" + index;
}
