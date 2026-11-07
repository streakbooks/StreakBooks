import type { ExpenseApprovalStatus, ExpensePaymentSource } from "./types";

export type ExpenseClaimLineInput = {
  expenseDate: string;
  merchantName?: string;
  receiptNumber?: string;
  description: string;
  categoryId?: string | null;
  accountId: string;
  quantity?: number;
  unitPriceMinor?: number;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  currencyCode?: string;
  exchangeRate?: number;
  reimbursableMinor?: number;
  nonReimbursableMinor?: number;
  isBillable?: boolean;
  notes?: string;
  isMileage?: boolean;
  distanceValue?: number;
  distanceUnit?: "km" | "mi";
  mileageRateId?: string | null;
  tripOrigin?: string;
  tripDestination?: string;
  isPerDiem?: boolean;
  travelDayCount?: number;
  perDiemRateId?: string | null;
  travelStartDate?: string;
  travelEndDate?: string;
};

export type ExpenseClaimDraftInput = {
  id?: string;
  version?: number;
  title: string;
  description?: string | undefined;
  claimDate: string;
  claimCurrency: string;
  reimbursementCurrency?: string | undefined;
  paymentSource?: ExpensePaymentSource | undefined;
  lines: ExpenseClaimLineInput[];
};

export type ExpenseClaimSummary = {
  id: string;
  claimNumber: string;
  title: string;
  claimDate: string;
  claimCurrency: string;
  approvalStatus: ExpenseApprovalStatus;
  postingStatus: string;
  reimbursementStatus: string;
  paymentSource: ExpensePaymentSource;
  totalMinor: number;
  reimbursableMinor: number;
  postedJournalId: string | null;
  version: number;
  updatedAt: string;
};

export type ExpenseRebillingStatus =
  | "not_applicable"
  | "ready"
  | "invoiced"
  | "partially_invoiced"
  | "cancelled";

export type ExpenseClaimDetail = ExpenseClaimSummary & {
  description: string | null;
  paymentSource: ExpensePaymentSource;
  reimbursementCurrency: string;
  subtotalMinor: number;
  taxMinor: number;
  postedJournalId: string | null;
  reimbursementJournalId: string | null;
  customerContactId: string | null;
  rebillingStatus: ExpenseRebillingStatus;
  rebillingInvoiceId: string | null;
  lines: Array<{
    id: string;
    lineNo: number;
    expenseDate: string;
    merchantName: string | null;
    description: string;
    accountId: string;
    netMinor: number;
    taxMinor: number;
    grossMinor: number;
    currencyCode: string;
    isBillable?: boolean;
    rebillingMethod?: "actual" | "markup" | "agreed_rate" | null;
    isMileage?: boolean;
    distanceValue?: number | null;
    distanceUnit?: "km" | "mi" | null;
    tripOrigin?: string | null;
    tripDestination?: string | null;
    isPerDiem?: boolean;
    travelDayCount?: number | null;
    travelStartDate?: string | null;
    travelEndDate?: string | null;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function mapExpenseClaimSummary(row: unknown): ExpenseClaimSummary {
  const r = asRecord(row);
  return {
    id: str(r["id"]),
    claimNumber: str(r["claim_number"] ?? r["claimNumber"]),
    title: str(r["title"]),
    claimDate: str(r["claim_date"] ?? r["claimDate"]),
    claimCurrency: str(r["claim_currency"] ?? r["claimCurrency"]),
    approvalStatus: str(r["approval_status"] ?? r["approvalStatus"]) as ExpenseApprovalStatus,
    postingStatus: str(r["posting_status"] ?? r["postingStatus"]),
    reimbursementStatus: str(r["reimbursement_status"] ?? r["reimbursementStatus"]),
    paymentSource: str(
      r["payment_source"] ?? r["paymentSource"],
      "employee_paid",
    ) as ExpensePaymentSource,
    totalMinor: num(r["total_minor"] ?? r["totalMinor"]),
    reimbursableMinor: num(r["reimbursable_minor"] ?? r["reimbursableMinor"]),
    postedJournalId: (r["posted_journal_id"] ?? r["postedJournalId"] ?? null) as string | null,
    version: num(r["version"]),
    updatedAt: str(r["updated_at"] ?? r["updatedAt"]),
  };
}

function asRebillingStatus(value: unknown): ExpenseRebillingStatus {
  const raw = str(value, "not_applicable");
  if (
    raw === "ready" ||
    raw === "invoiced" ||
    raw === "partially_invoiced" ||
    raw === "cancelled"
  ) {
    return raw;
  }
  return "not_applicable";
}

export function mapExpenseClaimDetail(row: unknown): ExpenseClaimDetail {
  const r = asRecord(row);
  const summary = mapExpenseClaimSummary(r);
  const linesRaw = Array.isArray(r["lines"]) ? r["lines"] : [];
  return {
    ...summary,
    description: (r["description"] as string | null | undefined) ?? null,
    paymentSource: str(r["payment_source"] ?? r["paymentSource"], "employee_paid") as ExpensePaymentSource,
    reimbursementCurrency: str(
      r["reimbursement_currency"] ?? r["reimbursementCurrency"],
      summary.claimCurrency,
    ),
    subtotalMinor: num(r["subtotal_minor"] ?? r["subtotalMinor"]),
    taxMinor: num(r["tax_minor"] ?? r["taxMinor"]),
    postedJournalId: (r["posted_journal_id"] ?? r["postedJournalId"] ?? null) as string | null,
    reimbursementJournalId: (r["reimbursement_journal_id"] ??
      r["reimbursementJournalId"] ??
      null) as string | null,
    customerContactId: (r["customer_contact_id"] ?? r["customerContactId"] ?? null) as
      | string
      | null,
    rebillingStatus: asRebillingStatus(r["rebilling_status"] ?? r["rebillingStatus"]),
    rebillingInvoiceId: (r["rebilling_invoice_id"] ?? r["rebillingInvoiceId"] ?? null) as
      | string
      | null,
    lines: linesRaw.map((line) => {
      const l = asRecord(line);
      const unitRaw = str(l["distance_unit"] ?? l["distanceUnit"]);
      const methodRaw = str(l["rebilling_method"] ?? l["rebillingMethod"]);
      return {
        id: str(l["id"]),
        lineNo: num(l["line_no"] ?? l["lineNo"]),
        expenseDate: str(l["expense_date"] ?? l["expenseDate"]),
        merchantName: (l["merchant_name"] ?? l["merchantName"] ?? null) as string | null,
        description: str(l["description"]),
        accountId: str(l["account_id"] ?? l["accountId"]),
        netMinor: num(l["net_minor"] ?? l["netMinor"]),
        taxMinor: num(l["tax_minor"] ?? l["taxMinor"]),
        grossMinor: num(l["gross_minor"] ?? l["grossMinor"]),
        currencyCode: str(l["currency_code"] ?? l["currencyCode"], summary.claimCurrency),
        isBillable: Boolean(l["is_billable"] ?? l["isBillable"] ?? false),
        rebillingMethod:
          methodRaw === "actual" || methodRaw === "markup" || methodRaw === "agreed_rate"
            ? methodRaw
            : null,
        isMileage: Boolean(l["is_mileage"] ?? l["isMileage"] ?? false),
        distanceValue:
          l["distance_value"] == null && l["distanceValue"] == null
            ? null
            : num(l["distance_value"] ?? l["distanceValue"]),
        distanceUnit: unitRaw === "mi" || unitRaw === "km" ? unitRaw : null,
        tripOrigin: (l["trip_origin"] ?? l["tripOrigin"] ?? null) as string | null,
        tripDestination: (l["trip_destination"] ?? l["tripDestination"] ?? null) as
          | string
          | null,
        isPerDiem: Boolean(l["is_per_diem"] ?? l["isPerDiem"] ?? false),
        travelDayCount:
          l["travel_day_count"] == null && l["travelDayCount"] == null
            ? null
            : num(l["travel_day_count"] ?? l["travelDayCount"]),
        travelStartDate: (l["travel_start_date"] ?? l["travelStartDate"] ?? null) as
          | string
          | null,
        travelEndDate: (l["travel_end_date"] ?? l["travelEndDate"] ?? null) as string | null,
      };
    }),
  };
}

export function toExpenseClaimPayload(draft: ExpenseClaimDraftInput): Record<string, unknown> {
  return {
    id: draft.id ?? null,
    version: draft.version ?? 0,
    title: draft.title,
    description: draft.description ?? null,
    claim_date: draft.claimDate,
    claim_currency: draft.claimCurrency,
    reimbursement_currency: draft.reimbursementCurrency ?? draft.claimCurrency,
    payment_source: draft.paymentSource ?? "employee_paid",
    lines: draft.lines.map((line) => ({
      expense_date: line.expenseDate,
      merchant_name: line.merchantName ?? null,
      receipt_number: line.receiptNumber ?? null,
      description: line.description,
      category_id: line.categoryId ?? null,
      account_id: line.accountId,
      quantity: line.quantity ?? 1,
      unit_price_minor: line.unitPriceMinor ?? line.netMinor,
      net_minor: line.netMinor,
      tax_minor: line.taxMinor,
      gross_minor: line.grossMinor,
      currency_code: line.currencyCode ?? draft.claimCurrency,
      exchange_rate: line.exchangeRate ?? 1,
      reimbursable_minor: line.reimbursableMinor ?? line.grossMinor,
      non_reimbursable_minor: line.nonReimbursableMinor ?? 0,
      is_billable: line.isBillable ?? false,
      notes: line.notes ?? null,
      is_mileage: line.isMileage ?? false,
      distance_value: line.distanceValue ?? null,
      distance_unit: line.distanceUnit ?? null,
      mileage_rate_id: line.mileageRateId ?? null,
      trip_origin: line.tripOrigin ?? null,
      trip_destination: line.tripDestination ?? null,
      is_per_diem: line.isPerDiem ?? false,
      travel_day_count: line.travelDayCount ?? null,
      per_diem_rate_id: line.perDiemRateId ?? null,
      travel_start_date: line.travelStartDate ?? null,
      travel_end_date: line.travelEndDate ?? null,
    })),
  };
}
