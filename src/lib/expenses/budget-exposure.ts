export type ExpenseBudgetExposureRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  budgetId: string;
  budgetName: string;
  periodMonth: string;
  budgetAmountMinor: number;
  openClaimMinor: number;
};

export type ExpenseBudgetExposure = {
  asOf: string;
  periodMonth: string;
  rows: ExpenseBudgetExposureRow[];
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

export function mapExpenseBudgetExposure(row: unknown): ExpenseBudgetExposure {
  const r = asRecord(row);
  const rows = Array.isArray(r["rows"]) ? r["rows"] : [];
  return {
    asOf: str(r["as_of"] ?? r["asOf"]),
    periodMonth: str(r["period_month"] ?? r["periodMonth"]),
    rows: rows.map((item) => {
      const x = asRecord(item);
      return {
        accountId: str(x["account_id"] ?? x["accountId"]),
        accountCode: str(x["account_code"] ?? x["accountCode"]),
        accountName: str(x["account_name"] ?? x["accountName"]),
        budgetId: str(x["budget_id"] ?? x["budgetId"]),
        budgetName: str(x["budget_name"] ?? x["budgetName"]),
        periodMonth: str(x["period_month"] ?? x["periodMonth"]),
        budgetAmountMinor: num(x["budget_amount_minor"] ?? x["budgetAmountMinor"]),
        openClaimMinor: num(x["open_claim_minor"] ?? x["openClaimMinor"]),
      };
    }),
  };
}

export function isBudgetOverExposed(row: ExpenseBudgetExposureRow): boolean {
  return row.openClaimMinor > row.budgetAmountMinor;
}
