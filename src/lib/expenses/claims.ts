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
};

export type ExpenseClaimDraftInput = {
  id?: string;
  version?: number;
  title: string;
  description?: string;
  claimDate: string;
  claimCurrency: string;
  reimbursementCurrency?: string;
  paymentSource?: ExpensePaymentSource;
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
  totalMinor: number;
  reimbursableMinor: number;
  version: number;
  updatedAt: string;
};

export type ExpenseClaimDetail = ExpenseClaimSummary & {
  description: string | null;
  paymentSource: ExpensePaymentSource;
  reimbursementCurrency: string;
  subtotalMinor: number;
  taxMinor: number;
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
    id: str(r.id),
    claimNumber: str(r.claim_number ?? r.claimNumber),
    title: str(r.title),
    claimDate: str(r.claim_date ?? r.claimDate),
    claimCurrency: str(r.claim_currency ?? r.claimCurrency),
    approvalStatus: str(r.approval_status ?? r.approvalStatus) as ExpenseApprovalStatus,
    postingStatus: str(r.posting_status ?? r.postingStatus),
    reimbursementStatus: str(r.reimbursement_status ?? r.reimbursementStatus),
    totalMinor: num(r.total_minor ?? r.totalMinor),
    reimbursableMinor: num(r.reimbursable_minor ?? r.reimbursableMinor),
    version: num(r.version),
    updatedAt: str(r.updated_at ?? r.updatedAt),
  };
}

export function mapExpenseClaimDetail(row: unknown): ExpenseClaimDetail {
  const r = asRecord(row);
  const summary = mapExpenseClaimSummary(r);
  const linesRaw = Array.isArray(r.lines) ? r.lines : [];
  return {
    ...summary,
    description: (r.description as string | null | undefined) ?? null,
    paymentSource: str(r.payment_source ?? r.paymentSource, "employee_paid") as ExpensePaymentSource,
    reimbursementCurrency: str(r.reimbursement_currency ?? r.reimbursementCurrency, summary.claimCurrency),
    subtotalMinor: num(r.subtotal_minor ?? r.subtotalMinor),
    taxMinor: num(r.tax_minor ?? r.taxMinor),
    lines: linesRaw.map((line) => {
      const l = asRecord(line);
      return {
        id: str(l.id),
        lineNo: num(l.line_no ?? l.lineNo),
        expenseDate: str(l.expense_date ?? l.expenseDate),
        merchantName: (l.merchant_name ?? l.merchantName ?? null) as string | null,
        description: str(l.description),
        accountId: str(l.account_id ?? l.accountId),
        netMinor: num(l.net_minor ?? l.netMinor),
        taxMinor: num(l.tax_minor ?? l.taxMinor),
        grossMinor: num(l.gross_minor ?? l.grossMinor),
        currencyCode: str(l.currency_code ?? l.currencyCode, summary.claimCurrency),
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
    })),
  };
}
