import { describe, expect, it } from "vitest";
import {
  customDefinitionSchema,
  executeCustomReport,
  starterDefinition,
  customColumns,
  decimalValue,
} from "./custom-definition";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const accounts = [
  { id: a, code: "4000", name: "Revenue", account_type: "income" as const },
  { id: b, code: "6000", name: "Expense", account_type: "expense" as const },
];
const balances = [
  { account_id: a, debit_minor: "0", credit_minor: "15000" },
  { account_id: b, debit_minor: "4000", credit_minor: "0" },
];
describe("custom report execution", () => {
  it("reconciles account selection, formulas and margins to ledger facts", () => {
    const rows = executeCustomReport(starterDefinition(), accounts, [balances]);
    expect(rows[2]!.values[0]).toEqual({ n: "110", d: "1" });
    expect(rows[3]!.values[0]).toEqual({ n: "11", d: "15" });
  });
  it("interprets monetary constants in report currency units for two-, zero- and three-decimal currencies", () => {
    const def = starterDefinition();
    def.rows[2]!.formula = "[revenue] - [expenses] + 100";
    expect(executeCustomReport(def, accounts, [balances])[2]!.values[0]).toEqual({
      n: "210",
      d: "1",
    });
    expect(executeCustomReport(def, accounts, [balances], 0)[2]!.values[0]).toEqual({
      n: "11100",
      d: "1",
    });
    expect(executeCustomReport(def, accounts, [balances], 3)[2]!.values[0]).toEqual({
      n: "111",
      d: "1",
    });
  });
  it("calculates nested variance and percentage columns from exact period values", () => {
    const def = customDefinitionSchema.parse({
      ...starterDefinition(),
      columns: [
        { id: "current", label: "Actual", mode: "period" },
        { id: "prior", label: "Prior", mode: "prior_period" },
        { id: "variance", label: "Variance", mode: "calculated", formula: "[current]-[prior]" },
        {
          id: "percent",
          label: "Variance %",
          mode: "calculated",
          formula: "[variance]/[prior]",
          format: "percent",
        },
      ],
    });
    const previous = [
      { account_id: a, debit_minor: "0", credit_minor: "10000" },
      { account_id: b, debit_minor: "2000", credit_minor: "0" },
    ];
    const net = executeCustomReport(def, accounts, [balances, previous, [], []])[2]!;
    expect(net.values).toEqual([
      { n: "110", d: "1" },
      { n: "80", d: "1" },
      { n: "30", d: "1" },
      { n: "3", d: "8" },
    ]);
    def.columns[2]!.formula = "[percent]";
    expect(() => customDefinitionSchema.parse(def)).toThrow("Circular column");
    def.columns[2]!.formula = "[missing]";
    expect(() => customDefinitionSchema.parse(def)).toThrow("Unknown column");
  });
  it("keeps zero-denominator ratios unavailable and propagates them without losing valid balances", () => {
    const definition = starterDefinition();
    definition.rows.push({
      ...definition.rows[0]!,
      id: "dependent",
      label: "Dependent subtotal",
      kind: "group",
      children: ["margin", "net"],
    });
    const empty = executeCustomReport(definition, accounts, [[]]);
    expect(empty[2]!.values[0]).toEqual({ n: "0", d: "1" });
    expect(empty[3]!.values[0]).toBeNull();
    expect(empty[4]!.values[0]).toBeNull();
    const expenseOnly = executeCustomReport(starterDefinition(), accounts, [[balances[1]!]]);
    expect(expenseOnly[2]!.values[0]).toEqual({ n: "-40", d: "1" });
    expect(expenseOnly[3]!.values[0]).toBeNull();
    definition.rows[2]!.formula = "1/0";
    expect(() => customDefinitionSchema.parse(definition)).toThrow("Division by zero");
  });
  it("does not invent a percentage when the comparison column is zero", () => {
    const definition = customDefinitionSchema.parse({
      ...starterDefinition(),
      columns: [
        { id: "current", label: "Current", mode: "period" },
        { id: "prior", label: "Prior", mode: "prior_period" },
        {
          id: "change",
          label: "Change %",
          mode: "calculated",
          formula: "([current]-[prior])/[prior]",
          format: "percent",
        },
      ],
    });
    const result = executeCustomReport(definition, accounts, [balances, [], []]);
    expect(result[2]!.values).toEqual([{ n: "110", d: "1" }, { n: "0", d: "1" }, null]);
  });
  it("sums nested groups, respects output order and calculates hidden dependencies", () => {
    const def = starterDefinition();
    def.rows[0]!.hidden = true;
    def.rows[3]!.hidden = true;
    def.rows.push({
      ...def.rows[0]!,
      hidden: false,
      id: "subtotal",
      label: "Gross contribution",
      kind: "group",
      children: ["net"],
    });
    const rows = executeCustomReport(def, accounts, [balances]);
    expect(rows.map((r) => r.id)).toEqual(["expenses", "net", "subtotal"]);
    expect(rows.at(-1)!.values[0]!.n).toBe("110");
  });
  it("never silently selects an account from another tenant", () => {
    const def = starterDefinition();
    def.rows[0]!.accountIds = ["33333333-3333-4333-8333-333333333333"];
    expect(() => executeCustomReport(def, accounts, [balances])).toThrow("chart of accounts");
  });
  it("rejects circular formulas and groups including hidden rows", () => {
    const def = starterDefinition();
    def.rows[2]!.formula = "[margin]";
    expect(() => executeCustomReport(def, accounts, [balances])).toThrow("Circular reference");
  });
  it("rejects duplicate identifiers, missing references and invalid fixed periods", () => {
    const def = starterDefinition();
    def.rows.push(def.rows[0]!);
    expect(() => customDefinitionSchema.parse(def)).toThrow();
    def.rows.pop();
    def.rows[2]!.formula = "[missing]";
    expect(() => customDefinitionSchema.parse(def)).toThrow();
  });
  it("calculates exact comparative boundaries and leap-year month columns", () => {
    const def = starterDefinition();
    def.columns = customDefinitionSchema.parse({
      ...def,
      columns: [
        { id: "last", label: "Prior period", mode: "prior_period" },
        { id: "month", label: "Month", mode: "month", monthOffset: 1 },
        { id: "year", label: "Last year", mode: "prior_year" },
      ],
    }).columns;
    const cols = customColumns(def, "2024-01-01", "2024-01-31");
    expect(cols.map((c) => [c.from, c.to])).toEqual([
      ["2023-12-01", "2023-12-31"],
      ["2024-02-01", "2024-02-29"],
      ["2023-01-01", "2023-01-31"],
    ]);
  });
  it("rounds final display values half away from zero without losing large integers", () => {
    expect(decimalValue({ n: "-1", d: "8" }, 2)).toBe("-0.13");
    expect(decimalValue({ n: "12345678901234567890", d: "100" }, 2)).toBe("123456789012345678.90");
  });
});
