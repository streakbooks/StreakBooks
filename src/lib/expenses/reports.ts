import { minorToDecimalString, toCsv } from "@/lib/sales/csv";

export type ExpenseStatusBucket = {
  status: string;
  claimCount: number;
  totalMinor: number;
};

export type ExpenseOpenAging = {
  days0to7: number;
  days8to30: number;
  days31to90: number;
  days90Plus: number;
};

export type ExpenseManagementReport = {
  companyId: string;
  fromDate: string;
  toDate: string;
  totals: {
    claimCount: number;
    totalMinor: number;
    reimbursableMinor: number;
  };
  byApprovalStatus: ExpenseStatusBucket[];
  byPostingStatus: ExpenseStatusBucket[];
  byReimbursementStatus: ExpenseStatusBucket[];
  openAging: ExpenseOpenAging;
};

export type ExpenseClaimExportRow = {
  id: string;
  claimNumber: string;
  title: string;
  claimDate: string;
  claimCurrency: string;
  approvalStatus: string;
  postingStatus: string;
  reimbursementStatus: string;
  paymentSource: string;
  totalMinor: number;
  reimbursableMinor: number;
};

export type ExpenseClaimAuditEvent = {
  id: string;
  claimId: string;
  eventType: string;
  note: string | null;
  actedAt: string;
  approvalStatusAfter: string | null;
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

function mapBucket(row: unknown): ExpenseStatusBucket {
  const r = asRecord(row);
  return {
    status: str(r["status"]),
    claimCount: num(r["claim_count"] ?? r["claimCount"]),
    totalMinor: num(r["total_minor"] ?? r["totalMinor"]),
  };
}

export function mapExpenseManagementReport(row: unknown): ExpenseManagementReport {
  const r = asRecord(row);
  const totals = asRecord(r["totals"]);
  const aging = asRecord(r["open_aging"] ?? r["openAging"]);
  return {
    companyId: str(r["company_id"] ?? r["companyId"]),
    fromDate: str(r["from_date"] ?? r["fromDate"]),
    toDate: str(r["to_date"] ?? r["toDate"]),
    totals: {
      claimCount: num(totals["claim_count"] ?? totals["claimCount"]),
      totalMinor: num(totals["total_minor"] ?? totals["totalMinor"]),
      reimbursableMinor: num(totals["reimbursable_minor"] ?? totals["reimbursableMinor"]),
    },
    byApprovalStatus: (Array.isArray(r["by_approval_status"]) ? r["by_approval_status"] : []).map(
      mapBucket,
    ),
    byPostingStatus: (Array.isArray(r["by_posting_status"]) ? r["by_posting_status"] : []).map(
      mapBucket,
    ),
    byReimbursementStatus: (Array.isArray(r["by_reimbursement_status"])
      ? r["by_reimbursement_status"]
      : []
    ).map(mapBucket),
    openAging: {
      days0to7: num(aging["0_7"] ?? aging["days0to7"]),
      days8to30: num(aging["8_30"] ?? aging["days8to30"]),
      days31to90: num(aging["31_90"] ?? aging["days31to90"]),
      days90Plus: num(aging["90_plus"] ?? aging["days90Plus"]),
    },
  };
}

export function mapExpenseClaimExportRows(row: unknown): ExpenseClaimExportRow[] {
  const r = asRecord(row);
  const claims = Array.isArray(r["claims"]) ? r["claims"] : [];
  return claims.map((item) => {
    const c = asRecord(item);
    return {
      id: str(c["id"]),
      claimNumber: str(c["claim_number"] ?? c["claimNumber"]),
      title: str(c["title"]),
      claimDate: str(c["claim_date"] ?? c["claimDate"]),
      claimCurrency: str(c["claim_currency"] ?? c["claimCurrency"]).toUpperCase(),
      approvalStatus: str(c["approval_status"] ?? c["approvalStatus"]),
      postingStatus: str(c["posting_status"] ?? c["postingStatus"]),
      reimbursementStatus: str(c["reimbursement_status"] ?? c["reimbursementStatus"]),
      paymentSource: str(c["payment_source"] ?? c["paymentSource"]),
      totalMinor: num(c["total_minor"] ?? c["totalMinor"]),
      reimbursableMinor: num(c["reimbursable_minor"] ?? c["reimbursableMinor"]),
    };
  });
}

export function mapExpenseClaimAuditEvents(row: unknown): ExpenseClaimAuditEvent[] {
  const r = asRecord(row);
  const events = Array.isArray(r["events"]) ? r["events"] : [];
  return events.map((item) => {
    const e = asRecord(item);
    return {
      id: str(e["id"]),
      claimId: str(e["claim_id"] ?? e["claimId"]),
      eventType: str(e["event_type"] ?? e["eventType"]),
      note: (e["note"] ?? null) as string | null,
      actedAt: str(e["acted_at"] ?? e["actedAt"]),
      approvalStatusAfter: (e["approval_status_after"] ?? e["approvalStatusAfter"] ?? null) as
        string | null,
    };
  });
}

/** Build a spreadsheet-safe claims export CSV. */
export function buildExpenseClaimsExportCsv(input: {
  rows: ExpenseClaimExportRow[];
  fromDate: string;
  toDate: string;
}): string {
  const headers = [
    "claim_number",
    "title",
    "claim_date",
    "currency",
    "approval_status",
    "posting_status",
    "reimbursement_status",
    "payment_source",
    "total",
    "reimbursable",
  ];
  const body = input.rows.map((row) => [
    row.claimNumber,
    row.title,
    row.claimDate,
    row.claimCurrency,
    row.approvalStatus,
    row.postingStatus,
    row.reimbursementStatus,
    row.paymentSource,
    minorToDecimalString(row.totalMinor),
    minorToDecimalString(row.reimbursableMinor),
  ]);
  return toCsv(headers, body);
}

export function defaultExpenseReportRange(todayIso = new Date().toISOString().slice(0, 10)): {
  fromDate: string;
  toDate: string;
} {
  const to = new Date(`${todayIso}T00:00:00.000Z`);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 90);
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: todayIso,
  };
}
