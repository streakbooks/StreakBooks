/**
 * RFC 4180-style CSV record parser used by Budgets.
 *
 * Handles quoted commas, doubled quotation marks, and embedded CR/LF
 * within quoted fields while retaining original physical line numbers.
 * Malformed quotation marks fail closed before any budget draft is changed.
 */
export type BudgetCsvRecord = {
  cells: string[];
  row: number;
};

export function parseBudgetCsvRecords(input: string): BudgetCsvRecord[] {
  const text = input.replace(/^\uFEFF/, "");
  const records: BudgetCsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  let hadQuotedField = false;
  let row = 1;
  let recordStart = 1;

  const pushField = () => {
    cells.push(field);
    field = "";
    closedQuote = false;
  };
  const pushRecord = () => {
    pushField();
    if (hadQuotedField || cells.some((cell) => cell.trim().length > 0)) {
      records.push({ cells, row: recordStart });
    }
    cells = [];
    hadQuotedField = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') {
      if (quoted) {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else if (field === "" && !closedQuote) {
        quoted = true;
        hadQuotedField = true;
      } else {
        throw new Error("Malformed CSV quotation mark on line " + row + ".");
      }
      continue;
    }

    if (quoted) {
      if (char === "\r") {
        if (text[i + 1] === "\n") i++;
        field += "\n";
        row++;
      } else if (char === "\n") {
        field += "\n";
        row++;
      } else {
        field += char;
      }
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      pushRecord();
      row++;
      recordStart = row;
      continue;
    }
    if (closedQuote) {
      // Excel sometimes leaves ASCII spaces after a closing quote.
      if (char === " " || char === "\t") continue;
      throw new Error("Unexpected text after closing CSV quote on line " + row + ".");
    }
    field += char;
  }
  if (quoted) {
    throw new Error("Unterminated quoted CSV field beginning on line " + recordStart + ".");
  }
  if (cells.length > 0 || field.length > 0 || closedQuote) pushRecord();
  return records;
}