import { z } from "zod";
import { reportFiltersSchema } from "./report-filters";
import { isReportDate } from "./date-validation";
import { priorPeriodRange, priorYearRange } from "./statements";
import { addMonthsIso, monthEnd, monthStart } from "@/lib/accounting/fiscal-year";
import { add, evaluateFormula, fraction, type Fraction } from "./formula";
import { roundDiv } from "@/lib/budgets/budget-math";

const rowId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
export const customRowSchema = z.object({
  id: rowId,
  label: z.string().trim().min(1).max(160),
  kind: z.enum(["heading", "accounts", "group", "formula"]),
  accountIds: z.array(z.string().uuid()).max(500).default([]),
  accountTypes: z
    .array(z.enum(["asset", "liability", "equity", "income", "expense"]))
    .max(5)
    .default([]),
  children: z.array(rowId).max(150).default([]),
  formula: z.string().max(1000).default(""),
  indent: z.number().int().min(0).max(6).default(0),
  hidden: z.boolean().default(false),
  collapsed: z.boolean().default(false),
  format: z.enum(["money", "number", "percent"]).default("money"),
  decimals: z.number().int().min(0).max(6).default(2),
  negative: z.enum(["minus", "parentheses"]).default("parentheses"),
  sign: z.enum(["natural", "debit", "credit"]).default("natural"),
});
export const customColumnSchema = z.object({
  id: rowId,
  label: z.string().trim().min(1).max(100),
  mode: z.enum(["period", "prior_period", "prior_year", "month", "fixed", "calculated"]),
  monthOffset: z.number().int().min(-120).max(120).default(0),
  from: z.string().refine(isReportDate).optional(),
  to: z.string().refine(isReportDate).optional(),
  hidden: z.boolean().default(false),
  formula: z.string().max(1000).default(""),
  format: z.enum(["inherit", "money", "number", "percent"]).default("inherit"),
});
export const reportDisplaySchema = z.object({
  scale: z.enum(["1", "100", "1000", "1000000"]).default("1"),
  thousands: z.boolean().default(true),
  negativeRed: z.boolean().default(false),
  zero: z.enum(["zero", "dash", "blank"]).default("zero"),
  currencySymbol: z.boolean().default(false),
  rows: z.enum(["all", "non_zero", "zero"]).default("all"),
  columns: z.enum(["all", "non_zero"]).default("all"),
  sort: z.enum(["custom", "label_asc", "label_desc"]).default("custom"),
});
export const customDefinitionSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(80),
    subtitle: z.string().max(300).default(""),
    notes: z.string().max(4000).default(""),
    header: z.string().max(300).default(""),
    footer: z.string().max(300).default(""),
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    filters: reportFiltersSchema.default(() => reportFiltersSchema.parse({})),
    display: reportDisplaySchema.default(() => reportDisplaySchema.parse({})),
    rows: z.array(customRowSchema).min(1).max(150),
    columns: z.array(customColumnSchema).min(1).max(24),
  })
  .superRefine((value, ctx) => {
    for (const key of ["rows", "columns"] as const)
      if (new Set(value[key].map((r) => r.id)).size !== value[key].length)
        ctx.addIssue({ code: "custom", message: `Duplicate ${key} identifiers` });
    for (const column of value.columns)
      if (column.mode === "fixed" && (!column.from || !column.to || column.from > column.to))
        ctx.addIssue({ code: "custom", message: "Fixed columns require a valid date range" });
    const columnIds = new Set(value.columns.map((c) => c.id));
    for (const column of value.columns.filter((c) => c.mode === "calculated")) {
      try {
        evaluateFormula(column.formula, (id) => {
          if (!columnIds.has(id)) throw new Error(`Unknown column ${id}`);
          return fraction(1n);
        });
      } catch (e) {
        if (
          e instanceof Error &&
          (e.message !== "Division by zero" || !column.formula.includes("["))
        )
          ctx.addIssue({ code: "custom", message: `${column.label}: ${e.message}` });
      }
    }
    const columnGraph = new Map(
      value.columns.map((c) => [
        c.id,
        c.mode === "calculated"
          ? [...c.formula.matchAll(/\[([A-Za-z][A-Za-z0-9_-]*)\]/g)].map((m) => m[1]!)
          : [],
      ]),
    );
    const activeColumns = new Set<string>(),
      completeColumns = new Set<string>();
    function visitColumn(id: string) {
      if (completeColumns.has(id)) return;
      if (activeColumns.has(id)) {
        ctx.addIssue({ code: "custom", message: `Circular column reference involving ${id}` });
        return;
      }
      activeColumns.add(id);
      for (const dependency of columnGraph.get(id) ?? []) visitColumn(dependency);
      activeColumns.delete(id);
      completeColumns.add(id);
    }
    for (const id of columnGraph.keys()) visitColumn(id);
    const ids = new Set(value.rows.map((r) => r.id));
    for (const row of value.rows) {
      if (row.kind === "group" && (!row.children.length || row.children.some((id) => !ids.has(id))))
        ctx.addIssue({ code: "custom", message: `Group ${row.id} must reference existing rows` });
      if (row.kind === "formula")
        try {
          evaluateFormula(row.formula, (id) => {
            if (!ids.has(id)) throw new Error(`Unknown row ${id}`);
            return fraction(1n);
          });
        } catch (e) {
          if (
            e instanceof Error &&
            (e.message !== "Division by zero" || !row.formula.includes("["))
          )
            ctx.addIssue({ code: "custom", message: `${row.label}: ${e.message}` });
        }
    }
    const graph = new Map(
      value.rows.map((row) => [
        row.id,
        row.kind === "group"
          ? row.children
          : row.kind === "formula"
            ? [...row.formula.matchAll(/\[([A-Za-z][A-Za-z0-9_-]*)\]/g)].map((match) => match[1]!)
            : [],
      ]),
    );
    const active = new Set<string>(),
      complete = new Set<string>();
    function visit(id: string) {
      if (complete.has(id)) return;
      if (active.has(id)) {
        ctx.addIssue({ code: "custom", message: `Circular reference involving ${id}` });
        return;
      }
      active.add(id);
      for (const dependency of graph.get(id) ?? []) visit(dependency);
      active.delete(id);
      complete.add(id);
    }
    for (const id of graph.keys()) visit(id);
  });
export type CustomDefinition = z.infer<typeof customDefinitionSchema>;
export type CustomRow = z.infer<typeof customRowSchema>;
export type ReportAccount = {
  fs_line?: string | null;
  id: string;
  code: string;
  name: string;
  account_type: "asset" | "liability" | "equity" | "income" | "expense";
};
export type AccountBalance = { account_id: string; debit_minor: string; credit_minor: string };
export type CustomResultRow = {
  id: string;
  label: string;
  kind: string;
  indent: number;
  values: Array<{ n: string; d: string } | null>;
  format: CustomRow["format"];
  decimals: number;
  negative: CustomRow["negative"];
};

export function customColumns(definition: CustomDefinition, from: string, to: string) {
  return definition.columns.map((c) => {
    let range = { from, to };
    if (c.mode === "prior_period") range = priorPeriodRange(from, to);
    if (c.mode === "prior_year") range = priorYearRange(from, to);
    if (c.mode === "month") {
      const date = addMonthsIso(monthStart(from), c.monthOffset);
      range = { from: date, to: monthEnd(date) };
    }
    if (c.mode === "fixed") range = { from: c.from!, to: c.to! };
    return { ...c, ...range };
  });
}

/** Presentation only: inputs are already base-currency posted-ledger aggregates. */
export function executeCustomReport(
  definition: CustomDefinition,
  accounts: ReportAccount[],
  columns: AccountBalance[][],
  currencyDecimals = 2,
): CustomResultRow[] {
  if (!Number.isInteger(currencyDecimals) || currencyDecimals < 0 || currencyDecimals > 6)
    throw new Error("Unsupported currency precision");
  const unit = 10n ** BigInt(currencyDecimals);
  const def = customDefinitionSchema.parse(definition);
  if (columns.length !== def.columns.length)
    throw new Error("Report column data does not match configuration");
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const row of def.rows)
    for (const id of row.accountIds)
      if (!byId.has(id))
        throw new Error(`Account ${id} is not in this organisation's chart of accounts`);
  const rows = new Map(def.rows.map((r) => [r.id, r]));
  type Value = Fraction | null;
  class UnavailableDependency extends Error {}
  const requireValue = (v: Value): Fraction => {
    if (v === null) throw new UnavailableDependency("An input calculation is unavailable");
    return v;
  };
  function calculate(run: () => Fraction): Value {
    try {
      return run();
    } catch (error) {
      if (
        error instanceof UnavailableDependency ||
        (error instanceof Error && error.message === "Division by zero")
      )
        return null;
      throw error;
    }
  }
  const results: Array<Map<string, Value>> = columns.map((balances, index) => {
    if (def.columns[index]!.mode === "calculated")
      return new Map(def.rows.map((r) => [r.id, fraction(0n)]));
    const cache = new Map<string, Value>(),
      visiting = new Set<string>();
    const balanceMap = new Map(balances.map((b) => [b.account_id, b]));
    function value(id: string): Value {
      if (cache.has(id)) return cache.get(id)!;
      if (visiting.has(id)) throw new Error(`Circular reference involving ${id}`);
      const row = rows.get(id);
      if (!row) throw new Error(`Unknown row ${id}`);
      visiting.add(id);
      try {
        const result = calculate(() => {
          let amount = fraction(0n);
          if (row.kind === "accounts")
            for (const a of accounts) {
              if (!row.accountIds.includes(a.id) && !row.accountTypes.includes(a.account_type))
                continue;
              const b = balanceMap.get(a.id);
              if (!b) continue;
              const debit = BigInt(b.debit_minor),
                credit = BigInt(b.credit_minor);
              const creditNormal =
                row.sign === "credit" ||
                (row.sign === "natural" &&
                  ["income", "liability", "equity"].includes(a.account_type));
              amount = add(amount, fraction(creditNormal ? credit - debit : debit - credit, unit));
            }
          if (row.kind === "group")
            for (const child of row.children) amount = add(amount, requireValue(value(child)));
          if (row.kind === "formula")
            amount = evaluateFormula(row.formula, (id) => requireValue(value(id)));
          return amount;
        });
        cache.set(id, result);
        return result;
      } finally {
        visiting.delete(id);
      }
    }
    for (const row of def.rows) value(row.id);
    return cache;
  });
  const byColumnId = new Map(def.columns.map((c, i) => [c.id, i]));
  const calculated = new Set<number>(),
    calculating = new Set<number>();
  function calculateColumn(index: number): Map<string, Value> {
    const column = def.columns[index]!;
    if (column.mode !== "calculated" || calculated.has(index)) return results[index]!;
    if (calculating.has(index)) throw new Error(`Circular column reference involving ${column.id}`);
    calculating.add(index);
    for (const row of def.rows) {
      if (row.kind === "heading") continue;
      results[index]!.set(
        row.id,
        calculate(() =>
          evaluateFormula(column.formula, (id) => {
            const target = byColumnId.get(id);
            if (target === undefined) throw new Error(`Unknown column ${id}`);
            return requireValue(calculateColumn(target).get(row.id)!);
          }),
        ),
      );
    }
    calculating.delete(index);
    calculated.add(index);
    return results[index]!;
  }
  for (let i = 0; i < def.columns.length; i++) calculateColumn(i);
  return def.rows
    .filter((r) => !r.hidden)
    .map((row) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      indent: row.indent,
      format: row.format,
      decimals: row.decimals,
      negative: row.negative,
      values: results.map((col) => {
        const v = col.get(row.id)!;
        return v === null ? null : { n: v.n.toString(), d: v.d.toString() };
      }),
    }));
}

export function decimalValue(
  value: { n: string; d: string },
  decimals: number,
  scale = 1n,
): string {
  const minor = roundDiv(BigInt(value.n) * 10n ** BigInt(decimals) * scale, BigInt(value.d));
  const abs = minor < 0n ? -minor : minor;
  const s = abs.toString().padStart(decimals + 1, "0");
  return `${minor < 0n ? "-" : ""}${decimals ? s.slice(0, -decimals) + "." + s.slice(-decimals) : s}`;
}
export function starterDefinition(title = "Custom financial report"): CustomDefinition {
  return customDefinitionSchema.parse({
    version: 1,
    title,
    columns: [{ id: "current", label: "Selected period", mode: "period" }],
    rows: [
      { id: "revenue", label: "Revenue", kind: "accounts", accountTypes: ["income"] },
      { id: "expenses", label: "Expenses", kind: "accounts", accountTypes: ["expense"] },
      { id: "net", label: "Net profit", kind: "formula", formula: "[revenue] - [expenses]" },
      {
        id: "margin",
        label: "Net margin",
        kind: "formula",
        formula: "[net] / [revenue]",
        format: "percent",
      },
    ],
  });
}
