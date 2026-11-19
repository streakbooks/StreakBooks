/**
 * Parse spreadsheet-style clipboard text into rectangular string rows.
 * Supports tab-separated and CSV-like comma values. Does not mutate accounting state.
 */

export function parseLineGridClipboard(text: string): string[][] {
  const raw = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (!raw.trim()) return [];
  const lines = raw.split("\n");
  // Drop a trailing empty line commonly added by spreadsheet apps.
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => {
    if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
    // Lightweight CSV: split on commas not inside double quotes.
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  });
}
