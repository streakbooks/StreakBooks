/** A bounded arithmetic parser. No eval, functions, property access, SQL or executable code. */
export type Fraction = { n: bigint; d: bigint };
const MAX = 10n ** 80n;
function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}
export function fraction(n: bigint, d = 1n): Fraction {
  if (!d) throw new Error("Division by zero");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  n /= g;
  d /= g;
  if (n > MAX || n < -MAX || d > MAX) throw new Error("Formula result exceeds the supported range");
  return { n, d };
}
export function add(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d + b.n * a.d, a.d * b.d);
}
export function negate(a: Fraction): Fraction {
  return fraction(-a.n, a.d);
}
export function multiply(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.n, a.d * b.d);
}
export function divide(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d, a.d * b.n);
}
export function evaluateFormula(source: string, resolve: (id: string) => Fraction): Fraction {
  if (!source.trim() || source.length > 1000)
    throw new Error("Enter a formula of 1–1000 characters");
  const tokens =
    source.match(/\[[A-Za-z][A-Za-z0-9_-]{0,63}\]|\d+(?:\.\d{1,8})?|[()+*/-]|\S/g) ?? [];
  if (tokens.length > 200) throw new Error("Formula is too complex");
  let at = 0;
  function expression(depth: number): Fraction {
    let value = term(depth + 1);
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++];
      const right = term(depth + 1);
      value = add(value, op === "-" ? negate(right) : right);
    }
    return value;
  }
  function term(depth: number): Fraction {
    let value = atom(depth + 1);
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++];
      const right = atom(depth + 1);
      value = op === "*" ? multiply(value, right) : divide(value, right);
    }
    return value;
  }
  function atom(depth: number): Fraction {
    if (depth > 40) throw new Error("Formula nesting is too deep");
    const token = tokens[at++];
    if (token === "+") return atom(depth + 1);
    if (token === "-") return negate(atom(depth + 1));
    if (token === "(") {
      const value = expression(depth + 1);
      if (tokens[at++] !== ")") throw new Error("Missing closing parenthesis");
      return value;
    }
    if (token?.startsWith("[") && token.endsWith("]")) {
      const value = resolve(token.slice(1, -1));
      if (typeof value?.n !== "bigint" || typeof value?.d !== "bigint")
        throw new Error("Invalid row reference value");
      return fraction(value.n, value.d);
    }
    if (token && /^\d+(\.\d{1,8})?$/.test(token)) {
      const [whole, decimals = ""] = token.split(".");
      return fraction(BigInt(whole! + decimals), 10n ** BigInt(decimals.length));
    }
    throw new Error("Expected a number, [row_id], or parenthesis");
  }
  const result = expression(0);
  if (at !== tokens.length) throw new Error("Unexpected formula token");
  return result;
}
