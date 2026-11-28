import type { ExpenseClaimLineInput } from "./claims";
import type { ExpensePaymentSource } from "./types";

export type ExpenseClaimTemplate = {
  id: string;
  name: string;
  titleTemplate: string;
  descriptionTemplate: string | null;
  claimCurrency: string | null;
  paymentSource: ExpensePaymentSource;
  defaultLines: ExpenseClaimLineInput[];
};

export function isExpenseClaimTemplateCompatible(
  template: Pick<ExpenseClaimTemplate, "claimCurrency">,
  claimCurrency: string,
  baseCurrency: string,
): boolean {
  return (template.claimCurrency ?? baseCurrency).toUpperCase() === claimCurrency.toUpperCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function mapTemplateLine(row: unknown): ExpenseClaimLineInput {
  const r = asRecord(row);
  const netMinor = num(r["net_minor"] ?? r["netMinor"]);
  const taxMinor = num(r["tax_minor"] ?? r["taxMinor"]);
  const grossMinor = num(r["gross_minor"] ?? r["grossMinor"] ?? netMinor + taxMinor);
  const merchantName = str(r["merchant_name"] ?? r["merchantName"]);
  const currencyCode = str(r["currency_code"] ?? r["currencyCode"]);
  return {
    expenseDate: str(r["expense_date"] ?? r["expenseDate"], new Date().toISOString().slice(0, 10)),
    ...(merchantName ? { merchantName } : {}),
    description: str(r["description"], "Expense"),
    accountId: str(r["account_id"] ?? r["accountId"]),
    netMinor,
    taxMinor,
    grossMinor,
    ...(currencyCode ? { currencyCode } : {}),
    reimbursableMinor: num(r["reimbursable_minor"] ?? r["reimbursableMinor"] ?? grossMinor),
    nonReimbursableMinor: num(r["non_reimbursable_minor"] ?? r["nonReimbursableMinor"] ?? 0),
    isBillable: Boolean(r["is_billable"] ?? r["isBillable"]),
  };
}

export function mapExpenseClaimTemplate(row: unknown): ExpenseClaimTemplate {
  const r = asRecord(row);
  const linesRaw = Array.isArray(r["default_lines"])
    ? r["default_lines"]
    : Array.isArray(r["defaultLines"])
      ? r["defaultLines"]
      : [];
  return {
    id: str(r["id"]),
    name: str(r["name"]),
    titleTemplate: str(r["title_template"] ?? r["titleTemplate"]),
    descriptionTemplate: (r["description_template"] ?? r["descriptionTemplate"] ?? null) as
      string | null,
    claimCurrency: (r["claim_currency"] ?? r["claimCurrency"] ?? null) as string | null,
    paymentSource: str(
      r["payment_source"] ?? r["paymentSource"],
      "employee_paid",
    ) as ExpensePaymentSource,
    defaultLines: linesRaw.map(mapTemplateLine),
  };
}

export function toExpenseClaimTemplatePayload(input: {
  id?: string;
  name: string;
  titleTemplate?: string;
  descriptionTemplate?: string | null;
  claimCurrency?: string | null;
  paymentSource?: ExpensePaymentSource;
  defaultLines: ExpenseClaimLineInput[];
}): Record<string, unknown> {
  return {
    id: input.id ?? null,
    name: input.name,
    title_template: input.titleTemplate ?? "",
    description_template: input.descriptionTemplate ?? null,
    claim_currency: input.claimCurrency ?? null,
    payment_source: input.paymentSource ?? "employee_paid",
    default_lines: input.defaultLines.map((line) => ({
      expense_date: line.expenseDate,
      merchant_name: line.merchantName ?? null,
      description: line.description,
      account_id: line.accountId,
      net_minor: line.netMinor,
      tax_minor: line.taxMinor,
      gross_minor: line.grossMinor,
      currency_code: line.currencyCode ?? null,
      reimbursable_minor: line.reimbursableMinor ?? line.grossMinor,
      non_reimbursable_minor: line.nonReimbursableMinor ?? 0,
      is_billable: line.isBillable ?? false,
    })),
  };
}
