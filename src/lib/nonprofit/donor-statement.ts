export type StatementPreset = "month" | "quarter" | "year" | "custom";

export type DeliveryDecision = "not_requested" | "not_configured" | "withheld" | "ready";

export type DonorStatementExport = {
  organisationName: string;
  donorName: string;
  periodFrom: string;
  asOf: string;
  wording: string;
  lines: { label: string; currency: string; amountMinor: number }[];
};

function parts(iso: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error("A statement date must be YYYY-MM-DD");
  return { year: Number(match[1]), month: Number(match[2]) };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function statementPeriod(
  preset: StatementPreset,
  anchor: string,
  custom?: { from: string; asOf: string },
): { from: string; asOf: string } {
  if (preset === "custom") {
    if (!custom?.from || !custom.asOf) throw new Error("A custom statement needs both dates");
    return { from: custom.from, asOf: custom.asOf };
  }
  const { year, month } = parts(anchor);
  if (preset === "month")
    return { from: iso(year, month, 1), asOf: iso(year, month, lastDay(year, month)) };
  if (preset === "year") return { from: iso(year, 1, 1), asOf: iso(year, 12, 31) };
  const start = Math.floor((month - 1) / 3) * 3 + 1;
  const end = start + 2;
  return { from: iso(year, start, 1), asOf: iso(year, end, lastDay(year, end)) };
}

export function donorStatementDelivery(input: {
  requested: boolean;
  emailConfigured: boolean;
  consent: string | null;
  email: string | null;
  anonymous: boolean;
}): DeliveryDecision {
  if (!input.requested) return "not_requested";
  if (!input.emailConfigured) return "not_configured";
  if (input.anonymous || input.consent !== "granted" || !input.email?.includes("@"))
    return "withheld";
  return "ready";
}

function csvField(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function donorStatementCsv(statement: DonorStatementExport): string {
  const header = ["Section", "Currency", "Amount minor", "Period from", "As of", "Note"].map(
    csvField,
  );
  const lines = statement.lines.map((line) =>
    [
      line.label,
      line.currency,
      String(line.amountMinor),
      statement.periodFrom,
      statement.asOf,
      statement.wording,
    ]
      .map(csvField)
      .join(","),
  );
  return `\uFEFF${[header.join(","), ...lines].join("\r\n")}`;
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function donorStatementExcel(statement: DonorStatementExport): string {
  const rows = [
    ["Organisation", statement.organisationName],
    ["Donor", statement.donorName],
    ["From", statement.periodFrom],
    ["As of", statement.asOf],
    ["Note", statement.wording],
    ["Section", "Currency", "Amount minor"],
    ...statement.lines.map((line) => [line.label, line.currency, String(line.amountMinor)]),
  ];
  const body = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => `<Cell><Data ss:Type="String">${xml(cell)}</Data></Cell>`)
          .join("")}</Row>`,
    )
    .join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Donor statement"><Table>${body}</Table></Worksheet>
</Workbook>`;
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function donorStatementPdf(statement: DonorStatementExport): string {
  const lines = [
    statement.organisationName,
    `Donor statement: ${statement.donorName}`,
    `${statement.periodFrom} to ${statement.asOf}`,
    statement.wording,
    ...statement.lines.map((line) => `${line.label} ${line.currency} ${line.amountMinor}`),
  ].slice(0, 40);
  const commands = ["BT", "/F1 10 Tf", "48 780 Td", "14 TL"];
  for (const line of lines) commands.push(`(${pdfEscape(line.slice(0, 200))}) '`);
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export function donorStatementText(statement: DonorStatementExport): string {
  const amounts = statement.lines
    .map((line) => `${line.label}: ${line.currency} ${line.amountMinor}`)
    .join("\n");
  return `${statement.organisationName}\n${statement.donorName}\n${statement.periodFrom} to ${statement.asOf}\n${amounts}\n${statement.wording}`;
}
