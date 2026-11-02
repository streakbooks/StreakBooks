import { describe, expect, it } from "vitest";
import { evaluateFormula, fraction } from "./formula";
const values = { revenue: fraction(15000n), cost: fraction(4000n) };
const resolve = (id: string) => {
  const v = values[id as keyof typeof values];
  if (!v) throw new Error("Unknown row");
  return v;
};
describe("safe financial formulas", () => {
  it("uses precedence, references, unary signs and exact rational arithmetic", () => {
    expect(evaluateFormula("[revenue] - [cost] * 2", resolve)).toEqual(fraction(7000n));
    expect(evaluateFormula("([revenue] - [cost]) / [revenue]", resolve)).toEqual(
      fraction(11n, 15n),
    );
    expect(evaluateFormula("-0.1 + 0.2", resolve)).toEqual(fraction(1n, 10n));
  });
  it.each([
    "process.exit()",
    "globalThis",
    "[constructor]",
    "1; DROP TABLE journals",
    "1/**/2",
    "Math.max(1,2)",
    "1e1000",
    "__proto__",
    "[revenue].toString()",
  ])("rejects executable or unsupported input %s", (input) =>
    expect(() => evaluateFormula(input, resolve)).toThrow(),
  );
  it.each(["1/0", "([revenue]", "1 2", "[unknown]"])("rejects invalid calculation %s", (input) =>
    expect(() => evaluateFormula(input, resolve)).toThrow(),
  );
  it("bounds token count, nesting and numeric growth", () => {
    expect(() => evaluateFormula("1+".repeat(101) + "1", resolve)).toThrow();
    expect(() => evaluateFormula("(".repeat(50) + "1" + ")".repeat(50), resolve)).toThrow();
    expect(() => evaluateFormula("9".repeat(81), resolve)).toThrow();
  });
});
