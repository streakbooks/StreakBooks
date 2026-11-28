export const SUPPORTED_BANK_IMPORT_FORMATS = ["csv", "ofx", "qif"] as const;
export type SupportedBankImportFormat = (typeof SUPPORTED_BANK_IMPORT_FORMATS)[number];

export function enabledBankImportFormats(document: unknown): SupportedBankImportFormat[] {
  if (document == null) return [...SUPPORTED_BANK_IMPORT_FORMATS];
  if (typeof document !== "object" || Array.isArray(document)) return [];
  if (!("import_formats" in document)) return [...SUPPORTED_BANK_IMPORT_FORMATS];
  const formats = document.import_formats;
  return Array.isArray(formats)
    ? SUPPORTED_BANK_IMPORT_FORMATS.filter((format) => formats.includes(format))
    : [];
}

export function bankImportFormatForFilename(filename: string): SupportedBankImportFormat | null {
  if (/\.(csv|txt)$/i.test(filename)) return "csv";
  if (/\.(ofx|qfx)$/i.test(filename)) return "ofx";
  if (/\.qif$/i.test(filename)) return "qif";
  return null;
}

export function bankImportAcceptAttribute(formats: readonly SupportedBankImportFormat[]): string {
  const extensions: Record<SupportedBankImportFormat, string[]> = {
    csv: [".csv", ".txt"],
    ofx: [".ofx", ".qfx"],
    qif: [".qif"],
  };
  return formats.flatMap((format) => extensions[format]).join(",");
}

export function bankImportFormatLabel(formats: readonly SupportedBankImportFormat[]): string {
  const labels: Record<SupportedBankImportFormat, string> = {
    csv: "CSV/TXT",
    ofx: "OFX/QFX",
    qif: "QIF",
  };
  return formats.map((format) => labels[format]).join(", ");
}
