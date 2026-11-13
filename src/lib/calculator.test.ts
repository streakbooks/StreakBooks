import { describe, expect, it } from "vitest";
import { calculate } from "./calculator";
describe("calculator", () => {
  it.each([
    ["2+3*4", 14],
    ["(2+3)*4", 20],
    ["0.1+0.2", 0.3],
    ["200+10%", 220],
    ["200-10%", 180],
    ["200*10%", 20],
    ["120÷1.2", 100],
    ["-(12+3)", -15],
    [".5×8", 4],
    ["1e3+1", 1001],
  ])("%s = %s", (expression, expected) => expect(calculate(expression)).toBe(expected));
  it.each(["1/0", "1+", "alert(1)", "2(3)", "(1+2", ""])("rejects %s", (expression) =>
    expect(() => calculate(expression)).toThrow(),
  );
});
