/** RFC 4180 style CSV records with physical line numbers for safe payroll import feedback.
 * This is a parser, not an import writer. No partial database changes occur here.
 */
export type PayrollCsvRecord = { line: number; cells: string[] };
export type PayrollCsvRecordsResult =
  { ok: true; records: PayrollCsvRecord[] } | { ok: false; error: string };

export function readPayrollCsvRecords(input: string): PayrollCsvRecordsResult {
  if (input.length > 1_000_000) {
    return { ok: false, error: "Employee CSV exceeds the 1 MB safety limit." };
  }
  const records: PayrollCsvRecord[] = [];
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;

  const finishCell = () => {
    cells.push(value.trim().replace(/^\uFEFF/, ""));
    value = "";
    afterQuote = false;
  };
  const finishRecord = (): PayrollCsvRecordsResult | null => {
    finishCell();
    if (cells.some((cell) => cell !== "")) {
      records.push({ line: recordLine, cells: [...cells] });
      if (records.length > 501) {
        return { ok: false, error: "Employee CSV is limited to 500 data rows." };
      }
    }
    cells.length = 0;
    recordLine = line + 1;
    return null;
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (ch === '"') {
      if (quoted) {
        if (input[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else if (!afterQuote && value.trim() === "") {
        quoted = true;
        value = "";
      } else {
        return { ok: false, error: `Unexpected quote in CSV at line ${line}.` };
      }
      continue;
    }
    if (ch === "," && !quoted) {
      finishCell();
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      if (quoted) {
        value += "\n";
        line += 1;
      } else {
        const failed = finishRecord();
        if (failed) return failed;
        line += 1;
        recordLine = line;
      }
      continue;
    }
    if (afterQuote) {
      if (ch === " " || ch === "\t") continue;
      return { ok: false, error: `Unexpected text after closing quote at line ${line}.` };
    }
    value += ch;
  }
  if (quoted) return { ok: false, error: `Unclosed CSV quote beginning at line ${recordLine}.` };
  if (value !== "" || cells.length > 0 || afterQuote) {
    const failed = finishRecord();
    if (failed) return failed;
  }
  return { ok: true, records };
}
