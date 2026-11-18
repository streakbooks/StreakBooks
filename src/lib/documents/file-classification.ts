/** Deterministic filename/linked-record hints. Suggestions are NOT AI/OCR or accounting decisions. */
export const FILE_CATEGORIES = [
  "unclassified", "bill", "invoice", "receipt", "statement",
  "contract", "tax", "payroll", "bank", "other",
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  unclassified: "Unclassified",
  bill: "Supplier bill",
  invoice: "Sales invoice",
  receipt: "Receipt",
  statement: "Statement",
  contract: "Contract",
  tax: "Tax document",
  payroll: "Payroll",
  bank: "Banking",
  other: "Other",
};

export function parseFileCategory(value: unknown): FileCategory {
  return FILE_CATEGORIES.find((category) => category === value) ?? "unclassified";
}

export function validateDocumentTagName(input: unknown): string {
  if (typeof input !== "string") throw new Error("Tag name must be text.");
  const name = input.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    name.length < 1 || name.length > 50 ||
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/u.test(name)
  ) throw new Error("Tag name must be 1–50 safe characters.");
  return name;
}

export type FileClassificationHint = {
  category: FileCategory;
  source: "linked_record" | "filename";
  reason: string;
};

const LINKED_RECORD_CATEGORY: Record<string, FileCategory> = {
  purchase_bill: "bill",
  sales_invoice: "invoice",
  sales_receipt: "receipt",
  purchase_expense: "receipt",
  purchase_order: "other",
  sales_quote: "other",
  money_sales_receipt: "receipt",
};

/**
 * A deliberate rule sequence avoids guessing for arbitrary filenames.
 * An authoritative linked-record hint wins over a filename keyword.
 * No user content is sent to an external provider.
 */
export function suggestFileCategory(
  fileName: string,
  entityType: string,
): FileClassificationHint | null {
  const linked = LINKED_RECORD_CATEGORY[entityType];
  if (linked) {
    return {
      category: linked,
      source: "linked_record",
      reason: "Suggested from the linked LinkBooks record type.",
    };
  }
  const base = fileName.replace(/\.[^.]+$/u, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const match = (pattern: RegExp) => pattern.test(base);
  let category: FileCategory | null = null;
  if (match(/\b(payslip|payroll|wage|salary)\b/u)) category = "payroll";
  else if (match(/\b(gst|vat|tax return|tax invoice|tds|1099|w 2)\b/u)) category = "tax";
  else if (match(/\b(bank|checking|savings|credit card)\b/u)) category = "bank";
  else if (match(/\b(statement|account statement)\b/u)) category = "statement";
  else if (match(/\b(contract|agreement|lease)\b/u)) category = "contract";
  else if (match(/\b(receipt|paid receipt|cash memo)\b/u)) category = "receipt";
  else if (match(/\b(bill|supplier invoice|vendor invoice)\b/u)) category = "bill";
  else if (match(/\b(invoice|sales invoice)\b/u)) category = "invoice";
  if (!category) return null;
  return { category, source: "filename", reason: "Suggested from keywords in the filename; confirm before saving." };
}

/** Suggest reusable existing company tags by exact normalised token/phrase matches. */
export function suggestExistingTags(
  fileName: string,
  tags: readonly { id: string; name: string }[],
): string[] {
  const tokens = ` ${fileName.normalize("NFKC").toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  return tags
    .filter((tag) => {
      const phrase = tag.name.normalize("NFKC").toLocaleLowerCase("en-US")
        .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      return phrase.length >= 3 && tokens.includes(` ${phrase} `);
    })
    .slice(0, 10)
    .map((tag) => tag.id);
}
