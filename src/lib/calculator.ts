/** A deliberately small arithmetic parser. Never executes JavaScript. */
export function calculate(expression: string): number {
  const source = expression
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/\s/g, "");
  if (!source || source.length > 300) throw new Error("Enter a calculation.");
  let pos = 0;
  function primary(): number {
    if (source[pos] === "+") {
      pos++;
      return primary();
    }
    if (source[pos] === "-") {
      pos++;
      return -primary();
    }
    let value: number;
    if (source[pos] === "(") {
      pos++;
      value = sum();
      if (source[pos++] !== ")") throw new Error("Close the parentheses.");
    } else {
      const match = source.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
      if (!match) throw new Error("Check your calculation.");
      pos += match[0].length;
      value = Number(match[0]);
    }
    while (source[pos] === "%") {
      pos++;
      value /= 100;
    }
    return value;
  }
  function product(): number {
    let value = primary();
    while (source[pos] === "*" || source[pos] === "/") {
      const op = source[pos++];
      const right = primary();
      if (op === "/" && right === 0) throw new Error("Cannot divide by zero.");
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (source[pos] === "+" || source[pos] === "-") {
      const op = source[pos++];
      const right = product();
      // Accounting convention: 200 + 10% = 220, 200 - 10% = 180.
      const amount = source[pos - 1] === "%" ? value * right : right;
      value = op === "+" ? value + amount : value - amount;
    }
    return value;
  }
  const result = sum();
  if (pos !== source.length) throw new Error("Check your calculation.");
  if (!Number.isFinite(result)) throw new Error("Result is too large.");
  return Number(result.toPrecision(12));
}
