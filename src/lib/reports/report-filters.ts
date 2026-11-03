import { z } from "zod";
import { isReportDate } from "./date-validation";
export const FILTER_FIELDS = [
  "account_id",
  "account_code",
  "account_name",
  "account_type",
  "account_group",
  "journal_date",
  "source_type",
  "currency",
  "status",
  "memo",
  "description",
  "debit",
  "credit",
] as const;
export const FILTER_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "gt",
  "lt",
  "between",
  "empty",
  "not_empty",
  "in",
  "not_in",
] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];
export type FilterOperator = (typeof FILTER_OPERATORS)[number];
export const FILTER_LABELS: Record<FilterField, string> = {
  account_id: "Account",
  account_code: "Account code",
  account_name: "Account name",
  account_type: "Account type",
  account_group: "Assigned statement group",
  journal_date: "Journal date",
  source_type: "Transaction type",
  currency: "Original transaction currency",
  status: "Journal status",
  memo: "Journal memo",
  description: "Line description",
  debit: "Line debit (base currency)",
  credit: "Line credit (base currency)",
};
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "Equals",
  neq: "Does not equal",
  contains: "Contains",
  not_contains: "Does not contain",
  starts_with: "Starts with",
  ends_with: "Ends with",
  gt: "Greater than",
  lt: "Less than",
  between: "Between",
  empty: "Is empty",
  not_empty: "Is not empty",
  in: "In selected values",
  not_in: "Not in selected values",
};
const common: FilterOperator[] = ["eq", "neq", "in", "not_in", "empty", "not_empty"];
export function filterOperators(field: FilterField): FilterOperator[] {
  if (
    field === "account_id" ||
    ["account_type", "account_group", "source_type", "currency", "status"].includes(field)
  )
    return common;
  if (field === "journal_date" || field === "debit" || field === "credit")
    return [...common, "gt", "lt", "between"];
  return [...common, "contains", "not_contains", "starts_with", "ends_with"];
}
export function compareFilterDecimals(a: string, b: string): number {
  const parts = (value: string) => ({
    n: BigInt(value.replace(".", "")),
    d: 10n ** BigInt(value.split(".")[1]?.length ?? 0),
  });
  const x = parts(a),
    y = parts(b),
    difference = x.n * y.d - y.n * x.d;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
export const reportFilterSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .default(() => crypto.randomUUID()),
    field: z.enum(FILTER_FIELDS),
    op: z.enum(FILTER_OPERATORS),
    values: z
      .array(
        z
          .string()
          .trim()
          .max(200)
          .refine((v) => !v.includes("\0"), "Unsupported control character"),
      )
      .max(100)
      .default([]),
  })
  .transform((clause) => ({
    ...clause,
    // Only set-membership operators have unordered, duplicate-free values.
    // Range endpoints are positional: equal endpoints define a valid inclusive range.
    values:
      clause.op === "in" || clause.op === "not_in"
        ? [...new Set(clause.values.filter(Boolean))]
        : clause.values,
  }))
  .superRefine((clause, ctx) => {
    const error = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!filterOperators(clause.field).includes(clause.op))
      error("This operator is not supported for the selected field");
    const unary = clause.op === "empty" || clause.op === "not_empty",
      list = clause.op === "in" || clause.op === "not_in";
    if (
      unary
        ? clause.values.length !== 0
        : clause.op === "between"
          ? clause.values.length !== 2
          : list
            ? clause.values.length < 1
            : clause.values.length !== 1
    )
      error("Choose the required filter values");
    if (!unary && clause.values.some((v) => !v)) error("Enter a filter value");
    if (
      clause.field === "account_id" &&
      clause.values.some((v) => !z.string().uuid().safeParse(v).success)
    )
      error("Choose an actual account identifier");
    if (clause.field === "currency" && clause.values.some((v) => !/^[A-Za-z]{3}$/.test(v)))
      error("Use a three-letter currency code");
    if (clause.field === "journal_date" && clause.values.some((v) => !isReportDate(v)))
      error("Choose real calendar dates");
    const money = clause.field === "debit" || clause.field === "credit";
    if (money && clause.values.some((v) => !/^-?\d{1,18}(?:\.\d{1,6})?$/.test(v)))
      error("Enter an exact decimal amount without separators");
    if (clause.op === "between" && clause.values.length === 2) {
      const [a, b] = clause.values as [string, string];
      if (
        money &&
        clause.values.every((v) => /^-?\d{1,18}(?:\.\d{1,6})?$/.test(v)) &&
        compareFilterDecimals(a, b) > 0
      )
        error("The lower amount must not exceed the upper amount");
      if (clause.field === "journal_date" && a > b)
        error("The start date must not follow the end date");
    }
  });
export const reportFiltersSchema = z
  .object({
    logic: z.enum(["and", "or"]).default("and"),
    clauses: z.array(reportFilterSchema).max(30).default([]),
  })
  .superRefine((filters, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(filters)).length > 40000)
      ctx.addIssue({ code: "custom", message: "Report filters are too large" });
    if (new Set(filters.clauses.map((c) => c.id)).size !== filters.clauses.length)
      ctx.addIssue({ code: "custom", message: "Duplicate filter identifiers" });
  });
export type ReportFilter = z.infer<typeof reportFilterSchema>;
export type ReportFilters = z.infer<typeof reportFiltersSchema>;
export function filterFingerprint(filters: ReportFilters) {
  return JSON.stringify({
    logic: filters.logic,
    clauses: filters.clauses.map(({ field, op, values }) => ({ field, op, values })),
  });
}
export function describeReportFilters(
  filters: ReportFilters,
  accountNames: ReadonlyMap<string, string> = new Map(),
): string {
  return filters.clauses
    .map(
      (c) =>
        `${FILTER_LABELS[c.field]} ${OPERATOR_LABELS[c.op].toLowerCase()}${c.values.length ? " " + c.values.map((v) => (c.field === "account_id" ? (accountNames.get(v) ?? v) : v)).join(c.op === "between" ? " to " : ", ") : ""}`,
    )
    .join(filters.logic === "and" ? " AND " : " OR ");
}
