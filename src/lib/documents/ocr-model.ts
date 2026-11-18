/** Pure extraction mapping: untrusted provider values are suggestions, never postings. */
import type { ReviewFields } from "@/lib/documents/review-model";

export type OcrSuggestions = Partial<
  Pick<
    ReviewFields,
    "documentType" | "reference" | "supplierName" | "documentDate" | "currencyCode" | "totalMinor"
  >
>;

type AzureField = {
  type?: string;
  valueString?: unknown;
  valueDate?: unknown;
  valueCurrency?: { amount?: unknown; currencyCode?: unknown };
  content?: unknown;
  confidence?: unknown;
};
type AzureAnalyzeResult = {
  status?: string;
  analyzeResult?: {
    documents?: Array<{
      docType?: string;
      confidence?: number;
      fields?: Record<string, AzureField>;
    }>;
  };
};

export const OCR_MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Only supported mime+extension pairs can leave our server for this provider. */
export function isOcrDocument(contentType: string | null, name: string): boolean {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  const ext = name.toLowerCase().split(".").pop();
  return (
    (mime === "application/pdf" && ext === "pdf") ||
    (mime === "image/jpeg" && (ext === "jpg" || ext === "jpeg")) ||
    (mime === "image/png" && ext === "png")
  );
}

function safeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ").trim();
  return text ? text.slice(0, max) : null;
}
function pick(field: AzureField | undefined, max: number): string | null {
  return safeText(field?.valueString ?? field?.content, max);
}
function isoDate(value: unknown): string | null {
  const str = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const parsed = new Date(`${str}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === str
    ? str
    : null;
}
const ZERO_DECIMAL = new Set([
  "JPY",
  "KRW",
  "CLP",
  "VND",
  "ISK",
  "PYG",
  "RWF",
  "UGX",
  "XOF",
  "XAF",
  "XPF",
]);
const THREE_DECIMAL = new Set(["BHD", "KWD", "OMR", "JOD", "TND", "IQD", "LYD"]);
const TWO_DECIMAL = new Set([
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "NZD",
  "INR",
  "SGD",
  "AED",
  "SAR",
  "CHF",
  "ZAR",
  "HKD",
  "CNY",
  "MYR",
  "PHP",
  "THB",
  "PKR",
  "BDT",
  "NPR",
  "LKR",
  "BRL",
  "MXN",
  "TRY",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "IDR",
  "NGN",
  "KES",
]);
/** Unknown currency exponents are never guessed: leave the amount for manual review. */
export function minorUnits(amount: unknown, currency: unknown): number | null {
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  const power = ZERO_DECIMAL.has(currency)
    ? 0
    : THREE_DECIMAL.has(currency)
      ? 3
      : TWO_DECIMAL.has(currency)
        ? 2
        : null;
  if (power === null) return null;
  const scaled = amount * 10 ** power;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 0.00001) return null;
  return rounded;
}

export function parseAzureInvoiceSuggestions(input: unknown): {
  suggestions: OcrSuggestions;
  confidence: Record<string, number>;
  warnings: string[];
} {
  const payload: AzureAnalyzeResult =
    input && typeof input === "object" ? (input as AzureAnalyzeResult) : {};
  const document = payload.analyzeResult?.documents?.[0];
  if (payload.status !== "succeeded" || !document?.fields)
    throw new Error("No structured invoice information was available from OCR.");

  const fields = document.fields;
  const suggestions: OcrSuggestions = { documentType: "bill" };
  const confidence: Record<string, number> = {};
  const warnings: string[] = [];

  function add<K extends keyof OcrSuggestions>(
    field: K,
    source: AzureField | undefined,
    value: OcrSuggestions[K],
  ) {
    if (value == null) return;
    suggestions[field] = value;
    if (typeof source?.confidence === "number" && Number.isFinite(source.confidence))
      confidence[field] = Math.max(0, Math.min(1, source.confidence));
  }

  add("reference", fields["InvoiceId"], pick(fields["InvoiceId"], 120));
  add("supplierName", fields["VendorName"], pick(fields["VendorName"], 160));
  add("documentDate", fields["InvoiceDate"], isoDate(fields["InvoiceDate"]?.valueDate));

  const total = fields["InvoiceTotal"] ?? fields["AmountDue"];
  const currency =
    typeof total?.valueCurrency?.currencyCode === "string"
      ? total.valueCurrency.currencyCode.trim().toUpperCase()
      : null;
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    add("currencyCode", total, currency);
    add("totalMinor", total, minorUnits(total?.valueCurrency?.amount, currency));
    if (suggestions.totalMinor == null)
      warnings.push("Check amount and currency minor units manually.");
  } else {
    warnings.push("Currency or invoice total could not be verified; enter the amount manually.");
  }
  if (!suggestions.reference) warnings.push("Document reference was not found.");
  if (!suggestions.documentDate) warnings.push("Document date was not found or was invalid.");
  if (!suggestions.supplierName) warnings.push("Supplier name was not found.");
  return { suggestions, confidence, warnings };
}

/**
 * OCR suggestions never replace manually entered details or change lifecycle status.
 * Save review remains an explicit, version-checked human action.
 */
export function fillBlankReviewFields(
  previous: ReviewFields,
  suggestions: OcrSuggestions,
): ReviewFields {
  return {
    ...previous,
    documentType:
      previous.documentType === "unclassified"
        ? (suggestions.documentType ?? previous.documentType)
        : previous.documentType,
    supplierName: previous.supplierName || suggestions.supplierName || null,
    reference: previous.reference || suggestions.reference || null,
    documentDate: previous.documentDate || suggestions.documentDate || null,
    currencyCode: previous.currencyCode || suggestions.currencyCode || null,
    totalMinor: previous.totalMinor ?? suggestions.totalMinor ?? null,
  };
}
