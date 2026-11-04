/** Manual document intake; review does not post or authorise accounting transactions. */
export const REVIEW_STATUSES = [
  "needs_review",
  "ready",
  "approved",
  "rejected",
  "archived",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_TYPES = [
  "unclassified",
  "receipt",
  "bill",
  "invoice",
  "statement",
  "contract",
  "other",
] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  needs_review: "Needs review",
  ready: "Ready for approval",
  approved: "Reviewed and approved",
  rejected: "Rejected",
  archived: "Archived",
};
export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  unclassified: "Unclassified",
  receipt: "Receipt",
  bill: "Supplier bill",
  invoice: "Sales invoice",
  statement: "Statement",
  contract: "Contract",
  other: "Other",
};

export type ReviewFields = {
  status: ReviewStatus;
  documentType: ReviewType;
  reference: string | null;
  supplierName: string | null;
  documentDate: string | null;
  currencyCode: string | null;
  totalMinor: number | null;
  note: string | null;
};

function textField(value: unknown, limit: number, label: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${label} must be text`);
  const text = value.trim();
  if (text.length > limit) throw new Error(`${label} must be at most ${limit} characters`);
  return text || null;
}

export function validateReviewFields(input: {
  status: unknown;
  documentType: unknown;
  reference?: unknown;
  supplierName?: unknown;
  documentDate?: unknown;
  currencyCode?: unknown;
  totalMinor?: unknown;
  note?: unknown;
}): ReviewFields {
  if (!REVIEW_STATUSES.includes(input.status as ReviewStatus))
    throw new Error("Invalid review status");
  if (!REVIEW_TYPES.includes(input.documentType as ReviewType))
    throw new Error("Invalid document type");
  const documentDate = textField(input.documentDate, 10, "Document date");
  if (documentDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate))
      throw new Error("Document date must use YYYY-MM-DD");
    const parsed = new Date(`${documentDate}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== documentDate)
      throw new Error("Invalid document date");
  }
  const currencyCode = textField(input.currencyCode, 3, "Currency")?.toUpperCase() ?? null;
  if (currencyCode && !/^[A-Z]{3}$/.test(currencyCode))
    throw new Error("Currency must contain 3 letters");
  const totalMinor = input.totalMinor === "" || input.totalMinor == null ? null : input.totalMinor;
  if (
    totalMinor !== null &&
    (typeof totalMinor !== "number" || !Number.isSafeInteger(totalMinor) || totalMinor < 0)
  )
    throw new Error("Amount must be a non-negative whole number of currency minor units");
  return {
    status: input.status as ReviewStatus,
    documentType: input.documentType as ReviewType,
    reference: textField(input.reference, 120, "Reference"),
    supplierName: textField(input.supplierName, 160, "Supplier"),
    documentDate,
    currencyCode,
    totalMinor,
    note: textField(input.note, 3000, "Review note"),
  };
}

/** Approval is a document-only control. The real accounting approval stays authoritative. */
export function canApproveDocument(
  can: (permission: "purchases.authorise" | "sales.authorise") => boolean,
): boolean {
  return can("purchases.authorise") || can("sales.authorise");
}
